/**
 * 【组件】AssetCard —— 一张资产卡片（视觉网格的基本单元）
 *
 * v6 视觉：按团队资产库 Figma（node 1:2 的 Actor Card）重做——
 * 满幅封面 + 底部黑→透明渐变 + 名字（白）/ 时间（白 60%）浮层。
 * 一张卡就是一整块图，信息压在图上，不再是"图 + 下方白条"的老样式。
 *
 * 只负责"把一份资产画出来"：能不能出现在网格里由上层 canSee 决定；
 * 徽章（副本 / 生成中）保留在左上角，让数据层里 masterId / status 的效果在界面上看得见。
 */

import type { ReactNode } from 'react'
import type { Asset, Category } from '../data/types'
import { coverOf } from '../services/assetService'
import styles from './AssetCard.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  audio: '音频',
  other: '其他',
}

/** 「其他」类目媒介 → 卡片左上角的媒介小徽章文案 / 副标题形态标签。 */
const MEDIA_LABEL: Record<'image' | 'video' | 'text', string> = {
  image: '图片',
  video: '视频',
  text: '文本',
}

/**
 * 卡片副标题（0805 · 改动三）：不显示时间，显示这份资产是什么"形态"。
 * 「其他」按媒介、音频写「音频」、有 referencedFrom 的写「角色造型 / 场景变体 / 道具变体」，
 * 其余（顶层素模）写类目名（角色 / 服装 / 场景 / 道具）。
 */
function formLabel(a: Asset): string {
  if (a.category === 'other') return MEDIA_LABEL[(a.fields.media as 'image' | 'video' | 'text' | undefined) ?? 'image']
  if (a.category === 'audio') return '音频'
  if (a.referencedFrom) {
    return a.category === 'character' ? '角色造型'
      : a.category === 'scene' ? '场景变体'
        : a.category === 'prop' ? '道具变体' : '造型'
  }
  return CATEGORY_LABEL[a.category]
}

export function AssetCard({
  asset,
  onClick,
  hideSub,
  compact,
  draggable,
  onDragStart,
  hoverActions,
}: {
  asset: Asset
  onClick?: () => void
  /** 画布左侧面板用：隐藏名字下那行小灰字副标题（其它页面默认展示）。 */
  hideSub?: boolean
  /** 紧凑浮层用：缩小卡片内文字与留白，不影响库页的大卡片。 */
  compact?: boolean
  /** 画布左侧面板用：让整张卡可拖（HTML5 DnD）。 */
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  /** 画布左侧面板用：hover 时压在封面上的行动按钮（查看 / 使用）。不传则不渲染。 */
  hoverActions?: ReactNode
}) {
  // 副标题（0805 · 规则 19）：不显示时间、也不暴露候选数，只写这份资产的形态标签。
  const subtitle = formLabel(asset)

  // 「其他」类目：按 fields.media 分三种渲染（图片 / 视频 / 文本），并在左上角打一个媒介徽章。
  const otherMedia = asset.category === 'other' ? (asset.fields.media as 'image' | 'video' | 'text' | undefined) ?? 'image' : null
  const isText = otherMedia === 'text'
  const isVideo = otherMedia === 'video'
  const duration = asset.fields.duration as string | undefined

  const cursor = draggable ? 'grab' : onClick ? 'pointer' : undefined

  return (
    <div
      className={[
        styles.card,
        compact ? styles.compact : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      style={cursor ? { cursor } : undefined}
    >
      {asset.status === 'empty' ? (
        // 空壳（R1）：图片被清空，只留提示词/名字。封面区渲染虚线占位，标「待生成」。
        <div className={styles.emptyCover}>
          <EmptyGlyph />
          <span>待生成</span>
        </div>
      ) : isText ? (
        // 「其他」文本：不放图，卡面渲染深色底 + 正文预览（多行截断），避免裂图。
        <div className={styles.textCard}>
          <p className={styles.textPreview}>{(asset.fields.text as string) || '（暂无正文）'}</p>
        </div>
      ) : (
        <img className={styles.cover} src={coverOf(asset)} alt={asset.name} loading="lazy" />
      )}

      {/* 「其他」视频：中央半透明播放三角 + 右下角时长（若有） */}
      {isVideo && asset.status !== 'empty' && (
        <>
          <div className={styles.playGlyph} aria-hidden>▶</div>
          {duration && <span className={styles.videoDur}>{duration}</span>}
        </>
      )}

      {/* 左上角徽章：媒介（其他）/ 副本血缘 / 非成品状态。
          「待生成」空壳不再打状态角标——封面中央已写「待生成」，避免同一张卡重复两次。 */}
      {(otherMedia || asset.masterId || (asset.status !== 'done' && asset.status !== 'empty')) && (
        <div className={styles.badges}>
          {otherMedia && <span className={`${styles.badge} ${styles.badgeMedia}`}>{MEDIA_LABEL[otherMedia]}</span>}
          {asset.masterId && <span className={`${styles.badge} ${styles.badgeCopy}`}>副本</span>}
          {asset.status !== 'done' && asset.status !== 'empty' && (
            <span className={`${styles.badge} ${asset.status === 'pending' ? styles.badgePending : ''}`}>
              {statusLabel(asset.status)}
            </span>
          )}
        </div>
      )}

      {/* hover 行动层：压在封面上浮出「查看 / 使用」（仅画布面板传 hoverActions 时出现） */}
      {hoverActions && <div className={styles.hoverActions}>{hoverActions}</div>}

      {/* 底部浮层：渐变 + 名字 / 形态标签（规则 19：不再叠卡边、不打候选数角标） */}
      <div className={styles.overlay}>
        <div className={styles.info}>
          <div className={styles.name}>{asset.name}</div>
          {!hideSub && <div className={styles.sub}>{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}

/** 空壳占位图标：一张「图片」轮廓（虚线感由外层 CSS 提供）。 */
function EmptyGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function statusLabel(status: Asset['status']): string {
  return status === 'empty' ? '待生成'
    : status === 'generating' ? '生成中'
    : status === 'pending' ? '待定稿'
    : status === 'failed' ? '失败'
    : '成品'
}
