/**
 * 【页面】ProjectsPage —— 项目管理
 *
 * 列出"当前账号进得去的项目"（技术规划 §4.1：切人物即重算）。
 * 可见性委托 permission.canSeeProjectAssets——admin 治理视角、主账号看自己团队、
 * 子账号只看被分配进的项目。点项目卡 → 项目工作台 #/project/:pid（阶段 3 填充）。
 *
 * 本期只读展示现有项目（技术规划 §9：不放"新建项目"）。
 */

import { useStore, useCurrentUser } from '../store/useStore'
import { canSeeProjectAssets, getTeam } from '../services/permission'
import type { Route } from '../hooks/useHashRoute'
import page from './page.module.css'
import styles from './ProjectsPage.module.css'

export function ProjectsPage({ navigate }: { navigate: (to: Route | string) => void }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  // 当前账号进得去的项目（切账号立刻重算——单一数据源的派生视图）。
  const accessible = world.projects.filter((p) => {
    const team = getTeam(world, p.teamId)
    return team ? canSeeProjectAssets(user, p, team) : false
  })

  return (
    <div className={page.page}>
      <div className={page.header}>
        <h1 className={page.title}>项目管理</h1>
        <p className={page.subtitle}>点开一个项目，进它的工作台（选创作模式 / 看项目资产库）</p>
      </div>

      {accessible.length === 0 ? (
        <div className={styles.empty}>
          当前账号没有可进入的项目。
          <br />
          试试右下角切换到别的账号。
        </div>
      ) : (
        <div className={styles.grid}>
          {accessible.map((p) => (
            <button
              key={p.id}
              className={styles.card}
              onClick={() => navigate(`#/project/${p.id}`)}
            >
              <div className={styles.coverWrap}>
                <img className={styles.cover} src={p.cover} alt={p.name} />
              </div>
              <div className={styles.meta}>
                <div className={styles.name}>{p.name}</div>
                <div className={styles.sub}>
                  {world.assets.filter((a) => a.scope === 'project' && a.scopeId === p.id).length} 项资产
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
