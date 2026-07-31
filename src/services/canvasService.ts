/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【服务层 · 画布】canvasService.ts —— 画布节点 ↔ 项目资产 的纯逻辑
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 本期内核唯一受控扩展的落点（技术规划 §2、§6、红线 2）：
 *   把"画布上的一个成品节点，存进项目资产库"这个动作实现成纯函数，
 *   由 store.runSaveToProject 调用后提交进 world。
 *
 * 两个正交维度（技术规划 §2.0）：
 *   · 媒介 media（画布节点类型）：文本 / 图片 / 视频 / 音频
 *   · 类目 category（资产库语义）：角色 / 服装 / 场景 / 道具 / 音频
 *   上传时媒介自动带、类目由用户选；只有图片、音频能上传成库资产。
 *
 * 血缘（技术规划 §2.1）：
 *   · 从团队库/广场拖下来再上传 → 项目独立副本，记 masterId（= 源资产 id）。
 *   · 画布新生成的节点上传 → 原创，无 masterId。
 *   · 从本项目库拖上来的节点 → 已经是项目资产，不再给"上传"入口。
 * ─────────────────────────────────────────────────────────────────────── */

import type { Asset, Category } from '../data/types'
import { AssetRuleError } from './assetService'

/** 媒介 = 画布节点类型（与类目正交）。 */
export type Media = 'text' | 'image' | 'video' | 'audio'

/** 画布节点的三态：空壳 / 生成中 / 成品。只有成品能上传（技术规划 §2.1）。 */
export type NodeStatus = 'empty' | 'generating' | 'done'

/** 节点来源：它是从哪一层库拖下来的（无 = 画布新生成的原创节点）。 */
export interface NodeSource {
  scope: 'project' | 'team' | 'plaza'
  assetId: string // 被拖下来的那份资产 id（血缘就指向它）
}

/** 画布上的一个节点（纯 UI 侧数据，不进 world；只有"上传"才产生 world 资产）。 */
export interface CanvasNode {
  id: string
  media: Media
  status: NodeStatus
  x: number
  y: number
  name: string
  cover?: string // 图片/视频封面；音频/文本可无
  content?: string // 文本内容
  source?: NodeSource // 有 = 从库里拖来的；无 = 新生成
}

/** 一个媒介能上传成哪些类目（技术规划 §2.1）。文本/视频不入库 → 空数组。 */
export function categoriesForMedia(media: Media): Category[] {
  if (media === 'image') return ['character', 'costume', 'scene', 'prop']
  if (media === 'audio') return ['audio']
  return [] // 文本 / 视频不入库
}

/**
 * 入口一的出现条件（技术规划 §2.1，稳定性检查 ①②⑤）：
 * 「上传到项目资产库」只对"成品 + 可入库媒介 + 尚未是项目资产"的节点显示。
 */
export function canUploadToProject(node: CanvasNode): boolean {
  if (node.status !== 'done') return false // ① 空壳 / 生成中不给
  if (categoriesForMedia(node.media).length === 0) return false // ② 文本 / 视频不给
  if (node.source && node.source.scope === 'project') return false // ⑤ 已是本项目资产，无需重复入库
  return true
}

/**
 * 上传时用户填的规格：类目 + 名字 + 保存方式（v7）。
 *
 * v7 概念调整：任何类目都可能对应多张资产（一个场景可以有很多张图、一个角色可以有很多造型），
 * 所以把老的「素模 / 造型」这一角色专属分叉，泛化成对所有类目通用的两个保存方式：
 *   · mode='new' 新建：把这张图/这段音当成一份全新的顶层资产。
 *   · mode='link' 关联已有：把它挂到某个已有同类资产下，作为它的一张子资产（变体/造型）。
 * 角色新建时额外把这张图当素模（baseModel）；其它类目无此概念。
 */
export type SaveSpec =
  // 新建：任意类目直接成一份新的顶层资产
  | { category: Category; mode: 'new'; name: string }
  // 关联已有：挂到某个已有同类资产（targetId）下，作为它的一张子资产
  | { category: Category; mode: 'link'; targetId: string; name: string }

/**
 * 上传的产出意图。「关联已有」不是新增一份顶层资产，
 * 而是往一个已有资产的 looks[] 里追加子资产，所以用可辨识联合区分，交给 store 各自不可变提交。
 */
export type SaveOutcome =
  | { kind: 'add'; asset: Asset } // 新建一份顶层项目资产（任意类目）
  | { kind: 'link'; parentId: string; child: Asset } // 关联到已有资产：往其 looks[] 追加一张子资产

let _seq = 1
function makeId(prefix: string): string {
  return `${prefix}_${_seq++}`
}

/** 内部：由节点造一份 scope=project 的成品资产（血缘按来源带 masterId）。 */
function buildProjectAsset(
  node: CanvasNode,
  projectId: string,
  category: Category,
  name: string,
  extra: Partial<Asset> = {},
): Asset {
  // 从团队库/广场拖来上传 → 记血缘（= 源资产 id）；新生成 → 原创无 masterId。
  const masterId = node.source && node.source.scope !== 'project' ? node.source.assetId : undefined
  return {
    id: makeId('casset'),
    category,
    name,
    scope: 'project',
    scopeId: projectId,
    status: 'done', // 上传进项目库即成品（稳定性检查 ③）
    masterId,
    cover: node.cover ?? '',
    fields: {},
    tags: [],
    createdAt: Date.now(),
    ...extra,
  }
}

/**
 * 【入口一核心】把一个画布成品节点，算成一份"存进项目库"的产出意图。
 * 纯函数：只算不提交。违反规则时抛 AssetRuleError（与 assetService 一致，便于 store/测试识别）。
 */
export function saveCanvasNodeToProject(
  node: CanvasNode,
  projectId: string,
  spec: SaveSpec,
): SaveOutcome {
  if (!canUploadToProject(node)) {
    throw new AssetRuleError('该节点不满足上传条件（需成品 + 图片/音频 + 尚未是项目资产）。')
  }
  // 媒介 ↔ 类目 相容性校验：音频节点只能落音频；图片节点只能落角色/服装/场景/道具。
  const allowed = categoriesForMedia(node.media)
  if (!allowed.includes(spec.category)) {
    throw new AssetRuleError(`媒介「${node.media}」不能落类目「${spec.category}」。`)
  }

  // 关联已有：把这张图/这段音挂到某个已有同类资产下，作为它的一张子资产（变体/造型）。
  if (spec.mode === 'link') {
    const child = buildProjectAsset(node, projectId, spec.category, spec.name)
    return { kind: 'link', parentId: spec.targetId, child }
  }

  // 新建：成一份新的顶层资产。角色额外把这张图当素模 + 封面；其它类目无此概念。
  const extra = spec.category === 'character' ? { baseModel: node.cover ?? '' } : {}
  const asset = buildProjectAsset(node, projectId, spec.category, spec.name, extra)
  return { kind: 'add', asset }
}

/**
 * 库内同名去重（v5：每个库内「顶层资产名唯一」）：某个库（项目库 / 团队库）里是否已有同名顶层资产。
 *
 * 造型子资产（角色 looks）天然豁免：造型嵌在 asset.looks 里、不是 world.assets 顶层项，
 * 所以按 scope + scopeId + name 查 world.assets 只会命中顶层资产、碰不到造型——无需特殊逻辑。
 * 跨库 / 跨项目允许重名（scopeId 不同即各论各的）。
 */
export function libraryHasSameName(
  assets: Asset[],
  scope: 'project' | 'team',
  scopeId: string,
  name: string,
  excludeId?: string,
): boolean {
  return assets.some(
    (a) => a.scope === scope && a.scopeId === scopeId && a.name === name && a.id !== excludeId,
  )
}

/** 团队库同名去重：`libraryHasSameName` 的 scope='team' 特例（保留旧签名，行为不变）。 */
export function teamHasSameName(
  assets: Asset[],
  teamId: string,
  name: string,
  excludeId?: string,
): boolean {
  return libraryHasSameName(assets, 'team', teamId, name, excludeId)
}
