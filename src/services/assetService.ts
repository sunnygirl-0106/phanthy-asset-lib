/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【服务层 · 资产流转】assetService.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把资产在三层之间的四个「动作」——
 *   直接复用 / 收藏 / 复用 / 存入 —— 实现成「拿一份资产、算出一份新资产」的纯函数。
 *
 * 【v4 改动】原来还有一整套「跟随线」逻辑（断链、母版消失降级），已全部删除。
 * 因为广场母版上架后不可编辑（只能删/下架/重传），母版内容永不变，跟随失去意义。
 * 现在层与层之间就是干脆的「拷贝」：往下拉一层 = 一份独立副本，masterId 记血缘、仅此而已。
 *
 * 全篇要守住的两条底层规则：
 *   1. 底层是「拷贝」：往下拉一层，得到一个独立副本；用 masterId 记录血缘。
 *   2. 副本天然独立：拿到手就是自己的，母版之后被删/下架都不影响它。
 *
 * 【0810 流转下沉到图】上行（存入团队库 / 贡献广场）不再是"整份资产出库"，
 * 而是某一张图的动作：调用方选一张图、起个名字，打包成 FlatImagePayload 送出去。
 *   · 下行三动作（directReuse / favorite / reuse）仍是"整份资产拷贝"，守卫是 assertHasImage。
 *   · 上行两动作（deposit / contributeToPlaza）吃 FlatImagePayload，守卫是 assertPayload。
 * 旧红线"只有 done 才能流转"随 pending 一起退场——"这张图存不存在"由调用方选图时就保证了。
 * ─────────────────────────────────────────────────────────────────────── */

import type { Asset, AssetRef, Candidate, FlatImagePayload, User, World } from '../data/types'
import { depositMode } from './permission'

/* ─── 一、一个专门的错误类型：违反业务规则时抛它 ───
 * 用一个自定义 Error，方便调用方（和测试）识别"这是业务规则挡住的，不是程序崩了"。 */
export class AssetRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetRuleError'
  }
}

/* ─── 二、两个内部小工具 ─── */

// 简单的自增 id 生成器。真实后端会用数据库自增或 UUID；Demo 里这样够用且可预测。
let _seq = 1
export function makeId(prefix: string): string {
  return `${prefix}_${_seq++}`
}

/**
 * 把一份资产「拷贝」成一份新的独立副本（副本的公共部分都在这里）。
 * overrides 用来覆盖 scope / scopeId 等每个动作各自不同的字段。
 *
 * 注意几个"本地字段"的处理，正好对应产品规则：
 *   - name / tags 是本地的：拷贝一份新的，之后随便改，不影响母版。
 *   - masterId 指向来源，记录血缘（纯信息）。
 *
 * 【0803 流转口径】跨层流转只带**定稿图**，候选池不跟着走：
 *   候选是生产过程的中间物、属于原始库；副本拿到的是成品，所以 candidates / referenceImages
 *   一律不拷（副本干净、项目库不被一堆废料弄脏）。
 */
function cloneForCopy(source: Asset, overrides: Partial<Asset>): Asset {
  const copy: Asset = {
    id: makeId('asset'),
    category: source.category,
    name: source.name, // 本地副本，可改
    scope: source.scope, // 会被 overrides 覆盖
    scopeId: source.scopeId, // 会被 overrides 覆盖
    status: 'done', // 能被拷贝的必然是成品
    masterId: source.id, // ← 血缘：从谁拷来的
    prompt: source.prompt, // ← 提示词随图走
    cover: source.cover, // ← 只带定稿图
    fields: { ...source.fields }, // 复制一份，避免和母版共享同一个对象
    tags: [...source.tags], // 同上，本地标签独立
    voice: source.voice ? { ...source.voice } : undefined, // 音色是锚点、必带、深拷贝
    createdAt: Date.now(),
    ...overrides,
  }
  return copy
}

/** 取一份资产对外展示的图：定稿优先；有图必有定稿，兜底再取候选池第一张。 */
export function coverOf(asset: Pick<Asset, 'cover' | 'candidates'>): string {
  return asset.cover || asset.candidates?.[0]?.url || ''
}

/* ─── 二·五、参考槽解析（0812）──────────────────────────────────────────
 * 把「槽当前解析成什么」这件事收在一处。所有页面只读这里，不要各自判断。
 * 两种槽（见 types.AssetRef）：
 *   · image —— 恒 ready，label 留空（那张图本来就没有名字）
 *   · asset —— 随上游状态活着：上游没了 → missing；上游没出图 → pending；上游定稿 → ready */

/** 一个参考槽在当前 world 下解析成什么。 */
export type ResolvedRef =
  | { state: 'ready';   url: string;  label?: string; assetId?: string }
  | { state: 'pending'; label: string; assetId: string }  // 上游还在，但没出图
  | { state: 'missing'; label: string; assetId: string }  // 上游已被整份删除

/** 解析一份资产的全部参考槽（下标与 references 对齐）。 */
export function resolveRefs(world: World, a: Asset): ResolvedRef[] {
  const refs = a.references ?? []
  return refs.map((ref) => resolveRef(world, ref))
}

function resolveRef(world: World, ref: AssetRef): ResolvedRef {
  if (ref.kind === 'image') {
    return { state: 'ready', url: ref.url }
  }
  const up = world.assets.find((x) => x.id === ref.assetId)
  if (!up) return { state: 'missing', label: '已删除', assetId: ref.assetId }
  if (up.status !== 'done' || !up.cover) return { state: 'pending', label: up.name, assetId: ref.assetId }
  return { state: 'ready', url: up.cover, label: up.name, assetId: ref.assetId }
}

/** 还没就位的槽（pending + missing，两者都带 assetId）。空数组 = 全部就位。 */
export function pendingRefs(world: World, a: Asset): Exclude<ResolvedRef, { state: 'ready' }>[] {
  return resolveRefs(world, a).filter(
    (r): r is Exclude<ResolvedRef, { state: 'ready' }> => r.state !== 'ready',
  )
}

/** 全部就位？没挂槽的资产恒为 true。 */
export function refsReady(world: World, a: Asset): boolean {
  return pendingRefs(world, a).length === 0
}

/** 出图时真正拿得到的参考图 url —— 只有 ready 的槽算数。 */
export function usableRefUrls(world: World, a: Asset): string[] {
  return resolveRefs(world, a)
    .filter((r): r is Extract<ResolvedRef, { state: 'ready' }> => r.state === 'ready')
    .map((r) => r.url)
}

/**
 * 加参考槽前的环检测：a 参考 target 会不会成环。
 * 沿资产级槽（kind:'asset'）向上游追溯：若从 target 出发能回到 a，就会成环。
 * 只有资产级槽会形成依赖边；图级槽是死的 url，永远不成环。
 */
export function wouldCycle(world: World, aId: string, targetId: string): boolean {
  if (aId === targetId) return true
  const byId = new Map(world.assets.map((x) => [x.id, x] as const))
  const seen = new Set<string>()
  const stack = [targetId]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === aId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    const asset = byId.get(cur)
    for (const ref of asset?.references ?? []) {
      if (ref.kind === 'asset') stack.push(ref.assetId)
    }
  }
  return false
}

/**
 * 从候选池删一张（不可变）。0807：把状态跃迁一并收进来。
 *   · 删的不是定稿 → 池少一张，status / cover 不动。
 *   · 删的是定稿、池里还有别的 → 顶第一张上来当新定稿，仍是 done（规则 18：定稿只能换不能删）。
 *   · 删掉最后一张 → 池空、cover 空、status → 'empty'（降级成空壳，提示词等一概保留）。
 */
export function removeCandidate(source: Asset, candidateId: string): Asset {
  const removed = source.candidates?.find((c) => c.id === candidateId)
  if (!removed) throw new AssetRuleError('候选图不存在')
  const rest = (source.candidates ?? []).filter((c) => c.id !== candidateId)
  if (rest.length === 0) {
    return { ...source, candidates: undefined, cover: '', status: 'empty' }
  }
  const removedWasFinal = !!source.cover && removed.url === source.cover
  return {
    ...source,
    candidates: rest,
    cover: removedWasFinal ? rest[0].url : source.cover,
  }
}

/**
 * 把候选池里的某张设为定稿（不可变）。0810：设定稿 = 换 cover 指向、恒 done。
 * 有图必有定稿，所以这里永远是"换定稿"，不存在从"无定稿"跃迁的情况。
 */
export function setFinal(source: Asset, candidateId: string): Asset {
  const target = source.candidates?.find((c) => c.id === candidateId)
  if (!target) throw new AssetRuleError('候选图不存在')
  return { ...source, cover: target.url, status: 'done' }
}

/** 造一个候选图（自增 id，够 Demo 用且可预测）。 */
export function makeCandidate(url: string, prompt?: string): Candidate {
  return { id: makeId('cand'), url, prompt, createdAt: Date.now() }
}

/** 校验一张图的出库载荷是否合法（0810）。 */
function assertPayload(p: FlatImagePayload, target: '团队库' | '素材广场'): void {
  if (!p.url) throw new AssetRuleError('没有可提交的图片。')
  if (!p.name.trim()) throw new AssetRuleError('请先给这张素材起个名字。')
  if (p.category === 'other') {
    throw new AssetRuleError(
      target === '素材广场'
        ? '「其他」类目不能贡献到素材广场。'
        : '「其他」类目仅存在于项目资产库，不能存入团队库。',
    )
  }
}

/** 下行动作（直接复用 / 收藏 / 复用）的朴素守卫：没有图就不能整份拷走。 */
function assertHasImage(source: Asset, action: string): void {
  if (!source.cover) {
    throw new AssetRuleError(`资产「${source.name}」还没有图片，不能${action}。`)
  }
}

/** 这个 url 是不是这份资产的图（定稿或图片列表里的任意一张，按去后缀的裸地址比）。 */
export function imageBelongsTo(asset: Asset, url: string): boolean {
  const bare = (u: string) => u.split('?')[0]
  const k = bare(url)
  if (asset.cover && bare(asset.cover) === k) return true
  return (asset.candidates ?? []).some((c) => bare(c.url) === k)
}

/**
 * 扁平化落库（0810）：把一张图落成团队库 / 广场里的一份独立素材。
 *
 * 【丢掉】图片列表(candidates) / 参考槽(references) /
 *         来源(referencedFrom) / 血缘(masterId) / 状态机（永远 done）
 * 【带走】图、名称、类目、提示词、音色（角色）
 *
 * 为什么提示词一定要带走：它是这张图作为"可复用素材"最值钱的部分——
 * 别人复用回项目库时能直接照着重新生成。进广场后随图一起冻结、不可编辑。
 */
export function flattenToLibrary(
  payload: FlatImagePayload,
  target:
    | { scope: 'team'; scopeId: string }
    | { scope: 'plaza'; contributedBy: string },
): Asset {
  return {
    id: makeId('asset'),
    category: payload.category,
    name: payload.name.trim(),
    scope: target.scope,
    scopeId: target.scope === 'team' ? target.scopeId : undefined,
    status: 'done',
    masterId: undefined,          // 它自己就是这一层的母版
    prompt: payload.prompt,
    cover: payload.url,
    candidates: undefined,        // ← 扁平：没有图片列表
    references: undefined,         // ← 扁平：没有参考槽（0812）
    referencedFrom: undefined,
    fields: {},
    tags: [],
    voice: payload.voice ? { ...payload.voice } : undefined,
    contributedBy: target.scope === 'plaza' ? target.contributedBy : undefined,
    shelfStatus: target.scope === 'plaza' ? 'listed' : undefined,
    createdAt: Date.now(),
  }
}

/* ─── 三、四个下行/上行动作 ───────────────────────────────────────── */

/**
 * 直接复用：广场 → 项目。随手用，产生一份独立副本（快照）。
 * 【0803】只带定稿图，候选池不跟着走。includeVoice 默认 true；显式 false 时不带音色。
 */
export function directReuse(
  source: Asset,
  targetProjectId: string,
  includeVoice = true,
): Asset {
  assertHasImage(source, '直接复用')
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
    voice: includeVoice ? (source.voice ? { ...source.voice } : undefined) : undefined,
  })
}

/**
 * 收藏：广场 → 团队库。由主账号打理，拿到手就是一份独立副本（只带定稿图）。
 * （v4：收藏 = 直接拷进团队库，不再有"跟随/不跟随"的选择。）
 */
export function favorite(source: Asset, targetTeamId: string): Asset {
  assertHasImage(source, '收藏')
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
  })
}

/**
 * 复用：团队库 → 项目。同样是一份独立副本（只带定稿图）。
 */
export function reuse(source: Asset, targetProjectId: string): Asset {
  assertHasImage(source, '复用')
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
  })
}

/**
 * 存入团队库（0810 · 按图）：把一张图送进团队资产库。
 *   · 主账号 → 直接落一份团队素材 { kind:'asset', asset }
 *   · 子账号 → 只生成一条待审批申请 { kind:'application', ... }
 *   · admin  → 抛错
 * 调用方拿到结果后，用 result.kind 判断该"入库"还是"进待审批列表"。
 */
/**
 * 一条"子账号资产存入申请"（0810 · 携带图片快照）。
 * status 会随审批走：pending（待批）→ approved（通过）/ rejected（驳回）。
 */
export interface DepositApplication {
  kind: 'application'
  id: string
  /** 0810：申请携带图片快照，审批落库直接用它，不再回查源资产。 */
  payload: FlatImagePayload
  /** 纯记录：这张图当初来自哪份资产 / 哪个项目（可为空——画布或本地文件直传时没有源资产）。 */
  sourceAssetId?: string
  fromScopeId?: string
  toTeamId: string
  applicantId: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedBy?: string   // 谁处理的（审核中心改造新增）
  reviewedAt?: number   // 什么时候处理的
  reason?: string       // 驳回理由（选填）。通过时不填。
}

export type DepositResult = { kind: 'asset'; asset: Asset } | DepositApplication

export function deposit(
  payload: FlatImagePayload,
  targetTeamId: string,
  actor: User,
  source?: { assetId?: string; scopeId?: string },
): DepositResult {
  assertPayload(payload, '团队库')
  const mode = depositMode(actor)

  if (mode === 'none') {
    throw new AssetRuleError('admin 不参与创作与存入。')
  }

  if (mode === 'apply') {
    // 子账号：只生成一条待审批申请，并不真的写入团队库。审批通过才落库。
    return {
      kind: 'application',
      id: makeId('appl'),
      payload,
      sourceAssetId: source?.assetId,
      fromScopeId: source?.scopeId,
      toTeamId: targetTeamId,
      applicantId: actor.id,
      status: 'pending',
      createdAt: Date.now(),
    }
  }

  // 主账号：直接产生一份团队母版（扁平的单图）。
  return { kind: 'asset', asset: materializeDeposit(payload, targetTeamId) }
}

/**
 * 审批通过时落库：主账号直接存入、以及批准子账号申请，最终都走这里——
 * 保证"入库"这一步只有一处实现，行为一致。
 */
export function materializeDeposit(payload: FlatImagePayload, targetTeamId: string): Asset {
  assertPayload(payload, '团队库')
  return flattenToLibrary(payload, { scope: 'team', scopeId: targetTeamId })
}

/* ─── 五、贡献到素材广场（公开层，admin 审核）────────────────────────
 * 和"存入团队库"是两条独立的上行线：
 *   · 存入（→ 团队库）：私有层，把关人是【主账号】。
 *   · 贡献（→ 素材广场）：公开层，把关人是【admin】。
 * 主账号、子账号都能发起广场投稿，一律进 admin 审核队列（谁投都一样）。 */

/**
 * 一条"广场投稿申请"（0810 · 携带图片快照）。
 * status：pending（待 admin 审）→ approved（已上架）/ rejected（驳回）。
 */
export interface PlazaSubmission {
  id: string
  payload: FlatImagePayload
  sourceAssetId?: string
  fromScope?: 'team' | 'project'
  fromScopeId?: string
  submitterId: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedBy?: string   // 谁处理的（审核中心改造新增）
  reviewedAt?: number   // 什么时候处理的
  reason?: string       // 驳回理由（选填）。通过时不填。
  /**
   * 通过后生成的那份广场资产 id（审核中心改造新增）。
   * 用途：审核中心列表要把「投稿记录」和「已上架的广场资产」对上号——
   * 没有它，一份通过的投稿会在列表里出现两次（一条 approved 记录 + 一条上架资产）。
   */
  resultAssetId?: string
}

/**
 * 贡献到素材广场（0810 · 按图）：把一张图提交到 admin 审核队列。
 * 主账号 / 子账号都能发起，一律进队列。
 */
export function contributeToPlaza(
  payload: FlatImagePayload,
  submitter: User,
  source?: { assetId?: string; scope?: 'team' | 'project'; scopeId?: string },
): PlazaSubmission {
  assertPayload(payload, '素材广场')
  return {
    id: makeId('psub'),
    payload,
    sourceAssetId: source?.assetId,
    fromScope: source?.scope,
    fromScopeId: source?.scopeId,
    submitterId: submitter.id,
    status: 'pending',
    createdAt: Date.now(),
  }
}

/** admin 审核通过后上架成广场母版。 */
export function materializePlaza(payload: FlatImagePayload, contributedBy: string): Asset {
  assertPayload(payload, '素材广场')
  return flattenToLibrary(payload, { scope: 'plaza', contributedBy })
}

/* ─── 四、（已删除）跟随线 · 断链 · 母版消失 ─────────────────────────
 * 【v4 改动】广场母版不可编辑，母版内容永不变，"跟随/断链/母版更新降级"
 * 这一整套逻辑（EditKind / editBreaksFollow / applyEdit / onMasterRemoved）
 * 已随之删除。副本本来就独立，母版被删也不影响它，无需任何特殊处理。 */
