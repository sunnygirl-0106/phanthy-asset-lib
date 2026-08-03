/**
 * 【画布 · 入口二】CanvasAssetPanel —— 左侧资产库面板（三层浏览 · 对齐资产库网格）
 *
 * 展示范围（技术规划 §2.2）：本项目的 项目库 + 团队库 + 素材广场，三层都可见。
 * 所有卡片统一进入详情，再选择素模 / 造型 / 音色放到画布。
 *
 * 结构与「资产库网格」（AssetGrid）保持一致——来源分段 + 搜索、类目筛选（CategoryTabs）、
 * 卡片网格（AssetCard）、点开详情（AssetDetail），详情内提供画布专属的「使用」。
 */

import { useState } from 'react'
import type { Scope, Asset } from '../../data/types'
import type { Media } from '../../services/canvasService'
import { useStore, useCurrentUser } from '../../store/useStore'
import { canSee, canViewPrompt } from '../../services/permission'
import { coverOf } from '../../services/assetService'
import { AssetCard } from '../AssetCard'
import { AssetDetail } from '../AssetDetail'
import { AudioList, audioSrcOf } from '../AudioList'
import type { CategoryFilter } from '../CategoryTabs'
import { assetUrl } from '../../utils/assets'
import styles from './CanvasAssetPanel.module.css'

/** 拖拽载荷：落到画布时用它造节点。 */
export interface DragPayload {
  scope: Scope
  assetId: string
  media: Media
  name: string
  cover?: string
  /** 音频 / 音色节点的可播放音源 url（复用 CanvasNode 的 content 字段）。 */
  content?: string
}

export const DRAG_MIME = 'application/x-phanty-asset'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'project', label: '项目库' },
  { key: 'team', label: '团队库' },
  { key: 'plaza', label: '广场' },
]

// 有"造型/其他样式"能力的品类：一律点进详情选图再用（不走卡片直接使用），
// 这样它们即使当前只有一张图，也能在详情里看到「造型/其他样式（0）」并放大/下载/新增。
const STYLE_CATS = new Set(['character', 'scene', 'prop'])

// 类目下划线 Tab（对齐 Figma 面板头部）；与资产库网格的 CategoryTabs 同一套类目，
// 这里换成"青色下划线"观感，故在面板内本地渲染，不动共享组件。
const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'character', label: '角色' },
  { value: 'costume', label: '服装' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'audio', label: '音频' },
]

function mediaOf(asset: Asset): Media {
  return asset.category === 'audio' ? 'audio' : 'image'
}

/** 单图资产从卡片直接使用时的默认载荷。 */
function defaultPayload(asset: Asset): DragPayload {
  if (asset.category === 'character') {
    return { scope: asset.scope, assetId: asset.id, media: 'image', name: asset.name, cover: asset.baseModel ?? asset.cover }
  }
  return { scope: asset.scope, assetId: asset.id, media: mediaOf(asset), name: asset.name, cover: coverOf(asset) }
}

export function CanvasAssetPanel({
  pid,
  projectName,
  onUse,
  onClose,
}: {
  pid: string
  projectName: string
  onUse: (payload: DragPayload) => void
  /** 关闭整个资产浮层（详情二级页右上角 ✕ 用）。 */
  onClose?: () => void
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const [scope, setScope] = useState<Scope>('project')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)
  const [openPromptDirectly, setOpenPromptDirectly] = useState(false)

  // 单一数据源 + 派生视图：无搜索时按来源浏览；输入后跨三层搜，并保留当前项目的边界。
  // 只列成品：空壳 / 生成中 / 失败的资产不进画布资产网格。
  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const items = world.assets
    .filter((a) => canSee(world, user, a))
    .filter((a) => a.status === 'done')
    .filter((a) => a.scope !== 'project' || a.scopeId === pid)
    .filter((a) => searching || a.scope === scope)
    .filter((a) => category === 'all' || a.category === category)
    .filter((a) => !searching || a.name.toLowerCase().includes(q))

  const groupedItems = SCOPES.map((s) => ({ ...s, items: items.filter((a) => a.scope === s.key) }))
  // 「全部」类目分区展示用：图片类走网格、音频类走条状列表。
  const imageItems = items.filter((a) => a.category !== 'audio')
  const audioItems = items.filter((a) => a.category === 'audio')

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  /** 音频资产 → 音频节点的载荷：带上可播放音源（content）。 */
  function audioPayload(a: Asset): DragPayload {
    return { scope: a.scope, assetId: a.id, media: 'audio', name: a.name, content: audioSrcOf(a) }
  }

  /** 分区小标题（对齐 Figma）：灰字标签 + 数字角标。spaced=与上方内容拉开距离。 */
  function sectionHead(label: string, count: number, spaced = false) {
    return (
      <div className={`${styles.sectionHead} ${spaced ? styles.sectionHeadSpaced : ''}`}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.sectionRule} aria-hidden />
      </div>
    )
  }

  /** 图片类资产卡（照旧）；音频类不进网格，走 renderAudioList 的条状列表。 */
  function renderCard(a: Asset) {
    const singleImage = (a.looks?.length ?? 0) === 0 && !STYLE_CATS.has(a.category)
    return (
      <AssetCard
        key={a.id}
        asset={a}
        hideSub
        compact
        onClick={singleImage ? undefined : () => { setOpenPromptDirectly(false); setDetailAssetId(a.id) }}
        hoverActions={singleImage ? (
          <>
            <button className={`${styles.actBtn} ${styles.actPrimary}`} onClick={(e) => { e.stopPropagation(); onUse(defaultPayload(a)) }}>
              使用
            </button>
            {canViewPrompt(a) && (
              <button className={`${styles.actBtn} ${styles.actGhost}`} onClick={(e) => { e.stopPropagation(); setOpenPromptDirectly(true); setDetailAssetId(a.id) }}>
                提示词
              </button>
            )}
          </>
        ) : (
          <button className={`${styles.actBtn} ${styles.actGhost}`} onClick={(e) => { e.stopPropagation(); setOpenPromptDirectly(false); setDetailAssetId(a.id) }}>
            查看并使用
          </button>
        )}
      />
    )
  }

  /** 音频列表（对齐 Figma）：整行=试听按钮 + 名称 + 波形占位 + 时长 + 使用；整行可拖到画布。 */
  function renderAudioList(list: Asset[]) {
    return (
      <AudioList
        items={list}
        mode={{
          kind: 'canvas',
          onUse: (a) => onUse(audioPayload(a)),
          onDragStart: (e, a) => startDrag(e, audioPayload(a)),
        }}
      />
    )
  }

  // 「查看」= 就地进二级页：详情直接铺满浮层（替换列表），‹ 返回列表、✕ 关整扇浮层。
  // 详情复用现成 AssetDetail（onUse 触发画布专用布局）；素模 / 造型 = 图片节点，音色 = 音频节点。
  if (detailAssetId) {
    const detailAsset = world.assets.find((x) => x.id === detailAssetId)
    return (
      <AssetDetail
        key={`${detailAssetId}-${openPromptDirectly ? 'prompt' : 'detail'}`}
        assetId={detailAssetId}
        openBasePromptOnMount={openPromptDirectly}
        onBack={() => { setDetailAssetId(null); setOpenPromptDirectly(false) }}
        onClose={() => { setDetailAssetId(null); setOpenPromptDirectly(false); onClose?.() }}
        // 音色框可拖：落一个音频节点，带上可播放音源（previewUrl）
        onVoiceDragStart={(e) => {
          if (!detailAsset?.voice) return
          startDrag(e, {
            scope: detailAsset.scope,
            assetId: detailAsset.id,
            media: 'audio',
            name: `${detailAsset.name}·音色`,
            content: detailAsset.voice.previewUrl,
          })
        }}
        onUse={(u) => {
          const a = world.assets.find((x) => x.id === detailAssetId)
          if (!a) return
          if (u.text) {
            // 提示词 → 文本节点（v6）；文本不入库（categoriesForMedia('text')===[]），只当画布草稿。
            onUse({ scope: a.scope, assetId: a.id, media: 'text', name: u.text.name, content: u.text.content })
            setDetailAssetId(null)
            return
          }
          if (u.voice) {
            // 音色 → 音频节点（接台词那步才生成配音）
            onUse({ scope: a.scope, assetId: a.id, media: 'audio', name: u.voice.name, content: u.voice.url })
          } else {
            // 素模 / 造型 → 图片节点（media 按资产类型推导，不写死）
            onUse({
              scope: a.scope,
              assetId: a.id,
              media: mediaOf(a),
              name: u.lookName ? `${a.name}·${u.lookName}` : a.name,
              cover: u.cover,
            })
          }
          setDetailAssetId(null)
        }}
      />
    )
  }

  return (
    <div className={styles.panel}>
      {/* 标题行：「资产」（左） + 小字说明（右上角）。小字放右上是为了让标题行高恒定，
          切换 tab 时小字显隐不会把下面的分段/类目顶得上下跳。
          项目库=当前项目名；团队库=当前团队库；广场/搜索不显示。 */}
      <div className={styles.titleRow}>
        <h2 className={styles.title}>资产</h2>
        {!searching && scope !== 'plaza' && (
          <p className={styles.subtitle}>
            {scope === 'project' ? (
              <>当前项目<span className={styles.subtitleChip}>{projectName}</span>的资产</>
            ) : (
              '当前团队库的资产'
            )}
          </p>
        )}
      </div>

      {/* 来源分段 项目库/团队库/广场（在标题下、类目上，左对齐独立一行） */}
      <div className={`${styles.scopes} ${searching ? styles.scopesSearching : ''}`}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            className={`${styles.scopeBtn} ${scope === s.key ? styles.scopeOn : ''}`}
            disabled={searching}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 类目筛选：青色下划线 Tab（对齐 Figma 头部） */}
      <div className={styles.catTabs} role="tablist">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={category === t.value}
            className={`${styles.catTab} ${category === t.value ? styles.catTabOn : ''}`}
            onClick={() => setCategory(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索框：Figma 半透明 pill */}
      <div className={styles.search}>
        <img className={styles.searchIcon} src={assetUrl('assets/icons/search.svg')} alt="" aria-hidden />
        <input
          className={styles.searchInput}
          placeholder="您可以在这里搜索资产名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 图片走卡片网格（照旧），音频走条状列表；「全部」类目下按「图片资产 N / 音频 N」分区（对齐 Figma）。 */}
      {items.length === 0 ? (
        <div className={styles.empty}>{searching ? '没有匹配的资产' : '这一层暂无可见资产'}</div>
      ) : searching ? (
        <div className={styles.searchGroups}>
          {groupedItems.map((group) => {
            if (group.items.length === 0) return null
            const imgs = group.items.filter((a) => a.category !== 'audio')
            const auds = group.items.filter((a) => a.category === 'audio')
            return (
              <section key={group.key} className={styles.searchGroup}>
                <h3 className={styles.groupTitle}>{group.label}</h3>
                {imgs.length > 0 && <div className={styles.grid}>{imgs.map(renderCard)}</div>}
                {auds.length > 0 && renderAudioList(auds)}
              </section>
            )
          })}
        </div>
      ) : category === 'audio' ? (
        renderAudioList(items)
      ) : category === 'all' ? (
        <>
          {imageItems.length > 0 && (
            <>
              {sectionHead('图片资产', imageItems.length)}
              <div className={styles.grid}>{imageItems.map(renderCard)}</div>
            </>
          )}
          {audioItems.length > 0 && (
            <>
              {sectionHead('音频', audioItems.length, imageItems.length > 0)}
              {renderAudioList(audioItems)}
            </>
          )}
        </>
      ) : (
        <div className={styles.grid}>{items.map(renderCard)}</div>
      )}

    </div>
  )
}
