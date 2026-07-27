/**
 * 【页面】TeamLibraryPage —— 团队资产库（原"公共资产库"改名）
 *
 * = AssetGrid(team)，外加一个动态标题：
 *   一人团队（名下没有子账号）→ 标题显示"我的资产库"；有子账号 → "团队资产库"。
 * （技术规划 §4.1）标题逻辑随团队状态翻，从原 LibraryPage 的 teamScopeLabel 迁来。
 */

import { useStore, useCurrentUser } from '../store/useStore'
import { AssetGrid } from '../components/AssetGrid'
import page from './page.module.css'

export function TeamLibraryPage() {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  return (
    <div className={page.page}>
      <div className={page.header}>
        <h1 className={page.title}>{teamTitle(user, world)}</h1>
        <p className={page.subtitle}>我/团队跨项目反复用的常驻母版库</p>
      </div>
      <AssetGrid scope="team" />
    </div>
  )
}

/** 团队库标题随团队状态翻：一人团队 = "我的资产库"，有子账号 = "团队资产库"。 */
function teamTitle(
  user: { teamId?: string; role: string },
  world: { users: { role: string; teamId?: string }[] },
): string {
  if (user.role === 'admin') return '团队库（治理）'
  const hasSubs = world.users.some((u) => u.role === 'sub' && u.teamId === user.teamId)
  return hasSubs ? '团队资产库' : '我的资产库'
}
