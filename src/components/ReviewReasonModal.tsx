/**
 * 【组件】ReviewReasonModal —— 驳回 / 下架的「填理由」弹窗
 *
 * 审核中心里凡是"要给对方一个交代"的动作（驳回投稿 / 驳回存入 / 下架素材），
 * 都复用这个小弹窗：一排常用理由胶囊（点一下填进输入框，可再改）+ 一个多行输入框。
 *
 * 关键约定：**理由选填**，所以确认按钮永远可点（空着也能提交）。理由会随通知发给对方。
 * 外壳复用通用 Modal，视觉与审核中心页保持一致。
 */

import { useState } from 'react'
import { Modal } from './Modal'
import styles from './ReviewReasonModal.module.css'

export function ReviewReasonModal({
  title,
  presets,
  confirmText,
  onConfirm,
  onCancel,
}: {
  title: string
  presets: readonly string[]
  confirmText: string
  onConfirm: (reason?: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal onClose={onCancel} hideClose panelClassName={styles.panel}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.presets}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.chip} ${reason === p ? styles.chipOn : ''}`}
            onClick={() => setReason(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <textarea
        className={styles.input}
        rows={3}
        placeholder="补充说明（可留空）…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <p className={styles.hint}>理由选填，会随通知发给对方。</p>

      <div className={styles.actions}>
        <button className={styles.btnGhost} onClick={onCancel}>取消</button>
        <button className={styles.btn} onClick={() => onConfirm(reason.trim() || undefined)}>
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
