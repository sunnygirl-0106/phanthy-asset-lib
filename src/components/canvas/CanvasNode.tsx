/**
 * 【画布】CanvasNode —— 一个画布节点（宽图卡片版，对齐截图）
 *
 * 版式：图卡上方浮一行"图标 + 节点名"，右上角一个上传按钮；图卡本身宽、圆角；
 * 图卡右下角一个「预览」按钮，左右两侧中部各一个 ⊕ 连接手柄（连线本期不做，纯装饰）。
 * 上传按钮 = 入口一（保存到资产库）；预览打开大图灯箱。真实生成/连线一律省略。
 */

import { useRef } from 'react'
import { canUploadToProject, type CanvasNode as Node } from '../../services/canvasService'
import styles from './CanvasNode.module.css'

/** 在线占位图（人像照）加载失败（断网等）时回落的本地占位图。 */
const LOCAL_FALLBACK = '/assets/canvas/image-placeholder.svg'

export function CanvasNode({
  node,
  selected,
  onSelect,
  onMove,
  onUpload,
  onPreview,
  onContextMenu,
}: {
  node: Node
  selected: boolean
  onSelect: () => void
  onMove: (id: string, x: number, y: number) => void
  onUpload: () => void
  onPreview: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  // 拖动状态：记下按下点与节点原位，pointermove 时按位移实时更新 x/y（参照 canvas-demo）。
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return // 只有左键拖动；右键留给上下文菜单
    e.stopPropagation()
    onSelect()
    drag.current = { px: e.clientX, py: e.clientY, ox: node.x, oy: node.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    onMove(node.id, Math.max(0, d.ox + e.clientX - d.px), Math.max(0, d.oy + e.clientY - d.py))
  }

  function endDrag(e: React.PointerEvent) {
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已释放，忽略 */
    }
  }

  const canUpload = canUploadToProject(node)
  const hasImage = (node.media === 'image' || node.media === 'video') && node.status === 'done' && !!node.cover

  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''}`}
      style={{ left: node.x, top: node.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e)
      }}
    >
      {/* 图卡上方一行：图标 + 名字，右侧上传按钮 */}
      <div className={styles.header}>
        <span className={styles.headLeft}>
          <ImageGlyph />
          <span className={styles.code}>{node.name}</span>
        </span>
        {canUpload && (
          <button
            className={styles.uploadBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onUpload()
            }}
            title="保存到资产库"
            aria-label="保存到资产库"
          >
            <UploadIcon />
          </button>
        )}
      </div>

      {/* 图卡 + 侧边连接手柄 */}
      <div className={styles.cardWrap}>
        <div className={styles.card}>
          {node.media === 'text' ? (
            <div className={styles.textBody}>{node.content || '（文本内容）'}</div>
          ) : node.media === 'audio' ? (
            <div className={styles.audioBody}>♪ {node.name}</div>
          ) : node.status !== 'done' ? (
            <div className={styles.pending}>生成中…</div>
          ) : node.cover ? (
            <img
              className={styles.cover}
              src={node.cover}
              alt={node.name}
              draggable={false}
              onError={(e) => {
                const img = e.currentTarget
                if (img.dataset.fell) return
                img.dataset.fell = '1'
                img.src = LOCAL_FALLBACK
              }}
            />
          ) : (
            <div className={styles.pending}>无预览</div>
          )}

          {hasImage && (
            <button
              className={styles.previewBtn}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
            >
              <EyeIcon />
              预览
            </button>
          )}
        </div>

        {/* 左右连接手柄（连线本期不实现，纯装饰） */}
        <span className={`${styles.handle} ${styles.handleLeft}`} aria-hidden="true"><PlusDot /></span>
        <span className={`${styles.handle} ${styles.handleRight}`} aria-hidden="true"><PlusDot /></span>
      </div>
    </div>
  )
}

/* ── 内联图标 ── */

function ImageGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5 18l5-5 4 4 3-3 2 2" strokeLinecap="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

function PlusDot() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 7v10M7 12h10" />
    </svg>
  )
}
