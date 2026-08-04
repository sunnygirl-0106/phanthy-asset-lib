/**
 * 【组件】NotificationBell —— 顶部通知铃铛（本期占位版）
 *
 * 只做一件事：把"通知大表"里发给当前账号的通知列出来，未读的显个红点数。
 * 点开就把当前账号的通知标为已读。审核中心通过/驳回后产生的通知，切到申请人账号
 * 就能在这里看到——这条协作线的"回执"。子账号也能收（铃铛对所有账号可见）。
 *
 * 审核中心改造：带 link 的通知（如"有新申请待你审批"）可点，点了跳去对应页面。
 */

import { useState } from 'react'
import { useStore, useCurrentUser } from '../store/useStore'
import styles from './NotificationBell.module.css'

export function NotificationBell({ navigate }: { navigate: (to: string) => void }) {
  const user = useCurrentUser()
  const notifications = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationsRead)
  const [open, setOpen] = useState(false)

  // 发给我的，最新在前
  const mine = notifications.filter((n) => n.toUserId === user.id).slice().reverse()
  const unread = mine.filter((n) => !n.read).length

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) markRead(user.id) // 一打开就算读过了
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.bell} onClick={toggle}>
        🔔 通知
        {unread > 0 && <span className={styles.dot}>{unread}</span>}
      </button>
      {open && (
        <div className={styles.panel}>
          {mine.length === 0 ? (
            <p className={styles.empty}>暂无通知</p>
          ) : (
            mine.map((n) =>
              n.link ? (
                <button
                  key={n.id}
                  className={`${styles.item} ${styles.itemLink}`}
                  onClick={() => { setOpen(false); navigate(n.link!) }}
                >
                  <span className={styles.itemText}>{n.text}</span>
                  <span className={styles.itemArrow} aria-hidden>›</span>
                </button>
              ) : (
                <div key={n.id} className={styles.item}>
                  {n.text}
                </div>
              ),
            )
          )}
        </div>
      )}
    </div>
  )
}
