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
  // 副标题：有真实创建时间就显示时间（对齐设计稿），否则退化成类目标签。
  const subtitle = asset.createdAt ? formatDateTime(asset.createdAt) : CATEGORY_LABEL[asset.category]

  // 多造型角色：图片总数 = 素模（1 张）+ 造型数。≥2 时卡片叠出"卡边"并在右下角标出总张数。
  const lookCount = asset.category === 'character' ? (asset.looks?.length ?? 0) + 1 : 0
  const multiLook = lookCount >= 2

  const cursor = draggable ? 'grab' : onClick ? 'pointer' : undefined

  return (
    <div
      className={[
        styles.card,
        multiLook ? styles.stacked : '',
        compact ? styles.compact : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      style={cursor ? { cursor } : undefined}
    >
      <img className={styles.cover} src={coverOf(asset)} alt={asset.name} loading="lazy" />

      {/* 左上角徽章：副本血缘 / 非成品状态 */}
      {(asset.masterId || asset.status !== 'done') && (
        <div className={styles.badges}>
          {asset.masterId && <span className={`${styles.badge} ${styles.badgeCopy}`}>副本</span>}
          {asset.status !== 'done' && <span className={styles.badge}>{statusLabel(asset.status)}</span>}
        </div>
      )}

      {/* hover 行动层：压在封面上浮出「查看 / 使用」（仅画布面板传 hoverActions 时出现） */}
      {hoverActions && <div className={styles.hoverActions}>{hoverActions}</div>}

      {/* 底部浮层：渐变 + 名字 / 时间 + 更多 */}
      <div className={styles.overlay}>
        <div className={styles.info}>
          <div className={styles.name}>{asset.name}</div>
          {!hideSub && <div className={styles.sub}>{subtitle}</div>}
        </div>
        {multiLook && (
          <div className={styles.overlayRight}>
            <span className={styles.lookCount} title={`素模 + ${lookCount - 1} 套造型 · 共 ${lookCount} 张`}>
              <img src="/assets/icons/multi-angle.svg" alt="" aria-hidden />
              {lookCount}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function statusLabel(status: Asset['status']): string {
  return status === 'empty' ? '空壳' : status === 'generating' ? '生成中' : status === 'failed' ? '失败' : '成品'
}

/** 时间格式对齐设计稿：2026年7月23日 11:08 */
function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}
