/**
 * 【组件】Modal —— 通用弹窗外壳
 *
 * 只负责"盖一层半透明遮罩 + 居中一个白面板 + 提供关闭方式"。
 * 里面放什么，由调用者通过 children 传入（这叫组合，比写死内容更可复用）。
 * 点遮罩空白处或右上角 × 都能关闭；按 Esc 也能关。
 */

import { useEffect, type ReactNode } from 'react'
import styles from './Modal.module.css'

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  // 监听 Esc 关闭；组件卸载时记得移除监听，避免内存泄漏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      {/* 阻止冒泡：点面板内部不应该触发遮罩的关闭 */}
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="关闭">
          ×
        </button>
        {children}
      </div>
    </div>
  )
}
