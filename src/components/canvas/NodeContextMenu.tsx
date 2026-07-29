/**
 * 【画布 · 入口一】NodeContextMenu —— 节点右键菜单（严格对齐截图）
 *
 * 菜单条目与顺序完全照截图：
 *   保存到资产库 / 上传 / 添加节点 —— 撤销 —— 粘贴 —— 创建副本 / 复制节点 —— 删除节点
 * 本 Demo 只实现两个真动作：
 *   · 保存到资产库 → 入库闸门（runSaveToProject，唯一让画布成品进项目库的口子）
 *   · 删除节点     → 从画布移除
 * 其余条目只保界面、点击无反应（尚未实现，按需要再接）。
 */

import { canUploadToProject, type CanvasNode } from '../../services/canvasService'
import styles from './NodeContextMenu.module.css'

interface Row {
  key: string
  label: string
  shortcut?: string
  action?: () => void
  danger?: boolean
  dividerAfter?: boolean
}

export function NodeContextMenu({
  node,
  x,
  y,
  onSave,
  onDelete,
  onClose,
}: {
  node: CanvasNode
  x: number
  y: number
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const canSave = canUploadToProject(node)

  const rows: Row[] = [
    { key: 'save', label: '保存到资产库', action: canSave ? onSave : undefined },
    { key: 'upload', label: '上传' },
    { key: 'add', label: '添加节点', dividerAfter: true },
    { key: 'undo', label: '撤销', shortcut: '⌘Z', dividerAfter: true },
    { key: 'paste', label: '粘贴', shortcut: '⌘V', dividerAfter: true },
    { key: 'duplicate', label: '创建副本', shortcut: '⌘D' },
    { key: 'copy', label: '复制节点', shortcut: '⌘C', dividerAfter: true },
    { key: 'delete', label: '删除节点', shortcut: '⌫', action: onDelete, danger: true },
  ]

  return (
    <>
      {/* 点击空白处 / 再次右键关闭 */}
      <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className={styles.menu} style={{ left: x, top: y }}>
        {rows.map((r) => (
          <div key={r.key}>
            <button
              className={`${styles.item} ${r.danger ? styles.danger : ''} ${r.action ? '' : styles.dim}`}
              onClick={() => r.action?.()}
            >
              <span>{r.label}</span>
              {r.shortcut && <span className={styles.shortcut}>{r.shortcut}</span>}
            </button>
            {r.dividerAfter && <div className={styles.divider} />}
          </div>
        ))}
      </div>
    </>
  )
}
