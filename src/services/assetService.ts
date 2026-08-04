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
 * 还有一条贯穿所有动作的红线：
 *   ★ 只有 status === 'done'（成品）才能被复用 / 存入 / 贡献。★
 * ─────────────────────────────────────────────────────────────────────── */

import type { Asset, AssetStatus, Candidate, User } from '../data/types'
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

/** 取一份资产对外展示的图：定稿优先；待定稿（还没拍板）先拿候选池第一张顶上。 */
export function coverOf(asset: Pick<Asset, 'cover' | 'candidates'>): string {
  return asset.cover || asset.candidates?.[0]?.url || ''
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
 * 把候选池里的某张设为定稿（不可变）。0807：设定稿 = 拍板成品，
 * 待定稿（pending）随之跃迁到 done；已是成品的只换定稿图、status 不变。
 */
export function setFinal(source: Asset, candidateId: string): Asset {
  const target = source.candidates?.find((c) => c.id === candidateId)
  if (!target) throw new AssetRuleError('候选图不存在')
  return { ...source, cover: target.url, status: 'done' }
}

/**
 * 取消定稿（0808）：资产从成品退回待定稿，图都还在池子里，只是撤回"可被引用"这个授权。
 * 撤回后这份资产：不能被选作参考图、不能存入团队库 / 贡献到广场、卡片打「待定稿」。
 * 已经被别的资产挂为参考图的 url 快照、以及已经拷出去的副本，都不受影响。
 */
export function unsetFinal(source: Asset): Asset {
  if (!source.cover) throw new AssetRuleError('这份资产还没有定稿')
  if (!source.candidates?.length) throw new AssetRuleError('候选池为空，无法取消定稿')
  return { ...source, cover: '', status: 'pending' }
}

/** 造一个候选图（自增 id，够 Demo 用且可预测）。 */
export function makeCandidate(url: string, prompt?: string): Candidate {
  return { id: makeId('cand'), url, prompt, createdAt: Date.now() }
}

/**
 * 造型（有 referencedFrom）定稿后，把定稿图追加进自己的参考图（标签=资产名）——
 * 新生成的成品以自己为底，重新生成才保持一致；原有素模/服装参考图保留、顺序不变。
 * 定稿图已在参考图里（按去后缀的裸地址判重）就原样返回，不重复加。
 * 只对造型生效：基础素材在演示里已预置自己为参考，普通资产不挂。
 */
export function withSelfReference(a: Asset): Asset {
  if (!a.referencedFrom || !a.cover) return a
  const base = a.cover.split('?')[0]
  const refs = a.referenceImages ?? []
  if (refs.some((u) => u.split('?')[0] === base)) return a
  // 标签补齐到与图等长（历史数据可能没写全 label），再追加资产名。
  const labels = [...(a.referenceLabels ?? [])]
  while (labels.length < refs.length) labels.push('参考')
  return {
    ...a,
    referenceImages: [...refs, base],
    referenceLabels: [...labels, a.name],
  }
}

const STATUS_CN: Record<AssetStatus, string> = {
  empty: '待生成', generating: '生成中', pending: '待定稿', done: '成品', failed: '失败',
}

/** 红线校验：不是成品就不许流转。 */
function assertDone(source: Asset, action: string): void {
  if (source.status !== 'done') {
    throw new AssetRuleError(
      source.status === 'pending'
        ? `资产「${source.name}」还没有定稿，先在详情页选一张设为定稿，才能${action}。`
        : `资产「${source.name}」当前是「${STATUS_CN[source.status]}」，只有成品才能${action}。`,
    )
  }
}

/**
 * 类目能力校验：「其他」类目仅存在于项目资产库，不参与任何向上流转（技术规划 §五）。
 * 在服务层挡死，而不是只靠界面隐藏按钮——存入 / 收藏入团队库 / 贡献到广场都先过这一关。
 */
function assertNotOther(source: Asset, target: '团队库' | '素材广场'): void {
  if (source.category === 'other') {
    throw new AssetRuleError(
      target === '素材广场'
        ? '「其他」类目不能贡献到素材广场。'
        : '「其他」类目仅存在于项目资产库，不能存入团队库。',
    )
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
  assertDone(source, '直接复用')
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
  assertDone(source, '收藏')
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
  })
}

/**
 * 复用：团队库 → 项目。同样是一份独立副本（只带定稿图）。
 */
export function reuse(source: Asset, targetProjectId: string): Asset {
  assertDone(source, '复用')
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
  })
}

/**
 * 存入：项目 → 团队库。把项目里的好资产升级为团队母版。
 *
 * 这里用一个「联合返回类型」表达 owner 和 sub 的关键差异：
 *   - 主账号：直接存入一份团队母版 → 返回 { kind: 'asset', asset }
 *   - 子账号：不能直接写团队库，要走"申请 → 主账号批" → 返回 { kind: 'application', ... }
 *   - admin ：不参与创作/存入 → 抛错
 * 调用方拿到结果后，用 result.kind 判断该"入库"还是"进待审批列表"。
 */
/**
 * 一条"子账号资产存入申请"。
 * status 会随审批走：pending（待批）→ approved（通过）/ rejected（驳回）。
 * assetName 是申请那刻的资产名快照，纯为界面/通知显示用（不跟后续改名联动）。
 */
export interface DepositApplication {
  kind: 'application'
  id: string
  assetId: string
  assetName: string
  fromScopeId: string | undefined // 来自哪个项目
  toTeamId: string
  applicantId: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  reviewedBy?: string   // 谁处理的（审核中心改造新增）
  reviewedAt?: number   // 什么时候处理的
  reason?: string       // 驳回理由（选填）。通过时不填。
}

export type DepositResult = { kind: 'asset'; asset: Asset } | DepositApplication

export function deposit(source: Asset, targetTeamId: string, actor: User): DepositResult {
  assertDone(source, '存入')
  assertNotOther(source, '团队库')
  const mode = depositMode(actor)

  if (mode === 'none') {
    throw new AssetRuleError('admin 不参与创作与存入。')
  }

  if (mode === 'apply') {
    // 子账号：只生成一条待审批申请，并不真的写入团队库。审批通过才落库。
    return {
      kind: 'application',
      id: makeId('appl'),
      assetId: source.id,
      assetName: source.name,
      fromScopeId: source.scopeId,
      toTeamId: targetTeamId,
      applicantId: actor.id,
      status: 'pending',
      createdAt: Date.now(),
    }
  }

  // 主账号：直接产生一份团队母版。
  // 注意：存入出来的是"新母版"，不是某个母版的副本，所以不设 masterId。
  return { kind: 'asset', asset: materializeDeposit(source, targetTeamId) }
}

/**
 * 把一份资产真正"落成"团队母版（存入团队库的那一下）。
 * 主账号直接存入、以及主账号审批通过子账号的申请，最终都走这里——
 * 保证"入库"这一步只有一处实现，行为一致。
 */
export function materializeDeposit(source: Asset, targetTeamId: string): Asset {
  assertDone(source, '存入团队库')
  assertNotOther(source, '团队库')
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
    masterId: undefined, // ← 它自己就是团队母版
  })
}

/* ─── 五、贡献到素材广场（公开层，admin 审核）────────────────────────
 * 和"存入团队库"是两条独立的上行线：
 *   · 存入（→ 团队库）：私有层，把关人是【主账号】。
 *   · 贡献（→ 素材广场）：公开层，把关人是【admin】。
 * 主账号、子账号都能发起广场投稿，一律进 admin 审核队列（谁投都一样）。 */

/**
 * 一条"广场投稿申请"。
 * status：pending（待 admin 审）→ approved（已上架）/ rejected（驳回）。
 * assetName / fromScope 是投稿那刻的快照，纯为界面/通知显示用。
 */
export interface PlazaSubmission {
  id: string
  assetId: string
  assetName: string
  fromScope: 'team' | 'project' // 从团队库还是项目里投的
  fromScopeId: string | undefined
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
 * 发起广场投稿：把自己团队库/项目里的一份成品资产，提交到 admin 审核队列。
 * 只生成一条 pending 申请，并不真的上架——上架要等 admin 点头。
 */
export function contributeToPlaza(source: Asset, submitter: User): PlazaSubmission {
  assertDone(source, '贡献到广场')
  assertNotOther(source, '素材广场')
  if (source.scope !== 'team' && source.scope !== 'project') {
    throw new AssetRuleError('只有团队库 / 项目里的资产能投稿到素材广场。')
  }
  return {
    id: makeId('psub'),
    assetId: source.id,
    assetName: source.name,
    fromScope: source.scope,
    fromScopeId: source.scopeId,
    submitterId: submitter.id,
    status: 'pending',
    createdAt: Date.now(),
  }
}

/**
 * admin 审核通过后，把资产"上架"成一份广场官方母版（只带定稿图）。
 * 上架后就是官方母版（不设 masterId），且按 v4 规则：上架后不可编辑、只能删/下架。
 * contributedBy 记录是谁投稿的——作者本人日后可以删自己投的这份。
 */
export function materializePlaza(source: Asset, contributedBy: string): Asset {
  assertDone(source, '上架到广场')
  return cloneForCopy(source, {
    scope: 'plaza',
    scopeId: undefined,
    masterId: undefined, // ← 上架后它自己就是官方母版
    contributedBy, // ← 记住投稿人
  })
}

/* ─── 四、（已删除）跟随线 · 断链 · 母版消失 ─────────────────────────
 * 【v4 改动】广场母版不可编辑，母版内容永不变，"跟随/断链/母版更新降级"
 * 这一整套逻辑（EditKind / editBreaksFollow / applyEdit / onMasterRemoved）
 * 已随之删除。副本本来就独立，母版被删也不影响它，无需任何特殊处理。 */
