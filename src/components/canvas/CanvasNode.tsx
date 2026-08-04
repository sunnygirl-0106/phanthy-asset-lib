/**
 * 【画布】CanvasNode —— 一个画布节点（宽图卡片版，对齐截图）
 *
 * 版式：图卡上方浮一行"图标 + 节点名"，右上角一个上传按钮；图卡本身宽、圆角；
 * 图卡右下角一个「预览」按钮，左右两侧中部各一个 ⊕ 连接手柄（连线本期不做，纯装饰）。
 * 上传按钮 = 入口一（保存到资产库）；预览打开大图灯箱。真实生成/连线一律省略。
 */

import { useRef } from 'react'
import { canUploadToProject, type CanvasNode as Node } from '../../services/canvasService'
import { assetUrl } from '../../utils/assets'
import styles from './CanvasNode.module.css'

/** 在线占位图（人像照）加载失败（断网等）时回落的本地占位图。 */
const LOCAL_FALLBACK = assetUrl('assets/canvas/image-placeholder.svg')

/** 存原图：同源静态资源用 <a download> 触发浏览器下载（占位图即可）。 */
function downloadNodeImage(src: string, name: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = `${name || 'image'}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function CanvasNode({
  node,
  selected,
  onSelect,
  onMove,
  onUpload,
  onPreview,
  onDelete,
  onContextMenu,
}: {
  node: Node
  selected: boolean
  onSelect: () => void
  onMove: (id: string, x: number, y: number) => void
  onUpload: () => void
  onPreview: () => void
  /** 删除本节点（规则 17 · 图卡右上角 hover 垃圾桶）。复用右键菜单的删除逻辑。 */
  onDelete: () => void
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

          {/* 图片自身操作一律 hover 浮在图上（规则 17）：放大 / 下载 / 删除节点。 */}
          <div className={styles.thumbIcons}>
            {hasImage && (
              <>
                <button
                  className={styles.thumbBtn}
                  title="放大查看"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onPreview() }}
                >
                  <ZoomIcon />
                </button>
                <button
                  className={styles.thumbBtn}
                  title="下载原图"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (node.cover) downloadNodeImage(node.cover, node.name) }}
                >
                  <DownloadIcon />
                </button>
              </>
            )}
            <button
              className={styles.thumbBtn}
              title="删除节点"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete() }}
            >
              <TrashIcon />
            </button>
          </div>
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

function ZoomIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
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
