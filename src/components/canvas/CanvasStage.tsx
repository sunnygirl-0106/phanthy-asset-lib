/**
 * 【画布】CanvasStage —— 画板（放节点 · 选中 · 右键 · 接收拖入）
 *
 * 是入口二的落点：左侧面板把资产拖进来时，这里的 onDrop 读出载荷、算出落点坐标，
 * 交给上层造一个新节点（拖入不入库、不产副本——只是多一个画布节点）。
 */

import type { CanvasNode as Node } from '../../services/canvasService'
import { CanvasNode } from './CanvasNode'
import { DRAG_MIME, type DragPayload } from './CanvasAssetPanel'
import styles from './CanvasStage.module.css'

export function CanvasStage({
  nodes,
  selectedId,
  onSelect,
  onNodeContextMenu,
  onDropAsset,
  onStageClick,
}: {
  nodes: Node[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNodeContextMenu: (node: Node, x: number, y: number) => void
  onDropAsset: (payload: DragPayload, x: number, y: number) => void
  onStageClick: () => void
}) {
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const rect = e.currentTarget.getBoundingClientRect()
    // 落点减去节点半宽/半高，让节点大致落在光标处。
    const x = e.clientX - rect.left - 80
    const y = e.clientY - rect.top - 60
    try {
      onDropAsset(JSON.parse(raw) as DragPayload, Math.max(0, x), Math.max(0, y))
    } catch {
      /* 忽略非法载荷 */
    }
  }

  return (
    <div
      className={styles.stage}
      onClick={onStageClick}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={onDrop}
    >
      {nodes.length === 0 && (
        <div className={styles.hint}>
          从左侧「+」加一个节点，或从资产面板拖一个资产进来开始比划。
          <br />
          右键成品的图片/音频节点可「上传到项目资产库」。
        </div>
      )}

      {nodes.map((n) => (
        <CanvasNode
          key={n.id}
          node={n}
          selected={n.id === selectedId}
          onSelect={() => onSelect(n.id)}
          onContextMenu={(e) => onNodeContextMenu(n, e.clientX, e.clientY)}
        />
      ))}
    </div>
  )
}
