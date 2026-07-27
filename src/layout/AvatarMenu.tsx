/**
 * 【布局】AvatarMenu —— 顶栏右侧头像 + 下拉菜单
 *
 * 次级功能收纳处（技术规划 §4.1）：审核中心从这里进，仅主账号(owner)/平台管理员(admin) 可见，
 * 带待办红点。红点数按角色不同：
 *   · admin  → 广场投稿里 pending 的条数（广场审核）
 *   · owner  → 自己名下子账号发起、仍 pending 的沉淀申请条数（团队审批）
 *
 * 待办计数逻辑原本在 App.tsx，随审核中心一起搬到这里——顶栏其余部分不必知道它。
 */

import { useState, useRef, useEffect } from 'react'
import type { Route } from '../hooks/useHashRoute'
import { useStore, useCurrentUser } from '../store/useStore'
import { isAdmin, isOwner } from '../services/permission'
import styles from './AvatarMenu.module.css'

export function AvatarMenu({
  route,
  navigate,
}: {
  route: Route
  navigate: (to: Route | string) => void
}) {
  const user = useCurrentUser()
  const world = useStore((s) => s.world)
  const applications = useStore((s) => s.applications)
  const plazaSubmissions = useStore((s) => s.plazaSubmissions)

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 点菜单外面时收起来。
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const owner = isOwner(user)
  const admin = isAdmin(user)
  const canReview = owner || admin

  const reviewLabel = admin ? '广场审核' : '审批中心'
  const pendingForMe = admin
    ? plazaSubmissions.filter((a) => a.status === 'pending').length
    : owner
      ? applications.filter((a) => {
          const applicant = world.users.find((u) => u.id === a.applicantId)
          return applicant?.parentId === user.id && a.status === 'pending'
        }).length
      : 0

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button className={styles.avatarBtn} onClick={() => setOpen((v) => !v)} aria-label="账号菜单">
        <img className={styles.avatar} src={user.avatar} alt={user.name} />
        {canReview && pendingForMe > 0 && <span className={styles.dot}>{pendingForMe}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.identity}>
            <div className={styles.name}>{user.name}</div>
            <div className={styles.role}>{roleLine(user.role)}</div>
          </div>

          {canReview && (
            <button
              className={`${styles.item} ${route.name === 'review' ? styles.itemActive : ''}`}
              onClick={() => {
                navigate('#/review')
                setOpen(false)
              }}
            >
              <span>{reviewLabel}</span>
              {pendingForMe > 0 && <span className={styles.badge}>{pendingForMe}</span>}
            </button>
          )}

          {!canReview && <p className={styles.hint}>子账号无审核权限</p>}
        </div>
      )}
    </div>
  )
}

function roleLine(role: string): string {
  return role === 'admin'
    ? '平台管理员 · 只治理不创作'
    : role === 'owner'
      ? '主账号 · 团队拥有者'
      : '子账号 · 团队成员'
}
