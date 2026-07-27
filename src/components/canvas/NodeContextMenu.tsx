/**
 * 【画布 · 入口一】NodeContextMenu —— 成品节点右键菜单
 *
 * 「上传到项目资产库」是唯一入库闸门，只对"成品 + 图片/音频 + 尚未是项目资产"的节点显示
 * （技术规划 §2.1，稳定性检查 ①②⑤）。不满足时给一句灰字说明为什么不能传。
 * 另提供"标记为成品"（本 Demo 用它代替真实生成完成）与"删除节点"。
 */

import { canUploadToProject, categoriesForMedia, type CanvasNode } from '../../services/canvasService'
import styles from './NodeContextMenu.module.css'

export function NodeContextMenu({
  node,
  x,
  y,
  onMarkDone,
  onUpload,
  onDelete,
  onClose,
}: {
  node: CanvasNode
  x: number
  y: number
  onMarkDone: () => void
  onUpload: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const canUpload = canUploadToProject(node)
  const uploadableMedia = categoriesForMedia(node.media).length > 0
  const isProjectAsset = node.source?.scope === 'project'

  // 为什么不能上传的一句话（仅在成品但不可传时给）。
  let disabledReason = ''
  if (node.status === 'done' && !canUpload) {
    if (!uploadableMedia) disabledReason = '文本 / 视频不入库'
    else if (isProjectAsset) disabledReason = '已是项目资产，无需重复入库'
  }

  return (
    <>
      {/* 点击空白处关闭 */}
      <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className={styles.menu} style={{ left: x, top: y }}>
        {node.status !== 'done' && (
          <button className={styles.item} onClick={onMarkDone}>
            标记为成品
            <span className={styles.hint}>（本 Demo 代替真实生成完成）</span>
          </button>
        )}

        {canUpload && (
          <button className={`${styles.item} ${styles.primary}`} onClick={onUpload}>
            上传到项目资产库
          </button>
        )}

        {disabledReason && <div className={styles.disabled}>不可上传 · {disabledReason}</div>}

        <button className={`${styles.item} ${styles.danger}`} onClick={onDelete}>
          删除节点
        </button>
      </div>
    </>
  )
}
