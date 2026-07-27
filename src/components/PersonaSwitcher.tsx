/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】PersonaSwitcher —— 右下角人物切换器
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个组件负责什么：把所有账号按"平台 / 各团队"分组列出来，点谁就把
 * currentUser 设成谁。它是 Demo 的一等功能——现场演示"换个账号，看到的世界就变"
 * 的唯一手段，不是调试开关。
 *
 * 它自己不含任何权限逻辑，只做两件事：读 world.users 把人列出来、
 * 点击时调用 setCurrentUser。世界怎么变，是别的组件用 canSee() 算出来的。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { User, World } from '../data/types'
import styles from './PersonaSwitcher.module.css'

/** 把用户按"平台 / 团队"分组，方便显示层级。 */
function buildGroups(world: World): { label: string; members: User[] }[] {
  const groups: { label: string; members: User[] }[] = []

  // 平台组：所有 admin
  const admins = world.users.filter((u) => u.role === 'admin')
  if (admins.length) groups.push({ label: '平台', members: admins })

  // 每个团队一组：主账号在前，子账号在后
  for (const team of world.teams) {
    const owner = world.users.find((u) => u.id === team.ownerId)
    const subs = world.users.filter((u) => u.role === 'sub' && u.teamId === team.id)
    if (!owner) continue
    const isSolo = subs.length === 0
    const label = isSolo ? `${owner.name}（个人）` : `${owner.name} 的团队`
    groups.push({ label, members: [owner, ...subs] })
  }

  return groups
}

function roleBadge(role: User['role']): { text: string; className: string } {
  if (role === 'admin') return { text: '管理员', className: styles.badgeAdmin }
  if (role === 'owner') return { text: '主账号', className: styles.badgeOwner }
  return { text: '子账号', className: styles.badgeSub }
}

export function PersonaSwitcher() {
  const world = useStore((s) => s.world)
  const currentUserId = useStore((s) => s.currentUserId)
  const setCurrentUser = useStore((s) => s.setCurrentUser)
  const resetDemo = useStore((s) => s.resetDemo)

  // 常驻但可折叠：默认展开（这是演示主控件），收起后只留一个悬浮小按钮，
  // 免得在画布等页面挡住右下角内容。
  const [open, setOpen] = useState(true)

  const groups = buildGroups(world)
  const current = world.users.find((u) => u.id === currentUserId)

  if (!open) {
    return (
      <button className={styles.fab} onClick={() => setOpen(true)}>
        {current && <img className={styles.fabAvatar} src={current.avatar} alt={current.name} />}
        切换身份
      </button>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.headRow}>
        <p className={styles.title}>切换身份</p>
        <button className={styles.collapse} onClick={() => setOpen(false)} aria-label="收起">收起</button>
      </div>
      <p className={styles.hint}>点不同账号，看到的资产会跟着变</p>

      {groups.map((group) => (
        <div key={group.label}>
          <p className={styles.groupLabel}>{group.label}</p>
          {group.members.map((u) => {
            const badge = roleBadge(u.role)
            const isActive = u.id === currentUserId
            return (
              <button
                key={u.id}
                className={`${styles.row} ${isActive ? styles.active : ''}`}
                onClick={() => setCurrentUser(u.id)}
              >
                <img className={styles.avatar} src={u.avatar} alt={u.name} />
                <span className={styles.name}>{u.name}</span>
                <span className={`${styles.badge} ${badge.className}`}>{badge.text}</span>
              </button>
            )
          })}
        </div>
      ))}

      <button className={styles.resetBtn} onClick={resetDemo}>
        重置 Demo 数据
      </button>
    </div>
  )
}
