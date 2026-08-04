/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】DepositRequestDrawer —— 资产存入申请抽屉（主账号处理）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 【为什么是抽屉不是页面】主账号只有这一种待办，撑不起一个页面——v1 里他进审核中心
 * 只看到一个 Tab 的 Tab 条，那就是个废件。更重要的是：批准之后资产就落进背后的团队库网格里，
 * 抽屉一关就看到东西进来了，这个闭环反馈是独立页面给不了的。所以做成从右侧滑出、半透明遮罩
 * 盖住（但不盖死）团队库网格的抽屉。
 *
 * 数据复用 store 里已有的 selectDepositRows（不另造派生逻辑）；审批动作只调 store。
 * 抽屉的开关是路由状态（#/team/deposits），由 TeamLibraryPage 挂载；这里只负责内容与关闭回调。
 * ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react'
import { useStore, selectDepositRows, type ActionResult, type DepositReviewRow } from '../store/useStore'
import { DEPOSIT_REJECT_REASONS } from '../data/reviewReasons'
import { ReviewReasonModal } from './ReviewReasonModal'
import styles from './DepositRequestDrawer.module.css'

const STATUS_TAG: Record<string, { label: string; cls: string }> = {
  approved: { label: '已通过', cls: 'tagOk' },
  rejected: { label: '已驳回', cls: 'tagNo' },
}

export function DepositRequestDrawer({ onClose }: { onClose: () => void }) {
  const world = useStore((s) => s.world)
  const applications = useStore((s) => s.applications)
  const approve = useStore((s) => s.approveApplication)
  const reject = useStore((s) => s.rejectApplication)

  const [result, setResult] = useState<ActionResult | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null)
  const [showProcessed, setShowProcessed] = useState(false)

  // Esc 关闭（点遮罩 / 关闭按钮也走 onClose）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = useMemo(() => selectDepositRows(useStore.getState()), [world, applications])
  const pending = rows.filter((r) => r.status === 'pending')
  const processed = rows.filter((r) => r.status !== 'pending')

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-label="资产存入申请">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h3 className={styles.title}>团队资产存入申请</h3>
            <p className={styles.sub}>子账号把项目里的资产存进团队库，需要你点头</p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="关闭">✕</button>
        </header>

        {result && (
          <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
            {result.ok ? '✅ ' : '⚠️ '}{result.message}
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.groupTitle}>待处理（{pending.length}）</div>
          {pending.length === 0 ? (
            <p className={styles.empty}>暂无待处理的申请。</p>
          ) : (
            pending.map((r) => (
              <PendingRow
                key={r.id}
                row={r}
                onApprove={() => setResult(approve(r.id))}
                onReject={() => setRejectTarget({ id: r.id, name: r.name })}
              />
            ))
          )}

          {processed.length > 0 && (
            <>
              <button className={styles.processedToggle} onClick={() => setShowProcessed((v) => !v)}>
                已处理（{processed.length}） <span className={styles.caret}>{showProcessed ? '▲' : '▼'}</span>
              </button>
              {showProcessed && processed.map((r) => <ProcessedRow key={r.id} row={r} />)}
            </>
          )}
        </div>
      </aside>

      {rejectTarget && (
        <ReviewReasonModal
          title={`驳回资产存入申请「${rejectTarget.name}」`}
          presets={DEPOSIT_REJECT_REASONS}
          confirmText="确认驳回"
          onConfirm={(reason) => { setResult(reject(rejectTarget.id, reason)); setRejectTarget(null) }}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}

/** 缩略图：查得到封面就画图，查不到给占位块（不要崩）。 */
function Thumb({ src }: { src: string }) {
  return src ? <img className={styles.thumb} src={src} alt="" /> : <div className={styles.thumbEmpty} />
}

function PendingRow({ row, onApprove, onReject }: { row: DepositReviewRow; onApprove: () => void; onReject: () => void }) {
  return (
    <div className={styles.row}>
      <Thumb src={row.cover} />
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{row.name}</div>
        <div className={styles.rowMeta}>申请人：{row.applicantName} · 来自：{row.fromLabel}</div>
      </div>
      <div className={styles.rowActions}>
        <button className={styles.btn} onClick={onApprove}>通过</button>
        <button className={styles.btnGhost} onClick={onReject}>驳回</button>
      </div>
    </div>
  )
}

function ProcessedRow({ row }: { row: DepositReviewRow }) {
  const tag = STATUS_TAG[row.status]
  return (
    <div className={`${styles.row} ${styles.rowDone}`}>
      <Thumb src={row.cover} />
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{row.name}</div>
        <div className={styles.rowMeta}>申请人：{row.applicantName} · 来自：{row.fromLabel}</div>
        {row.reason && <div className={styles.reason}>理由：{row.reason}</div>}
      </div>
      {tag && <span className={`${styles.tag} ${styles[tag.cls]}`}>{tag.label}</span>}
    </div>
  )
}
