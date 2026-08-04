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

import type { Asset, AssetFields, Candidate, Category } from '../data/types'
import { AssetRuleError, makeCandidate } from './assetService'

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

/**
 * 一个媒介能上传成哪些类目（技术规划 §2.1 + 「其他」类目）。
 *   · 图片：前五类里的四个视觉类目，外加「其他」（分镜图等留存物）。
 *   · 音频：只落音频。
 *   · 视频 / 文本：不套用前五类结构，只能落「其他」（分镜片段 / 剧本台词）。
 */
export function categoriesForMedia(media: Media): Category[] {
  if (media === 'image') return ['character', 'costume', 'scene', 'prop', 'other']
  if (media === 'audio') return ['audio']
  if (media === 'video') return ['other']
  if (media === 'text') return ['other']
  return []
}

/**
 * 去处 = 类目 + 一个特殊项 'voice'（角色音色，不产生资产、只挂到角色身上）。
 * 这是统一保存弹窗「存到哪里」瓷砖的唯一真相，与 categoriesForMedia 并列——
 * 服务层的校验仍走 categoriesForMedia（'voice' 不是类目、走 setVoice，不进 saveCanvasNodeToProject）。
 */
export type Destination = Category | 'voice'

/**
 * 一个媒介能存到哪些去处（统一保存弹窗用）。
 * 判断依据：一个媒介能去哪儿，看它有没有属于自己的类目——
 *   · 音频有「音频」类目，所以永远不进「其他」，另给一个「角色音色」特殊去处；
 *   · 视频 / 文本没有自己的视觉类目，所以只能进「其他」（分镜片段 / 剧本台词）；
 *   · 图片落四个视觉类目 + 「其他」。
 */
export function destinationsForMedia(media: Media): Destination[] {
  if (media === 'image') return ['character', 'prop', 'costume', 'scene', 'other']
  if (media === 'audio') return ['audio', 'voice']
  if (media === 'video') return ['other']
  if (media === 'text') return ['other']
  return []
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
 * 【0803】任何类目都可能对应多张图（一份资产 = 定稿图 + 候选池）。两个保存方式：
 *   · mode='new'  新建：把这张图/这段音当成一份全新的顶层资产。
 *   · mode='link' 关联已有：把这张图**追加进某个已有同类资产的候选池**（candidates）。
 *     变体（睡衣苏晚等）各自独立成资产，不再作为"子资产/造型"挂在父资产下；
 *     所以「关联已有」在新模型里就是"并入候选池"，用户之后可在详情里「设为定稿」。
 */
export type SaveSpec =
  // 新建：任意类目直接成一份新的顶层资产
  | { category: Category; mode: 'new'; name: string; extraFields?: AssetFields }
  // 关联已有：把这张图追加进某个已有同类资产（targetId）的候选池
  | { category: Category; mode: 'link'; targetId: string; name: string; extraFields?: AssetFields }

// extraFields（可选透传）：「其他」类目落库时把媒介信息（media / videoUrl / text）
// 直接写进产出资产的 fields，避免落库后再补一次更新（技术规划 §4.2）。

/**
 * 上传的产出意图。「关联已有」不是新增一份顶层资产，
 * 而是往一个已有资产的候选池（candidates[]）里追加一张候选图，所以用可辨识联合区分，
 * 交给 store 各自不可变提交。
 */
export type SaveOutcome =
  | { kind: 'add'; asset: Asset } // 新建一份顶层项目资产（任意类目）
  | { kind: 'link'; parentId: string; candidate: Candidate } // 关联到已有资产：往其候选池追加一张候选图

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

  // 音频不再提供「关联已有」（R3/R4）：候选池是视觉图的概念，音频并入无处展示，语义废弃。
  if (node.media === 'audio' && spec.mode === 'link') {
    throw new AssetRuleError('音频不支持「关联已有」，请作为音频素材新建。')
  }

  // 「其他」是存进来的成品留存物、没有候选池概念（§4.3）：只支持「新建」，不支持「关联已有」。
  if (spec.category === 'other' && spec.mode === 'link') {
    throw new AssetRuleError('「其他」类目不支持关联到已有资产。')
  }

  // 关联已有：把这张图追加进某个已有同类资产的候选池（用户之后可在详情里「设为定稿」）。
  if (spec.mode === 'link') {
    const candidate = makeCandidate(node.cover ?? '')
    return { kind: 'link', parentId: spec.targetId, candidate }
  }

  // 新建：成一份新的顶层资产。cover 即定稿图（0803：不再有 baseModel 概念）。
  const extra: Partial<Asset> = {}
  // 音频资产：把节点音源存进 fields.audioUrl，库里的音频行才能试听（AudioList 读的就是它）。
  if (node.media === 'audio') extra.fields = { ...extra.fields, audioUrl: node.content ?? '' }
  // 「其他」及任意带 extraFields 的规格：把媒介信息（media / videoUrl / text）合并进 fields。
  const withExtra = mergeExtraFields(spec, extra)
  const asset = buildProjectAsset(node, projectId, spec.category, spec.name, withExtra)
  return { kind: 'add', asset }
}

/** 把 spec.extraFields 合并进 extra.fields（不覆盖已由媒介逻辑写入的键，如音频 audioUrl）。 */
function mergeExtraFields(spec: SaveSpec, extra: Partial<Asset> = {}): Partial<Asset> {
  if (!spec.extraFields) return extra
  return { ...extra, fields: { ...spec.extraFields, ...extra.fields } }
}

/**
 * 库内同名去重（v5：每个库内「顶层资产名唯一」）：某个库（项目库 / 团队库）里是否已有同名顶层资产。
 *
 * 候选图天然豁免：候选是 asset.candidates 里的图、不是 world.assets 顶层项，无需特殊逻辑。
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
