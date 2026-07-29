/**
 * 【页面】ProjectsPage —— 项目管理（我的项目）
 *
 * 列出"当前账号进得去的项目"（技术规划 §4.1：切人物即重算）。
 * 可见性委托 permission.canSeeProjectAssets——admin 治理视角、主账号看自己团队、
 * 子账号只看被分配进的项目。
 *
 * 点任意项目卡 → 居中弹出 ProjectModeModal（创作模式：工作流 / 全自动 AI 生成 / 无限画布），
 * 选模式后再进对应整页（对齐截图）。本期只读展示现有项目（技术规划 §9：不放"新建项目"）。
 */

import { useMemo, useState } from 'react'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSeeProjectAssets, getTeam } from '../services/permission'
import type { Project } from '../data/types'
import type { Route } from '../hooks/useHashRoute'
import { ProjectModeModal } from '../components/ProjectModeModal'
import styles from './ProjectsPage.module.css'

export function ProjectsPage({ navigate }: { navigate: (to: Route | string) => void }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  const [keyword, setKeyword] = useState('')
  const [desc, setDesc] = useState(true) // 时间倒序（新在前）
  const [picked, setPicked] = useState<Project | null>(null) // 点开哪个项目的创作模式弹窗
  const [menuId, setMenuId] = useState<string | null>(null)

  // 当前账号进得去的项目（切账号立刻重算——单一数据源的派生视图）。
  const accessible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return world.projects
      .filter((p) => {
        const team = getTeam(world, p.teamId)
        return team ? canSeeProjectAssets(user, p, team) : false
      })
      .filter((p) => !kw || p.name.toLowerCase().includes(kw))
      .sort((a, b) => {
        const d = (b.createdAt ?? 0) - (a.createdAt ?? 0)
        return desc ? d : -d
      })
  }, [world, user, keyword, desc])

  return (
    <div className={styles.page} onClick={() => setMenuId(null)}>
      {/* 页头 + 工具条 */}
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>我的项目</h1>
          <p className={styles.subtitle}>管理您的 AI 驱动影视创作</p>
        </div>
        <div className={styles.tools}>
          <div className={styles.search}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              placeholder="关键词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button className={styles.toolBtn} onClick={() => setDesc((v) => !v)}>
            {desc ? '时间倒序' : '时间正序'}
          </button>
        </div>
      </div>

      {accessible.length === 0 ? (
        <div className={styles.empty}>
          当前账号没有可进入的项目。
          <br />
          试试右下角切换到别的账号。
        </div>
      ) : (
        <div className={styles.grid}>
          {accessible.map((p) => {
            const assetCount = world.assets.filter((a) => a.scope === 'project' && a.scopeId === p.id).length
            return (
              <div key={p.id} className={styles.card} onClick={() => setPicked(p)}>
                <div className={styles.coverWrap}>
                  <img className={styles.cover} src={p.cover} alt={p.name} />
                  {p.tag && <span className={styles.tag}>{p.tag}</span>}
                </div>
                <div className={styles.foot}>
                  <div className={styles.metaMain}>
                    <div className={styles.name}>{p.name}</div>
                    <div className={styles.sub}>
                      {formatDate(p.createdAt)} · {assetCount} 项资产
                    </div>
                  </div>
                  <div className={styles.menuWrap}>
                    <button
                      className={styles.menuBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuId((v) => (v === p.id ? null : p.id))
                      }}
                      aria-label="更多"
                    >
                      ⋮
                    </button>
                    {menuId === p.id && (
                      <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
                        <button
                          className={styles.menuItem}
                          onClick={() => {
                            setMenuId(null)
                            navigate(`#/project/${p.id}/assets`)
                          }}
                        >
                          项目资产库
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {picked && (
        <ProjectModeModal project={picked} onClose={() => setPicked(null)} navigate={navigate} />
      )}
    </div>
  )
}

/** 把时间戳格式化成"2026-07-27"（对齐截图）。缺失时回落到占位。 */
function formatDate(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
