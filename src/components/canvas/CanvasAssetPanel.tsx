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
import { CategoryTabs, type CategoryFilter } from '../CategoryTabs'
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

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
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
      {/* 顶部：来源分段（左） + 搜索（右）同一行 */}
      <div className={styles.head}>
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
        <div className={styles.search}>
          <img className={styles.searchIcon} src={assetUrl('assets/icons/filter-search.svg')} alt="" aria-hidden />
          <input
            className={styles.searchInput}
            placeholder="搜索全部资产"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 类目筛选（直接复用资产库同款 CategoryTabs） */}
      <CategoryTabs value={category} onChange={setCategory} />

      {/* 一行来源说明 */}
      <p className={styles.tip}>
        {searching ? (
          '搜索中 · 全部来源'
        ) : scope === 'project' ? (
          <>当前项目「<span className={styles.tipHi}>{projectName}</span>」的资产</>
        ) : scope === 'team' ? (
          '团队资产库 · 在详情中选择资产放到画布'
        ) : (
          '素材广场 · 官方货架，在详情中选择资产放到画布'
        )}
      </p>

      {/* 卡片网格：复用 AssetCard，所有类型统一进详情后使用。 */}
      {items.length === 0 ? (
        <div className={styles.empty}>{searching ? '没有匹配的资产' : '这一层暂无可见资产'}</div>
      ) : searching ? (
        <div className={styles.searchGroups}>
          {groupedItems.map((group) => group.items.length > 0 && (
            <section key={group.key} className={styles.searchGroup}>
              <h3 className={styles.groupTitle}>{group.label}</h3>
              <div className={styles.grid}>
                {group.items.map((a) => {
                  const singleImage = (a.looks?.length ?? 0) === 0
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
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((a) => {
            const singleImage = (a.looks?.length ?? 0) === 0
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
          })}
        </div>
      )}

    </div>
  )
}
