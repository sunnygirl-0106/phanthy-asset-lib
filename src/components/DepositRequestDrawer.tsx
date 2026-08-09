/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】DepositRequestDrawer —— 存入记录（主账号处理子账号资产存入）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 【为什么是抽屉不是页面】主账号只有这一种待办，撑不起一个页面。做成从右侧滑出、
 * 半透明遮罩盖住（但不盖死）团队库网格的抽屉——批准之后资产就落进背后的团队库网格里，
 * 抽屉一关就看到东西进来了，这个闭环反馈是独立页面给不了的。
 *
 * 【0816 · 按「存入记录」设计稿重做】
 *   · 名字改叫「存入记录」——不随状态变，审完也说得通；待办与否交给入口角标表达。
 *   · 待处理 / 已处理 两个真 Tab（不再是分组标题 + 折叠）。
 *   · 待处理：顶部「全选 + 全部通过 / 通过所选」批量条，每行带相对时间，通过/驳回竖排。
 *   · 已处理：全部 / 已通过 / 已驳回 子筛选；行右挂状态标签 + 处理时间；页脚「仅显示最近 30 天」。
 *   · 点任一待处理行 → 大图审核（DepositReviewLightbox），通过/驳回也能在大图页完成。
 *
 * 数据复用 store 里已有的 selectDepositRows（不另造派生逻辑）；审批动作只调 store。
 * ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react'
import type { Category } from '../data/types'
import { useStore, selectDepositRows, type ActionResult, type DepositReviewRow } from '../store/useStore'
import { DEPOSIT_REJECT_REASONS } from '../data/reviewReasons'
import { fmtRelTime, fmtClock } from '../services/fmtTime'
import { ReviewReasonModal } from './ReviewReasonModal'
import { DepositReviewLightbox } from './DepositReviewLightbox'
import styles from './DepositRequestDrawer.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}

const STATUS_TAG: Record<string, { label: string; cls: string }> = {
  approved: { label: '已通过', cls: 'tagOk' },
  rejected: { label: '已驳回', cls: 'tagNo' },
}

type Tab = 'pending' | 'processed'
type ProcessedFilter = 'all' | 'approved' | 'rejected'

const PROCESSED_FILTERS: { key: ProcessedFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
]

export function DepositRequestDrawer({
  onClose,
  onApproved,
}: {
  onClose: () => void
  /** 通过若干条后回执给团队库入口（用于侧栏「已通过 N」的 3 秒回执）。 */
  onApproved?: (count: number) => void
}) {
  const world = useStore((s) => s.world)
  const applications = useStore((s) => s.applications)
  const approve = useStore((s) => s.approveApplication)
  const approveAll = useStore((s) => s.approveAllApplications)
  const reject = useStore((s) => s.rejectApplication)

  const [tab, setTab] = useState<Tab>('pending')
  const [processedFilter, setProcessedFilter] = useState<ProcessedFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ActionResult | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)

  const rows = useMemo(() => selectDepositRows(useStore.getState()), [world, applications])
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const processed = useMemo(() => rows.filter((r) => r.status !== 'pending'), [rows])
  const processedShown = useMemo(
    () => processed.filter((r) => processedFilter === 'all' || r.status === processedFilter),
    [processed, processedFilter],
  )

  // Esc 关闭抽屉。但大图审核 / 驳回理由弹窗开着时由它们自己吃 Esc，这里不越俎代庖关抽屉。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && reviewIndex === null && rejectTarget === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, reviewIndex, rejectTarget])

  // 待处理集合一变（通过/驳回后）：清掉已不在集合里的勾选；大图审核下标越界则夹回 / 关闭。
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(pending.map((r) => r.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
    setReviewIndex((i) => {
      if (i === null) return null
      if (pending.length === 0) return null
      return Math.min(i, pending.length - 1)
    })
  }, [pending])

  function runApprove(id: string) {
    const r = approve(id)
    setResult(r)
    if (r.ok) onApproved?.(1)
  }
  function runApproveMany() {
    if (selected.size === 0) {
      const r = approveAll()
      setResult(r)
      if (r.ok) onApproved?.(pending.length)
      return
    }
    // 通过所选：挨个走，统计成功数（同名等会失败，交给结果条汇总）。
    const ids = [...selected]
    let okCount = 0
    for (const id of ids) if (approve(id).ok) okCount++
    setResult(
      okCount === ids.length
        ? { ok: true, message: `已通过所选 ${okCount} 条，写入团队库` }
        : { ok: okCount > 0, message: `已通过 ${okCount} 条，${ids.length - okCount} 条同名跳过（请让申请人改名）` },
    )
    if (okCount > 0) onApproved?.(okCount)
  }
  function runReject(id: string, reason?: string) {
    setResult(reject(id, reason))
  }

  const allSelected = pending.length > 0 && selected.size === pending.length
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pending.map((r) => r.id)))
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const primaryLabel = selected.size === 0 ? '全部通过' : `通过所选（${selected.size}）`
  const sub = tab === 'pending'
    ? '子账号申请把项目资产存入团队库'
    : '审核完的都在这里 · 24 小时内可撤销'

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-label="存入记录">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h3 className={styles.title}>存入记录</h3>
            <p className={styles.sub}>{sub}</p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="关闭">✕</button>
        </header>

        {/* ── Tab 条：待处理 / 已处理 ── */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'pending' ? styles.tabOn : ''}`} onClick={() => setTab('pending')}>
            待处理{pending.length > 0 && <span className={styles.tabBadge}>{pending.length}</span>}
          </button>
          <button className={`${styles.tab} ${tab === 'processed' ? styles.tabOn : ''}`} onClick={() => setTab('processed')}>
            已处理
          </button>
        </div>

        {result && (
          <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
            {result.ok ? '✅ ' : '⚠️ '}{result.message}
          </div>
        )}

        <div className={styles.body}>
          {tab === 'pending' ? (
            pending.length === 0 ? (
              <p className={styles.empty}>暂无待处理的申请。</p>
            ) : (
              <>
                <div className={styles.batchBar}>
                  <label className={styles.checkLabel}>
                    <input type="checkbox" className={styles.check} checked={allSelected} onChange={toggleAll} />
                    全选
                  </label>
                  <button className={styles.batchBtn} onClick={runApproveMany}>{primaryLabel}</button>
                </div>
                {pending.map((r, i) => (
                  <PendingRow
                    key={r.id}
                    row={r}
                    checked={selected.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                    onOpen={() => setReviewIndex(i)}
                    onApprove={() => runApprove(r.id)}
                    onReject={() => setRejectTarget({ id: r.id, name: r.name })}
                  />
                ))}
              </>
            )
          ) : (
            <>
              <div className={styles.chips}>
                {PROCESSED_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`${styles.chip} ${processedFilter === f.key ? styles.chipOn : ''}`}
                    onClick={() => setProcessedFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {processedShown.length === 0 ? (
                <p className={styles.empty}>没有已处理的记录。</p>
              ) : (
                <>
                  {processedShown.map((r) => <ProcessedRow key={r.id} row={r} />)}
                  <div className={styles.footNote}>仅显示最近 30 天 · 查看全部</div>
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {rejectTarget && (
        <ReviewReasonModal
          title={`驳回资产存入申请「${rejectTarget.name}」`}
          presets={DEPOSIT_REJECT_REASONS}
          confirmText="确认驳回"
          onConfirm={(reason) => { runReject(rejectTarget.id, reason); setRejectTarget(null) }}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {reviewIndex !== null && pending[reviewIndex] && (
        <DepositReviewLightbox
          rows={pending}
          index={reviewIndex}
          total={pending.length}
          paused={rejectTarget !== null}
          onIndex={setReviewIndex}
          onApprove={(id) => runApprove(id)}
          onReject={(id, name) => setRejectTarget({ id, name })}
          onClose={() => setReviewIndex(null)}
        />
      )}
    </div>
  )
}

/** 缩略图：查得到封面就画图，查不到给占位块（不要崩）。 */
function Thumb({ src, onClick }: { src: string; onClick?: () => void }) {
  const inner = src ? <img className={styles.thumb} src={src} alt="" /> : <div className={styles.thumbEmpty} />
  return onClick
    ? <button className={styles.thumbBtn} onClick={onClick} title="查看大图审核">{inner}</button>
    : inner
}

function PendingRow({
  row, checked, onToggle, onOpen, onApprove, onReject,
}: {
  row: DepositReviewRow
  checked: boolean
  onToggle: () => void
  onOpen: () => void
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className={`${styles.row} ${checked ? styles.rowChecked : ''}`}>
      <input type="checkbox" className={styles.check} checked={checked} onChange={onToggle} aria-label={`选择 ${row.name}`} />
      <Thumb src={row.cover} onClick={onOpen} />
      <button className={styles.rowMain} onClick={onOpen} title="查看大图审核">
        <div className={styles.rowName}>{row.name}</div>
        <div className={styles.rowMeta}>
          <span className={styles.catTag}>{CATEGORY_LABEL[row.category]}</span>
          {row.applicantName} · 来自「{row.fromLabel}」
        </div>
        <div className={styles.rowTime}>{fmtRelTime(row.createdAt)}</div>
      </button>
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
        <div className={styles.rowMeta}>{row.applicantName} · {row.fromLabel}</div>
        {row.reason && <div className={styles.reason}>理由：{row.reason}</div>}
      </div>
      <div className={styles.rowRight}>
        {tag && <span className={`${styles.tag} ${styles[tag.cls]}`}>{tag.label}</span>}
        <span className={styles.doneTime}>{fmtClock(row.reviewedAt ?? row.createdAt, undefined, false)}</span>
      </div>
    </div>
  )
}
