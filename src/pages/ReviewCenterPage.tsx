/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【页面】ReviewCenterPage —— 审核中心（v2：admin 专属岗位工作台）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 【v2 收敛】这个页面现在只服务 admin，两个 Tab：
 *   · 作品：只读陈列（真实平台已有作品审核，这里只说明素材 Tab 加在哪）。
 *   · 素材：本次重点——广场投稿审核（通过/驳回）+ 已上架素材的下架/重新上架。
 *
 * 主账号的「资产存入申请」不再在这里——它是被动打断，改由通知铃铛 + 团队资产库边栏入口触达，
 * 在团队库上开抽屉（DepositRequestDrawer）处理。所以本页无权限进入者一律指路团队资产库。
 *
 * 页面自己不算规则：能不能进由 permission.canEnterReviewCenter（v2 = 仅 admin）说了算；
 * 列表数据走 store 的 selectPlazaReviewRows（把投稿记录 + 广场资产碾平成统一行），页面只管渲染。
 * ─────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react'
import type { Category } from '../data/types'
import {
  useStore,
  useCurrentUser,
  selectPlazaReviewRows,
  type ActionResult,
  type PlazaReviewRow,
} from '../store/useStore'
import { canEnterReviewCenter } from '../services/permission'
import { AssetDetail } from '../components/AssetDetail'
import { ReviewReasonModal } from '../components/ReviewReasonModal'
import { PLAZA_WORKS, fmtLike } from '../data/plazaWorks'
import { PLAZA_REJECT_REASONS, PLAZA_DELIST_REASONS } from '../data/reviewReasons'
import styles from './ReviewCenterPage.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}

/** 素材 Tab 的状态筛选项。 */
const MATERIAL_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'listed', label: '已上架' },
  { key: 'delisted', label: '已下架' },
  { key: 'rejected', label: '已驳回' },
] as const

/** 素材行的状态标签文案与配色。 */
const STATUS_TAG: Record<string, { label: string; cls: 'ok' | 'no' | 'warn' | 'wait' }> = {
  pending: { label: '待审核', cls: 'wait' },
  listed: { label: '已上架', cls: 'ok' },
  delisted: { label: '已下架', cls: 'warn' },
  rejected: { label: '已驳回', cls: 'no' },
  approved: { label: '已通过', cls: 'ok' },
}

/** 驳回/下架理由弹窗的意图（决定预设理由 + 确认后调哪个 action）。 */
type ReasonAction =
  | { type: 'rejectPlaza'; id: string; name: string }
  | { type: 'delist'; id: string; name: string }

export function ReviewCenterPage() {
  const user = useCurrentUser()

  // 全局态切片（reactive）：selector 在 useMemo 里用 getState() 取全量，随这些切片变化重算。
  const world = useStore((s) => s.world)
  const plazaSubmissions = useStore((s) => s.plazaSubmissions)

  const approvePlaza = useStore((s) => s.approvePlazaSubmission)
  const rejectPlaza = useStore((s) => s.rejectPlazaSubmission)
  const delistPlaza = useStore((s) => s.runDelistPlaza)
  const relistPlaza = useStore((s) => s.runRelistPlaza)

  // v2：只有作品 / 素材两个 Tab（都归 admin）。默认停在"要干活"的素材。
  const [tab, setTab] = useState<'works' | 'materials'>('materials')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null)
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  const plazaRows = useMemo(
    () => selectPlazaReviewRows(useStore.getState()),
    [world, plazaSubmissions],
  )

  if (!canEnterReviewCenter(user)) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>审核中心仅平台管理员可用。资产存入申请请到团队资产库处理。</p>
      </div>
    )
  }

  const pendingMaterials = plazaRows.filter((r) => r.status === 'pending').length
  const showFilter = tab !== 'works'

  function switchTab(next: 'works' | 'materials') {
    setTab(next)
    setStatusFilter('all') // 换 Tab 重置筛选
  }

  /** 理由弹窗确认：按意图分发到对应 store action。 */
  function confirmReason(reason?: string) {
    if (!reasonAction) return
    if (reasonAction.type === 'rejectPlaza') setResult(rejectPlaza(reasonAction.id, reason))
    else if (reasonAction.type === 'delist') setResult(delistPlaza(reasonAction.id, reason))
    setReasonAction(null)
  }

  const reasonPresets = reasonAction?.type === 'delist' ? PLAZA_DELIST_REASONS : PLAZA_REJECT_REASONS
  const reasonTitle =
    reasonAction?.type === 'rejectPlaza' ? `驳回投稿「${reasonAction.name}」`
      : reasonAction?.type === 'delist' ? `下架「${reasonAction.name}」`
      : ''
  const reasonConfirm = reasonAction?.type === 'delist' ? '确认下架' : '确认驳回'

  return (
    <div className={styles.page}>
      {/* ── 页头：标题 + 副标题（左）· 状态筛选（右）── */}
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>审核中心</h2>
          <p className={styles.sub}>审核发布内容、处理下架与重新上架</p>
        </div>
        {showFilter && (
          <label className={styles.filterWrap}>
            <span className={styles.filterLabel}>状态</span>
            <select className={styles.filter} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {MATERIAL_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
        )}
      </header>

      {/* ── Tab 条：作品 / 素材（v2 恒定两项）── */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'works' ? styles.tabOn : ''}`} onClick={() => switchTab('works')}>
          作品
        </button>
        <button className={`${styles.tab} ${tab === 'materials' ? styles.tabOn : ''}`} onClick={() => switchTab('materials')}>
          素材{pendingMaterials > 0 && <span className={styles.tabBadge}>{pendingMaterials}</span>}
        </button>
      </div>

      <Result result={result} />

      {tab === 'works' && <WorksPanel />}

      {tab === 'materials' && (
        <MaterialPanel
          rows={plazaRows.filter((r) => statusFilter === 'all' || r.status === statusFilter)}
          categoryLabel={(c) => CATEGORY_LABEL[c]}
          onOpen={(id) => setDetailAssetId(id)}
          onApprove={(id) => setResult(approvePlaza(id))}
          onReject={(id, name) => setReasonAction({ type: 'rejectPlaza', id, name })}
          onDelist={(id, name) => setReasonAction({ type: 'delist', id, name })}
          onRelist={(id) => setResult(relistPlaza(id))}
        />
      )}

      {/* 缩略图点开 → 复用全局 AssetDetail 弹窗（不新写预览组件）。 */}
      {detailAssetId && <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />}

      {/* 驳回 / 下架理由弹窗（理由选填）。 */}
      {reasonAction && (
        <ReviewReasonModal
          title={reasonTitle}
          presets={reasonPresets}
          confirmText={reasonConfirm}
          onConfirm={confirmReason}
          onCancel={() => setReasonAction(null)}
        />
      )}
    </div>
  )
}

/* ─────────────────── 「作品」Tab（只读占位）─────────────────── */
/** 真实平台已有作品审核，这里只用假数据做行式陈列，说明素材 Tab 加在哪。操作按钮一律 disabled。 */
function WorksPanel() {
  return (
    <div className={styles.rows}>
      {PLAZA_WORKS.map((w) => (
        <div key={w.id} className={styles.row}>
          <img className={styles.thumbWide} src={w.cover} alt={w.title} />
          <div className={styles.rowMain}>
            <div className={styles.rowName}>{w.title}</div>
            <div className={styles.rowMeta}>{w.author} · {w.dur} · {w.plays} 播放</div>
          </div>
          <span className={styles.likes}>♡ {fmtLike(w.likes)}</span>
          <span className={styles.rowDate}>{w.date}</span>
          <span className={`${styles.tag} ${styles.tagOk}`}>已发布</span>
          <div className={styles.rowActions}>
            <button className={styles.btnGhost} disabled title="demo 不实现作品审核，此处仅用于说明素材 Tab 加在哪">下架</button>
            <button className={styles.btnGhost} disabled title="demo 不实现作品审核，此处仅用于说明素材 Tab 加在哪">审核</button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────── 「素材」Tab（本次重点）─────────────────── */
function MaterialPanel({
  rows,
  categoryLabel,
  onOpen,
  onApprove,
  onReject,
  onDelist,
  onRelist,
}: {
  rows: PlazaReviewRow[]
  categoryLabel: (c: Category) => string
  onOpen: (assetId: string) => void
  onApprove: (submissionId: string) => void
  onReject: (submissionId: string, name: string) => void
  onDelist: (assetId: string, name: string) => void
  onRelist: (assetId: string) => void
}) {
  if (rows.length === 0) {
    return <p className={styles.empty}>该状态下没有素材。切到任意主账号/子账号，在项目里点「贡献到素材广场」，再切回来看看。</p>
  }
  return (
    <div className={styles.rows}>
      {rows.map((r) => {
        const tag = STATUS_TAG[r.status]
        return (
          <div key={r.key} className={styles.row}>
            <button className={styles.thumbBtn} onClick={() => r.assetId && onOpen(r.assetId)} title="查看大图">
              {r.cover ? <img className={styles.thumb} src={r.cover} alt={r.name} /> : <div className={styles.thumbEmpty} />}
            </button>
            <div className={styles.rowMain}>
              <div className={styles.rowName}>{r.name}</div>
              <div className={styles.rowMeta}>
                <span className={styles.catTag}>{categoryLabel(r.category)}</span>
                投稿人：{r.submitterName} · 来自：{r.fromLabel}
              </div>
              {r.reason && <div className={styles.reason}>理由：{r.reason}</div>}
            </div>
            <span className={`${styles.tag} ${tagCls(tag.cls)}`}>{tag.label}</span>
            <div className={styles.rowActions}>
              {r.status === 'pending' && r.submissionId && (
                <>
                  <button className={styles.btn} onClick={() => onApprove(r.submissionId!)}>通过</button>
                  <button className={styles.btnGhost} onClick={() => onReject(r.submissionId!, r.name)}>驳回</button>
                </>
              )}
              {r.status === 'listed' && r.assetId && (
                <button className={styles.btnGhost} onClick={() => onDelist(r.assetId!, r.name)}>下架</button>
              )}
              {r.status === 'delisted' && r.assetId && (
                <button className={styles.btn} onClick={() => onRelist(r.assetId!)}>重新上架</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────── 共用小件 ─────────────────── */
function tagCls(cls: 'ok' | 'no' | 'warn' | 'wait'): string {
  return cls === 'ok' ? styles.tagOk : cls === 'no' ? styles.tagNo : cls === 'warn' ? styles.tagWarn : styles.tagWait
}

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
      {result.ok ? '✅ ' : '⚠️ '}{result.message}
    </div>
  )
}
