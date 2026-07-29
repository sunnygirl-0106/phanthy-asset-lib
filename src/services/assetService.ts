/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【服务层 · 资产流转】assetService.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把资产在三层之间的四个「动作」——
 *   直接复用 / 收藏 / 复用 / 沉淀 —— 实现成「拿一份资产、算出一份新资产」的纯函数。
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
 *   ★ 只有 status === 'done'（成品）才能被复用 / 沉淀 / 贡献。★
 * ─────────────────────────────────────────────────────────────────────── */

import type { Asset, User } from '../data/types'
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
function makeId(prefix: string): string {
  return `${prefix}_${_seq++}`
}

/**
 * 把一份资产「拷贝」成一份新的独立副本（副本的公共部分都在这里）。
 * overrides 用来覆盖 scope / scopeId 等每个动作各自不同的字段。
 *
 * 注意几个"本地字段"的处理，正好对应产品规则：
 *   - name / tags 是本地的：拷贝一份新的，之后随便改，不影响母版。
 *   - looks（造型）随角色一起走：复制到副本上。
 *   - masterId 指向来源，记录血缘（纯信息）。
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
    baseModel: source.baseModel, // ← 素模是角色本体，随角色一起走（之前漏拷了）
    prompt: source.prompt, // ← v6：提示词随图走（素模提示词）
    cover: source.cover,
    fields: { ...source.fields }, // 复制一份，避免和母版共享同一个对象
    tags: [...source.tags], // 同上，本地标签独立
    voice: source.voice ? { ...source.voice } : undefined, // 音色是锚点、必带、深拷贝（不参与 pickLooks 勾选）
    looks: source.looks ? source.looks.map((l) => ({ ...l })) : undefined,
    createdAt: Date.now(),
    ...overrides,
  }
  return copy
}

/**
 * 展示用封面（v5 改动4）：用户自选封面优先，缺省回落素模，再缺省用空串。
 * 角色必有素模，所以货架上永不空卡。cover 仍是「用户自选」的可空字段，选填、不改存储语义。
 */
export function coverOf(asset: Pick<Asset, 'cover' | 'baseModel'>): string {
  return asset.cover || asset.baseModel || ''
}

/** 删除角色的一套造型；若删的是当前封面，自动回落到剩余造型或素模。 */
export function removeLook(source: Asset, lookId: string): Asset {
  if (!source.looks?.some((look) => look.id === lookId)) {
    throw new AssetRuleError('造型不存在')
  }
  const looks = source.looks.filter((look) => look.id !== lookId)
  const removedCurrentCover = source.looks.some(
    (look) => look.id === lookId && look.cover === source.cover,
  )
  return {
    ...source,
    looks: looks.length ? looks : undefined,
    cover: removedCurrentCover
      ? looks[0]?.cover ?? source.baseModel ?? ''
      : source.cover,
  }
}

/** 红线校验：不是成品就不许流转。 */
function assertDone(source: Asset, action: string): void {
  if (source.status !== 'done') {
    throw new AssetRuleError(
      `资产「${source.name}」当前状态是 ${source.status}，只有"成品(done)"才能${action}。`,
    )
  }
}

/**
 * 「用一个角色时要带哪些造型」的公共小工具。
 * 录音口径：用/复用一个角色时，素模（本体）一定带上，穿衣服的造型是"选"出来的。
 *
 * includeLookIds 语义：
 *   - undefined  → 不指定，整份带（默认，向后兼容：老调用不传就是全带）。
 *   - 显式数组   → 只带这几套造型；传空数组 [] = 只带素模（角色本体）。
 * 素模（baseModel）不在这里处理——它作为角色本体，由 cloneForCopy 一律带上。
 * 返回过滤后的 looks + 一个合适的封面（避免封面指向一个没被带上的造型）。
 */
function pickLooks(source: Asset, includeLookIds?: string[]): { looks: Asset[] | undefined; cover: string } {
  if (includeLookIds === undefined) {
    return {
      looks: source.looks ? source.looks.map((l) => ({ ...l })) : undefined,
      cover: source.cover,
    }
  }
  const kept = (source.looks ?? []).filter((l) => includeLookIds.includes(l.id))
  const cover =
    kept.find((l) => l.cover === source.cover)?.cover ?? kept[0]?.cover ?? source.baseModel ?? source.cover
  return { looks: kept.length ? kept : undefined, cover }
}

/* ─── 三、四个下行/上行动作 ───────────────────────────────────────── */

/**
 * 直接复用：广场 → 项目。随手用，产生一份独立副本（快照）。
 * 角色可用 includeLookIds 选带哪些造型（素模必带；不传=整份带、[]=只带素模）。
 * includeVoice 默认 true；显式传 false 时不带音色。
 */
export function directReuse(
  source: Asset,
  targetProjectId: string,
  includeLookIds?: string[],
  includeVoice = true,
): Asset {
  assertDone(source, '直接复用')
  const { looks, cover } = pickLooks(source, includeLookIds)
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
    looks,
    cover,
    voice: includeVoice ? (source.voice ? { ...source.voice } : undefined) : undefined,
  })
}

/**
 * 收藏：广场 → 团队库。由主账号打理，拿到手就是一份独立副本。
 * （v4：收藏 = 直接拷进团队库，不再有"跟随/不跟随"的选择。）
 */
export function favorite(source: Asset, targetTeamId: string, includeLookIds?: string[]): Asset {
  assertDone(source, '收藏')
  const { looks, cover } = pickLooks(source, includeLookIds) // 素模必带、造型按勾选、封面重挑一张带上来的图
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
    looks,
    cover,
  })
}

/**
 * 复用：团队库 → 项目。同样是一份独立副本。
 * 角色可用 includeLookIds 选带哪些造型（素模必带；不传=整份带、[]=只带素模）。
 */
export function reuse(source: Asset, targetProjectId: string, includeLookIds?: string[]): Asset {
  assertDone(source, '复用')
  const { looks, cover } = pickLooks(source, includeLookIds)
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
    looks,
    cover,
  })
}

/**
 * 沉淀：项目 → 团队库。把项目里的好资产升级为团队母版。
 *
 * 这里用一个「联合返回类型」表达 owner 和 sub 的关键差异：
 *   - 主账号：直接沉淀成一份团队母版 → 返回 { kind: 'asset', asset }
 *   - 子账号：不能直接写团队库，要走"申请 → 主账号批" → 返回 { kind: 'application', ... }
 *   - admin ：不参与创作/沉淀 → 抛错
 * 调用方拿到结果后，用 result.kind 判断该"入库"还是"进待审批列表"。
 */
/**
 * 一条"子账号沉淀申请"。
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
  /**
   * 沉淀角色时，子账号申请那刻勾选的造型 id 列表（素模始终带上、不用选）。
   * 审批通过那一刻才按这个勾选落库。空数组 = 只沉淀素模；非角色类目恒为空。
   */
  includeLookIds: string[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export type DepositResult = { kind: 'asset'; asset: Asset } | DepositApplication

export function deposit(source: Asset, targetTeamId: string, actor: User, includeLookIds?: string[]): DepositResult {
  assertDone(source, '沉淀')
  const mode = depositMode(actor)

  if (mode === 'none') {
    throw new AssetRuleError('admin 不参与创作与沉淀。')
  }

  if (mode === 'apply') {
    // 子账号：只生成一条待审批申请，并不真的写入团队库。勾选结果记进申请，审批通过才落库。
    return {
      kind: 'application',
      id: makeId('appl'),
      assetId: source.id,
      assetName: source.name,
      fromScopeId: source.scopeId,
      toTeamId: targetTeamId,
      applicantId: actor.id,
      includeLookIds: includeLookIds ?? [],
      status: 'pending',
      createdAt: Date.now(),
    }
  }

  // 主账号：直接产生一份团队母版。
  // 注意：沉淀出来的是"新母版"，不是某个母版的副本，所以不设 masterId。
  return { kind: 'asset', asset: materializeDeposit(source, targetTeamId, includeLookIds) }
}

/**
 * 把一份资产真正"落成"团队母版（沉淀入库的那一下）。
 * 主账号直接沉淀、以及主账号审批通过子账号的申请，最终都走这里——
 * 保证"入库"这一步只有一处实现，行为一致。
 */
export function materializeDeposit(source: Asset, targetTeamId: string, includeLookIds?: string[]): Asset {
  assertDone(source, '沉淀入库')
  const { looks, cover } = pickLooks(source, includeLookIds) // 素模必带、造型按勾选、封面重挑一张带上来的图
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
    masterId: undefined, // ← 它自己就是团队母版
    looks,
    cover,
  })
}

/* ─── 五、贡献到素材广场（公开层，admin 审核）────────────────────────
 * 和"沉淀到团队库"是两条独立的上行线：
 *   · 沉淀（→ 团队库）：私有层，把关人是【主账号】。
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
  /**
   * 贡献角色时，要一起带上广场的"造型"子资产 id 列表（可为空）。
   * 素模（角色本体）永远会带上；穿衣服的造型则由投稿人勾选——
   * 你可以只贡献素模，也可以顺带贡献几套定妆/造型。非角色类目这里恒为空。
   */
  includeLookIds: string[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

/**
 * 发起广场投稿：把自己团队库/项目里的一份成品资产，提交到 admin 审核队列。
 * 只生成一条 pending 申请，并不真的上架——上架要等 admin 点头。
 *
 * includeLookIds：贡献角色时想一起带上的造型 id（素模始终带上、不用选）。
 * 传空数组 = 只贡献素模（角色本体）。必须是这个角色名下的造型，否则报错。
 */
export function contributeToPlaza(
  source: Asset,
  submitter: User,
  includeLookIds: string[] = [],
): PlazaSubmission {
  assertDone(source, '贡献到广场')
  if (source.scope !== 'team' && source.scope !== 'project') {
    throw new AssetRuleError('只有团队库 / 项目里的资产能投稿到素材广场。')
  }
  const ownLookIds = new Set((source.looks ?? []).map((l) => l.id))
  for (const id of includeLookIds) {
    if (!ownLookIds.has(id)) {
      throw new AssetRuleError('选择的造型不属于这个角色，无法一起贡献。')
    }
  }
  return {
    id: makeId('psub'),
    assetId: source.id,
    assetName: source.name,
    fromScope: source.scope,
    fromScopeId: source.scopeId,
    submitterId: submitter.id,
    includeLookIds: [...includeLookIds],
    status: 'pending',
    createdAt: Date.now(),
  }
}

/**
 * admin 审核通过后，把资产"上架"成一份广场官方母版。
 * 上架后就是官方母版（不设 masterId），且按 v4 规则：上架后不可编辑、只能删/下架。
 * contributedBy 记录是谁投稿的——作者本人日后可以删自己投的这份。
 *
 * includeLookIds 决定带上哪些造型：素模（baseModel）永远带上；造型只留投稿人选中的那些。
 * 封面重新挑一张仍然带上来的图，避免封面指向一个没被贡献的造型。
 */
export function materializePlaza(source: Asset, contributedBy: string, includeLookIds: string[] = []): Asset {
  assertDone(source, '上架到广场')
  const { looks, cover } = pickLooks(source, includeLookIds) // 素模必带、造型按勾选、封面重挑一张带上来的图
  return cloneForCopy(source, {
    scope: 'plaza',
    scopeId: undefined,
    masterId: undefined, // ← 上架后它自己就是官方母版
    contributedBy, // ← 记住投稿人
    looks,
    cover,
  })
}

/* ─── 四、（已删除）跟随线 · 断链 · 母版消失 ─────────────────────────
 * 【v4 改动】广场母版不可编辑，母版内容永不变，"跟随/断链/母版更新降级"
 * 这一整套逻辑（EditKind / editBreaksFollow / applyEdit / onMasterRemoved）
 * 已随之删除。副本本来就独立，母版被删也不影响它，无需任何特殊处理。 */
