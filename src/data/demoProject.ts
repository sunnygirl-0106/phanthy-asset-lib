/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【演示脚手架】demoProject.ts —— 「都市日常」项目的 8 份资产
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这不是产品数据，是演示时"从无到有长出资产"的道具。交付时随演示控件一并移除。
 * 从 seed.ts 里剥离出来，就是为了让这条线一眼可见、删起来干净。
 *
 * ── 三步动线 ──────────────────────────────────────────────────────────
 * ① 剧本分析   → 8 份**全部**作为空壳灌进 world：只有提示词，无图、无参考图
 * ② 资产生成   → 只生成基础 6 份（角色 2 / 服装 2 / 场景 1 / 道具 1），
 *                每份出 4 张候选、第 1 张自动定稿；
 *                同时给 2 份造型挂上参考图（角色定稿 + 服装定稿）
 * ③ 批量生成造型 → 只生成 2 份造型，同样 4 张候选、第 1 张自动定稿
 *
 * ── 素材约定 ──────────────────────────────────────────────────────────
 * 每份资产一个目录，`1.png` 恒为默认定稿，`2~4.png` 为候选：
 *   public/assets/proj-daily/<slug>/1.png … 4.png
 *
 * ── 不变量（0810）────────────────────────────────────────────────────
 * 图片列表非空 ⇔ 有且仅有一张定稿。有图必有定稿，不存在"有图没定稿"的中间态。
 * ═══════════════════════════════════════════════════════════════════════ */

import type { Asset, Category } from './types'
import { IDS, cands, PROMPT_CHARACTER, PROMPT_COSTUME, PROMPT_SCENE, PROMPT_PROP } from './seed'
import { assetUrl } from '../utils/assets'

const IMG = assetUrl('assets')

/** 一份资产的 4 张图：proj-daily/<slug>/1..4.png，第 1 张是定稿。 */
function pool(slug: string): string[] {
  return [1, 2, 3, 4].map((n) => `${IMG}/proj-daily/${slug}/${n}.png`)
}

const PROMPT: Record<Category, string> = {
  character: PROMPT_CHARACTER, costume: PROMPT_COSTUME,
  scene: PROMPT_SCENE, prop: PROMPT_PROP, audio: '', other: '',
}

/** 生成一份"已出图"的资产定义：4 张候选，首张定稿。 */
function made(
  id: string, category: Category, name: string, slug: string,
  fields: Record<string, unknown> = {}, createdAt = 0,
): Asset {
  const p = pool(slug)
  return {
    id, category, name, scope: 'project', scopeId: IDS.projDaily,
    status: 'done', cover: p[0], candidates: cands(p),
    // 0810 自参考不入库：素模自己的定稿由详情页在渲染时派生成参考图第一槽，不写进数据。
    prompt: PROMPT[category], fields, tags: [], createdAt,
  }
}

/**
 * 生成一份"造型"的资产定义（0812）：参考槽 = 两个**资产级槽**，分别指向角色与服装。
 * 资产级槽是活的：上游还没出图时槽是空的（pending），上游一定稿槽自动拿到它的 cover——
 * 所以"造型第一步没图、第二步自动就位"不需要任何特殊代码，是状态流动的结果。
 */
function look(
  id: string, name: string, slug: string,
  from: { id: string; name: string; slug: string },
  costume: { id: string; name: string; slug: string },
  fields: Record<string, unknown> = {}, createdAt = 0,
): Asset {
  const p = pool(slug)
  return {
    id, category: 'character', name, scope: 'project', scopeId: IDS.projDaily,
    status: 'done', cover: p[0], candidates: cands(p),
    referencedFrom: from.id,
    references: [
      { kind: 'asset', assetId: from.id },     // 角色（阿杰 / 苏可）
      { kind: 'asset', assetId: costume.id },  // 服装（西装 / 睡衣）
    ],
    prompt: PROMPT_CHARACTER,
    // fields.lookUrl 是**演示脚手架专用**：没有生图后端，手动「批量生成」时拿它当出图替身，
    // 保证造型出的是造型图而不是素模图。接真后端后连同本文件一起删。
    fields: { ...fields, lookUrl: p[0] },
    tags: [], createdAt,
  }
}

const AJIE = { id: 'd_ajie', name: '阿杰', slug: 'ajie' }
const SUKE = { id: 'd_suke', name: '苏可', slug: 'suke' }
const SUIT = { id: 'd_suit', name: '西装', slug: 'suit' }
const PAJAMAS = { id: 'd_pajamas', name: '睡衣', slug: 'pajamas' }

/**
 * 8 份资产的**完整形态**（已出图的样子）。
 * store 用它派生出各阶段状态：① 全部降级为空壳；② 基础 6 份恢复；③ 造型 2 份恢复。
 */
export const DEMO_ASSETS: Asset[] = [
  /* ── 基础 6（第二步生成）── */
  made('d_ajie', 'character', '阿杰', 'ajie', { gender: '男', age: '青年', style: '写实' }, 1_784_900_000_000),
  made('d_suke', 'character', '苏可', 'suke', { gender: '女', age: '青年', style: '写实' }, 1_784_890_000_000),
  made('d_suit', 'costume', '西装', 'suit', { style: '写实' }, 1_784_880_000_000),
  made('d_pajamas', 'costume', '睡衣', 'pajamas', { style: '写实' }, 1_784_870_000_000),
  made('d_living_room', 'scene', '客厅', 'living-room', { style: '写实' }, 1_784_860_000_000),
  made('d_phone', 'prop', '手机', 'phone', { style: '写实' }, 1_784_850_000_000),

  /* ── 造型 2（第三步生成）── */
  look('d_ajie_suit', '阿杰·西装造型', 'ajie-suit', AJIE, SUIT, { gender: '男', age: '青年', style: '写实' }, 1_784_840_000_000),
  look('d_suke_pajamas', '苏可·睡衣造型', 'suke-pajamas', SUKE, PAJAMAS, { gender: '女', age: '青年', style: '写实' }, 1_784_830_000_000),
]

/** id 集合（重置演示时精确过滤用：只删这一批，不碰音频 /「其他」）。 */
export const DEMO_IDS = new Set(DEMO_ASSETS.map((a) => a.id))

/** 造型（第三步才生成）与基础素材（第二步生成）的划分。 */
export const DEMO_LOOK_IDS = new Set(DEMO_ASSETS.filter((a) => a.referencedFrom).map((a) => a.id))
export const DEMO_BASE_IDS = new Set(DEMO_ASSETS.filter((a) => !a.referencedFrom).map((a) => a.id))
