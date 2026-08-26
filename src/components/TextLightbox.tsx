/**
 * 【组件】TextLightbox —— 「其他」文本全文查看弹窗
 *
 * 「其他」类目里的文本片段点「查看」即弹窗看全文（不再走整套详情二级页）。
 * 卡面正文只能截断预览，这里居中弹窗铺满全文（保留换行、可滚动），底部给「复制 / 使用」。
 * 与 VideoLightbox 同一套弹窗观感（居中卡片 + 顶部标题 + Esc 关闭）。
 */

import { useEffect, useState } from 'react'
import styles from './TextLightbox.module.css'

export function TextLightbox({
  name,
  text,
  onClose,
  onUse,
}: {
  name: string
  text: string
  onClose: () => void
  /** 「使用」：把这段文本落到画布（文本节点）。给了才出按钮。 */
  onUse?: () => void
}) {
  const [copied, setCopied] = useState(false)

  // Esc 关闭（与视频灯箱 / 详情弹窗一致）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function copy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  return (
    <div className={styles.root} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{name}</span>
          <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.text}>{text || '（暂无正文）'}</p>
        </div>

        <div className={styles.bar}>
          <button className={styles.ghostBtn} onClick={copy}>{copied ? '已复制' : '复制'}</button>
          {onUse && <button className={styles.primaryBtn} onClick={onUse}>使用</button>}
        </div>
      </div>
    </div>
  )
}
