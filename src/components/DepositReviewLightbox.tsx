/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】DepositReviewLightbox —— 存入申请「大图审核」
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 点抽屉里的某一条待处理 → 全屏铺开：左边一张大图看清楚，右边把这份申请的
 * 元信息摊平，通过 / 驳回都在大图页完成，键盘 Y/N/←/→/Esc 快速过一叠。
 *
 * 它不持有列表，只吃父组件传进来的「待处理行数组 + 当前下标」。通过/驳回后
 * 那一行从数组里消失、下标处自然顶上下一条——父组件负责在空了时关掉本弹窗。
 * ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react'
import type { Category } from '../data/types'
import type { DepositReviewRow } from '../store/useStore'
import { fmtClock } from '../services/fmtTime'
import styles from './DepositReviewLightbox.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色 · 形象', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}

/** demo 里没有真实尺寸/格式字段，给个合理占位，让信息表长得像设计稿。 */
const SPEC_PLACEHOLDER = '1024 × 1536 · PNG'

export function DepositReviewLightbox({
  rows,
  index,
  total,
  paused = false,
  onIndex,
  onApprove,
  onReject,
  onClose,
}: {
  rows: DepositReviewRow[]
  index: number
  total: number              // 待处理总数（用于「1 / N」）
  paused?: boolean           // 理由弹窗叠在上面时置 true，暂停本层所有快捷键
  onIndex: (next: number) => void
  onApprove: (id: string) => void
  onReject: (id: string, name: string) => void
  onClose: () => void
}) {
  const [fit, setFit] = useState<'contain' | 'actual'>('contain')
  const row = rows[index]

  // 键盘：Y 通过 · N 驳回 · ← → 切换 · Esc 关闭。row 有效且未被上层弹窗接管时才绑。
  useEffect(() => {
    if (!row || paused) return
    const onKey = (e: KeyboardEvent) => {
      // 焦点在输入框/文本域时一律不抢键（否则打字母 y/n 会误触发通过/驳回）。
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft') { if (index > 0) onIndex(index - 1); return }
      if (e.key === 'ArrowRight') { if (index < rows.length - 1) onIndex(index + 1); return }
      const k = e.key.toLowerCase()
      if (k === 'y') { onApprove(row.id); return }
      if (k === 'n') { onReject(row.id, row.name); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, index, rows.length, paused, onIndex, onApprove, onReject, onClose])

  if (!row) return null

  return (
    <div className={styles.root} role="dialog" aria-label="存入申请大图审核">
      <div className={styles.scrim} onClick={onClose} />
      <button className={styles.close} onClick={onClose} aria-label="关闭">✕</button>

      <div className={styles.stage}>
        {/* ── 左：大图 + 缩放控件 ── */}
        <div className={styles.imageWrap}>
          {row.cover
            ? <img className={`${styles.image} ${fit === 'actual' ? styles.imageActual : ''}`} src={row.cover} alt={row.name} />
            : <div className={styles.imageEmpty}>无预览图</div>}
          <div className={styles.zoomBar}>
            <button className={`${styles.zoomBtn} ${fit === 'actual' ? styles.zoomOn : ''}`} onClick={() => setFit('actual')}>100%</button>
            <button className={`${styles.zoomBtn} ${fit === 'contain' ? styles.zoomOn : ''}`} onClick={() => setFit('contain')}>适应窗口</button>
          </div>
        </div>

        {/* ── 右：信息 + 操作 ── */}
        <div className={styles.info}>
          <div className={styles.infoTop}>
            <div className={styles.infoTopLeft}>
              <span className={styles.stateTag}>待审核</span>
              <span className={styles.counter}>{index + 1} / {total}</span>
            </div>
            <div className={styles.nav}>
              <button className={styles.navBtn} onClick={() => onIndex(index - 1)} disabled={index <= 0} aria-label="上一条">‹</button>
              <button className={styles.navBtn} onClick={() => onIndex(index + 1)} disabled={index >= rows.length - 1} aria-label="下一条">›</button>
            </div>
          </div>

          <h2 className={styles.name}>{row.name}</h2>

          <dl className={styles.meta}>
            <Field label="类型" value={CATEGORY_LABEL[row.category]} />
            <Field label="申请人" value={row.applicantName} />
            <Field label="来源项目" value={row.fromLabel} />
            <Field label="规格" value={SPEC_PLACEHOLDER} />
            <Field label="提交时间" value={fmtClock(row.createdAt)} />
          </dl>

          {row.sameNameInLibrary && (
            <div className={styles.warn}>
              团队库已有同名资产「{row.name}」，需先让申请人改名后再提交——直接通过会被拦下。
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.approve} onClick={() => onApprove(row.id)}>通过并入库</button>
            <button className={styles.reject} onClick={() => onReject(row.id, row.name)}>驳回</button>
          </div>

          <p className={styles.hint}>
            <kbd>Y</kbd> 通过 · <kbd>N</kbd> 驳回 · <kbd>←</kbd> <kbd>→</kbd> 切换 · <kbd>Esc</kbd> 关闭
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{value}</dd>
    </div>
  )
}
