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
 * 上传时用户填的规格：类目 + 名字；图片落"角色"时还要选素模/造型分叉（技术规划 §2.1）。
 */
export type SaveSpec =
  // 服装 / 场景 / 道具 / 音频：单份直接成一份资产
  | { category: 'costume' | 'scene' | 'prop' | 'audio'; name: string }
  // 图片落角色 · 作为素模：新建一个角色（这张作素模/定妆照）
  | { category: 'character'; as: 'baseModel-new'; name: string }
  // 图片落角色 · 作为素模：替换某个已有角色的素模
  | { category: 'character'; as: 'baseModel-replace'; targetCharId: string }
  // 图片落角色 · 作为造型：追加为某个已有角色的一个造型
  | { category: 'character'; as: 'look'; targetCharId: string; lookName: string }

/**
 * 上传的产出意图。角色的"作造型/替换素模"不是新增一份资产，
 * 而是改动一个已有角色，所以用可辨识联合区分，交给 store 各自不可变提交。
 */
export type SaveOutcome =
  | { kind: 'add'; asset: Asset } // 新增一份项目资产（服装/场景/道具/音频/角色·新建素模）
  | { kind: 'addLook'; charId: string; look: Asset } // 给已有角色追加一个造型
  | { kind: 'replaceBaseModel'; charId: string; baseModel: string; cover: string } // 替换已有角色素模

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

  // 非角色（服装/场景/道具/音频）：单份直接成一份资产。
  if (spec.category !== 'character') {
    return { kind: 'add', asset: buildProjectAsset(node, projectId, spec.category, spec.name) }
  }

  // 图片落"角色"的三种分叉（技术规划 §2.1）。
  switch (spec.as) {
    case 'baseModel-new': {
      // 新建一个角色：这张图作素模 + 封面。
      const asset = buildProjectAsset(node, projectId, 'character', spec.name, {
        baseModel: node.cover ?? '',
      })
      return { kind: 'add', asset }
    }
    case 'baseModel-replace':
      // 替换某个已有角色的素模（顺带把封面也换成这张，便于看到变化）。
      return { kind: 'replaceBaseModel', charId: spec.targetCharId, baseModel: node.cover ?? '', cover: node.cover ?? '' }
    case 'look': {
      // 追加为某个已有角色的一个造型子资产。
      const look = buildProjectAsset(node, projectId, 'character', spec.lookName)
      return { kind: 'addLook', charId: spec.targetCharId, look }
    }
  }
}

/** 团队库同名去重（技术规划 §2.3，稳定性检查 ⑧）：目标团队库里是否已有同名资产。 */
export function teamHasSameName(
  assets: Asset[],
  teamId: string,
  name: string,
  excludeId?: string,
): boolean {
  return assets.some(
    (a) => a.scope === 'team' && a.scopeId === teamId && a.name === name && a.id !== excludeId,
  )
}
