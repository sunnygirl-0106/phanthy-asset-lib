/**
 * 【组件】ConfirmDialog —— 通用二次确认弹窗
 *
 * 目前承载"删除单份资产"（PRD #2 单份删除 / #31 团队库删除）。
 * 抽出来是因为项目资产库和团队资产库要用同一套文案与按钮次序：
 * 标题只问一次、正文讲清代价（删什么、能不能恢复、什么不受影响），
 * 危险动作放右侧。两处各写一遍迟早会漂。
 */

import type { ReactNode } from 'react'
import styles from './ConfirmDialog.module.css'

export function ConfirmDialog({
  title,
  body,
  cancelLabel = '取消',
  confirmLabel = '删除',
  onCancel,
  onConfirm,
}: {
  title: string
  body: ReactNode
  cancelLabel?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onCancel} />
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      >
        <h4 className={styles.title}>{title}</h4>
        <div className={styles.body}>{body}</div>
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onCancel}>{cancelLabel}</button>
          <button className={styles.btnDanger} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
