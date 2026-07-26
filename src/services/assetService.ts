/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【服务层 · 资产流转】assetService.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把资产在三层之间的四个「动作」——
 *   直接复用 / 收藏 / 复用 / 沉淀 —— 实现成「拿一份资产、算出一份新资产」的纯函数。
 * 外加两条关于「跟随线」的规则：改内容会断链、母版没了会降级。
 *
 * 全篇要守住的三条底层规则（来自产品文档第 3 章）：
 *   1. 底层是「拷贝」：往下拉一层，得到一个独立副本；用 masterId 记录血缘。
 *   2. 「跟随」是拉取那一刻可选的一根线，默认不开；直接复用永远不给跟随。
 *   3. 改名 / 加 tag / 加造型 不断链；重绘 / 改提示词 / 改音色 会断链。
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
 * overrides 用来覆盖 scope / scopeId / following 等每个动作各自不同的字段。
 *
 * 注意几个"本地字段"的处理，正好对应产品规则：
 *   - name / tags 是本地的：拷贝一份新的，之后随便改，不影响母版。
 *   - looks（造型）随角色一起走：复制到副本上。
 *   - masterId 指向来源，记录血缘。
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
    following: false, // ← 默认不跟随；需要跟随的动作用 overrides 打开
    cover: source.cover,
    fields: { ...source.fields }, // 复制一份，避免和母版共享同一个对象
    tags: [...source.tags], // 同上，本地标签独立
    voiceId: source.voiceId,
    looks: source.looks ? source.looks.map((l) => ({ ...l })) : undefined,
    createdAt: Date.now(),
    ...overrides,
  }
  return copy
}

/** 红线校验：不是成品就不许流转。 */
function assertDone(source: Asset, action: string): void {
  if (source.status !== 'done') {
    throw new AssetRuleError(
      `资产「${source.name}」当前状态是 ${source.status}，只有"成品(done)"才能${action}。`,
    )
  }
}

/* ─── 三、四个下行/上行动作 ───────────────────────────────────────── */

/**
 * 直接复用：广场 → 项目。随手用，产生独立快照，永远不跟随。
 * 要跟官方更新，得改走"收藏进团队库"。
 */
export function directReuse(source: Asset, targetProjectId: string): Asset {
  assertDone(source, '直接复用')
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
    following: false, // ← 直接复用的铁律：只给快照，永不跟随
  })
}

/**
 * 收藏：广场 → 团队库。由主账号打理，拉取时可选是否跟随（默认不跟随）。
 */
export function favorite(source: Asset, targetTeamId: string, follow: boolean = false): Asset {
  assertDone(source, '收藏')
  return cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
    following: follow, // ← 收藏可以选择跟随官方母版
  })
}

/**
 * 复用：团队库 → 项目。同样拉取时可选跟随（默认不跟随）。
 */
export function reuse(source: Asset, targetProjectId: string, follow: boolean = false): Asset {
  assertDone(source, '复用')
  return cloneForCopy(source, {
    scope: 'project',
    scopeId: targetProjectId,
    following: follow,
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
export interface DepositApplication {
  kind: 'application'
  assetId: string
  fromScopeId: string | undefined // 来自哪个项目
  toTeamId: string
  applicantId: string
  status: 'pending'
}

export type DepositResult = { kind: 'asset'; asset: Asset } | DepositApplication

export function deposit(source: Asset, targetTeamId: string, actor: User): DepositResult {
  assertDone(source, '沉淀')
  const mode = depositMode(actor)

  if (mode === 'none') {
    throw new AssetRuleError('admin 不参与创作与沉淀。')
  }

  if (mode === 'apply') {
    // 子账号：只生成一条待审批申请，并不真的写入团队库。
    return {
      kind: 'application',
      assetId: source.id,
      fromScopeId: source.scopeId,
      toTeamId: targetTeamId,
      applicantId: actor.id,
      status: 'pending',
    }
  }

  // 主账号：直接产生一份团队母版。
  // 注意：沉淀出来的是"新母版"，不是某个母版的副本，所以不设 masterId、也不跟随。
  const master = cloneForCopy(source, {
    scope: 'team',
    scopeId: targetTeamId,
    masterId: undefined, // ← 它自己就是母版
    following: false,
  })
  return { kind: 'asset', asset: master }
}

/* ─── 四、跟随线：断链 与 母版消失 ───────────────────────────────── */

/**
 * 一次编辑动作的种类。用来判断"这次改动会不会断开与母版的跟随关系"。
 * - 不断链（只是本地信息）：改名 / 加 tag / 加一个造型
 * - 断链（动了核心内容）  ：重绘定妆照 / 改提示词 / 改音色
 */
export type EditKind = 'rename' | 'addTag' | 'addLook' | 'redrawCover' | 'changePrompt' | 'changeVoice'

const CONTENT_EDITS: ReadonlySet<EditKind> = new Set<EditKind>(['redrawCover', 'changePrompt', 'changeVoice'])

/** 判断某种编辑是否属于"会断链"的核心内容改动。 */
export function editBreaksFollow(edit: EditKind): boolean {
  return CONTENT_EDITS.has(edit)
}

/**
 * 对一份资产应用一次编辑，返回改动后的资产 + 是否发生了断链。
 * 规则：只有当"这份资产正在跟随"且"这次是核心内容改动"时，才断链
 *      （following 从 true 变 false，降级为独立快照）。
 * 其它情况（本身没跟随、或只是改名加tag）都不影响跟随状态。
 */
export function applyEdit(asset: Asset, edit: EditKind): { asset: Asset; brokeFollow: boolean } {
  const willBreak = asset.following === true && editBreaksFollow(edit)
  const next: Asset = { ...asset, following: willBreak ? false : asset.following }
  return { asset: next, brokeFollow: willBreak }
}

/**
 * 母版被删 / 下架时，对跟随中的副本的处理：
 * 停止跟随、内容原样保留，降级为独立快照。绝不连带消失。
 */
export function onMasterRemoved(copy: Asset): Asset {
  return { ...copy, following: false }
}
