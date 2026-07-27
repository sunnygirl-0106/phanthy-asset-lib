/**
 * 【画布】CanvasNode —— 一个画布节点（4 种基础媒介 · 三态）
 *
 * 纯展示：按 media 显示不同占位（文本/图片/视频/音频），按 status 显示成品/生成中/空壳。
 * 真实 AI 生成一律省略、用占位假图（技术规划 §2.4）。选中/右键交给上层处理。
 */

import type { CanvasNode as Node } from '../../services/canvasService'
import styles from './CanvasNode.module.css'

const MEDIA_LABEL: Record<Node['media'], string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}

const STATUS_LABEL: Record<Node['status'], string> = {
  empty: '空壳',
  generating: '生成中',
  done: '成品',
}

export function CanvasNode({
  node,
  selected,
  onSelect,
  onContextMenu,
}: {
  node: Node
  selected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''}`}
      style={{ left: node.x, top: node.y }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e)
      }}
    >
      <div className={styles.head}>
        <span className={styles.media}>{MEDIA_LABEL[node.media]}</span>
        <span className={`${styles.status} ${styles['status_' + node.status]}`}>
          {STATUS_LABEL[node.status]}
        </span>
      </div>

      <div className={styles.bodyWrap}>
        {node.media === 'text' ? (
          <div className={styles.textBody}>{node.content || '（文本内容）'}</div>
        ) : node.media === 'audio' ? (
          <div className={styles.audioBody}>♪ {node.name}</div>
        ) : node.status !== 'done' ? (
          <div className={styles.pending}>{STATUS_LABEL[node.status]}…</div>
        ) : node.cover ? (
          <img className={styles.cover} src={node.cover} alt={node.name} />
        ) : (
          <div className={styles.pending}>无预览</div>
        )}
      </div>

      <div className={styles.name}>{node.name}</div>
    </div>
  )
}
