/**
 * 【布局】AvatarMenu —— 顶栏右侧头像 + 下拉菜单
 *
 * 【v2 收敛】这个菜单里的「审核中心」现在只服务 admin。
 * 理由：admin 的审核是岗位（他登录就为这个来，会主动找入口），头像菜单对他成立；
 * 主账号的「资产存入申请」是被动打断，不该塞进一个他想不起来的菜单——它改由
 * 通知铃铛推送 + 团队资产库边栏常驻入口触达。所以这里：
 *   · 只有 admin 看到「审核中心」菜单项 + 待办红点（pending 广场投稿数）。
 *   · 主账号 / 子账号看到一句中性提示，并被指去团队资产库处理存入申请。
 */

import { useState, useRef, useEffect } from 'react'
import type { Route } from '../hooks/useHashRoute'
import { useStore, useCurrentUser } from '../store/useStore'
import { canEnterReviewCenter } from '../services/permission'
import styles from './AvatarMenu.module.css'

export function AvatarMenu({
  route,
  navigate,
}: {
  route: Route
  navigate: (to: Route | string) => void
}) {
  const user = useCurrentUser()
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

  // v2：审核中心只对 admin 开。红点也只有 admin 会出现（pending 广场投稿数）。
  const canReview = canEnterReviewCenter(user)
  const pendingForMe = canReview
    ? plazaSubmissions.filter((a) => a.status === 'pending').length
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
              <span>审核中心</span>
              {pendingForMe > 0 && <span className={styles.badge}>{pendingForMe}</span>}
            </button>
          )}

          {!canReview && (
            <div className={styles.hint}>
              <p className={styles.hintMain}>本账号无平台审核权限</p>
              <p className={styles.hintSub}>资产存入申请请在团队资产库处理</p>
            </div>
          )}
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
