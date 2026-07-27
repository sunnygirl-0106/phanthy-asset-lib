/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【页面】ReviewCenterPage —— 审核中心（按角色分流）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 平台里有两条要审的上行线，把关人不同，这个页面按当前账号的角色分流：
 *   · 主账号 → 团队沉淀审批：子账号把项目资产"沉淀"进团队库，主账号点头。
 *   · admin  → 广场投稿审核：主账号/子账号把资产"贡献"到素材广场，admin 点头。
 *   · 子账号 → 没有审核权。
 *
 * 页面自己不算规则：能不能审由 store 里的 canApproveDeposit / canReviewPlaza 说了算；
 * 这里只把该角色该看的申请列出来，摆上"通过 / 驳回"。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { isAdmin, isOwner } from '../services/permission'
import styles from './ReviewCenterPage.module.css'

const STATUS_LABEL = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
} as const

export function ReviewCenterPage() {
  const user = useCurrentUser()
  if (isAdmin(user)) return <PlazaReview />
  if (isOwner(user)) return <DepositReview />
  return (
    <div className={styles.page}>
      <p className={styles.empty}>审核中心仅主账号（团队沉淀）和 admin（广场投稿）可用。</p>
    </div>
  )
}

/* ─────────────────── 主账号：团队沉淀审批 ─────────────────── */
function DepositReview() {
  const world = useStore((s) => s.world)
  const applications = useStore((s) => s.applications)
  const approve = useStore((s) => s.approveApplication)
  const reject = useStore((s) => s.rejectApplication)
  const user = useCurrentUser()
  const [result, setResult] = useState<ActionResult | null>(null)

  // 我名下子账号提交的申请
  const mine = applications.filter((a) => {
    const applicant = world.users.find((u) => u.id === a.applicantId)
    return applicant?.parentId === user.id
  })
  const pending = mine.filter((a) => a.status === 'pending')
  const processed = mine.filter((a) => a.status !== 'pending')

  const projName = (id: string | undefined) => world.projects.find((p) => p.id === id)?.name ?? '未知项目'
  const userName = (id: string) => world.users.find((u) => u.id === id)?.name ?? id

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>审批中心 · 团队沉淀</h2>
      <p className={styles.sub}>子账号把项目资产"沉淀"进团队库，需要你这个主账号点头。</p>
      <Result result={result} />

      <p className={styles.groupTitle}>待处理（{pending.length}）</p>
      {pending.length === 0 ? (
        <p className={styles.empty}>没有待审批的申请。切到子账号（如"小林"）在项目里点"沉淀到团队库"，再切回来看看。</p>
      ) : (
        <div className={styles.list}>
          {pending.map((a) => (
            <Card
              key={a.id}
              name={a.assetName}
              meta={`申请人：${userName(a.applicantId)} · 来自：${projName(a.fromScopeId)} → 沉淀进团队库`}
              onApprove={() => setResult(approve(a.id))}
              onReject={() => setResult(reject(a.id))}
            />
          ))}
        </div>
      )}

      <Processed
        items={processed.map((a) => ({
          id: a.id,
          name: a.assetName,
          meta: `申请人：${userName(a.applicantId)} · 来自：${projName(a.fromScopeId)}`,
          status: a.status as 'approved' | 'rejected',
        }))}
      />
    </div>
  )
}

/* ─────────────────── admin：广场投稿审核 ─────────────────── */
function PlazaReview() {
  const world = useStore((s) => s.world)
  const submissions = useStore((s) => s.plazaSubmissions)
  const approve = useStore((s) => s.approvePlazaSubmission)
  const reject = useStore((s) => s.rejectPlazaSubmission)
  const [result, setResult] = useState<ActionResult | null>(null)

  const pending = submissions.filter((a) => a.status === 'pending')
  const processed = submissions.filter((a) => a.status !== 'pending')

  const userName = (id: string) => world.users.find((u) => u.id === id)?.name ?? id
  const fromLabel = (s: { fromScope: 'team' | 'project'; fromScopeId: string | undefined }) =>
    s.fromScope === 'team'
      ? '团队资产库'
      : world.projects.find((p) => p.id === s.fromScopeId)?.name ?? '某项目'

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>广场投稿审核 · admin</h2>
      <p className={styles.sub}>主账号 / 子账号把资产"贡献"到素材广场，需要你（admin）把关后才上架。</p>
      <Result result={result} />

      <p className={styles.groupTitle}>待审核（{pending.length}）</p>
      {pending.length === 0 ? (
        <p className={styles.empty}>没有待审核的投稿。切到任意主账号/子账号，在团队库或项目里点"贡献到素材广场"，再切回 admin 看看。</p>
      ) : (
        <div className={styles.list}>
          {pending.map((a) => (
            <Card
              key={a.id}
              name={a.assetName}
              meta={`投稿人：${userName(a.submitterId)} · 来自：${fromLabel(a)} → 上架素材广场`}
              onApprove={() => setResult(approve(a.id))}
              onReject={() => setResult(reject(a.id))}
            />
          ))}
        </div>
      )}

      <Processed
        items={processed.map((a) => ({
          id: a.id,
          name: a.assetName,
          meta: `投稿人：${userName(a.submitterId)} · 来自：${fromLabel(a)}`,
          status: a.status as 'approved' | 'rejected',
        }))}
      />
    </div>
  )
}

/* ─────────────────── 共用小组件 ─────────────────── */

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
      {result.ok ? '✅ ' : '⚠️ '}
      {result.message}
    </div>
  )
}

function Card({
  name,
  meta,
  onApprove,
  onReject,
}: {
  name: string
  meta: string
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.assetName}>{name}</div>
        <div className={styles.meta}>{meta}</div>
      </div>
      <div className={styles.cardActions}>
        <button className={styles.btn} onClick={onApprove}>通过</button>
        <button className={styles.btnGhost} onClick={onReject}>驳回</button>
      </div>
    </div>
  )
}

function Processed({
  items,
}: {
  items: { id: string; name: string; meta: string; status: 'approved' | 'rejected' }[]
}) {
  if (items.length === 0) return null
  return (
    <>
      <p className={styles.groupTitle}>已处理（{items.length}）</p>
      <div className={styles.list}>
        {items.map((a) => (
          <div key={a.id} className={`${styles.card} ${styles.cardDone}`}>
            <div className={styles.cardMain}>
              <div className={styles.assetName}>{a.name}</div>
              <div className={styles.meta}>{a.meta}</div>
            </div>
            <span className={`${styles.tag} ${a.status === 'approved' ? styles.tagOk : styles.tagNo}`}>
              {STATUS_LABEL[a.status]}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
