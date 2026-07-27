/**
 * 【页面】ProjectWorkspace —— 项目工作台（模式选择 + 项目资产库）
 *
 * 承接（技术规划 §4.1）：项目管理点开一个项目 → 这里。
 * 两个子页签：
 *   · 概览      → 选创作模式（工作流 / 无限画布）两张入口卡，点了进对应模式
 *   · 项目资产库 → AssetGrid(project, pid)，看本项目在用的资产池
 *
 * 工作流 / 画布是"沉浸式"整页（各有自己的左栏），不套在本工作台的框里，
 * 由 AppShell 直接分发（tab=workflow → WorkflowShell，tab=canvas → 阶段 4）。
 * 所以本页只处理 overview / assets 两个 tab。
 */

import type { Route } from '../hooks/useHashRoute'
import { useStore, useCurrentUser } from '../store/useStore'
import { getProject, getTeam, canSeeProjectAssets } from '../services/permission'
import { AssetGrid } from '../components/AssetGrid'
import { HomeEntryCard } from '../components/HomeEntryCard'
import page from './page.module.css'
import styles from './ProjectWorkspace.module.css'

export function ProjectWorkspace({
  pid,
  tab,
  navigate,
}: {
  pid: string
  tab: 'overview' | 'assets'
  navigate: (to: Route | string) => void
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const project = getProject(world, pid)

  // 无权限 / 项目不存在 → 挡回项目管理。切人物即重算（红线 4）。
  const team = project ? getTeam(world, project.teamId) : undefined
  const allowed = project && team ? canSeeProjectAssets(user, project, team) : false

  if (!project || !allowed) {
    return (
      <div className={page.page}>
        <div className={styles.blocked}>
          当前账号无法进入该项目。
          <br />
          <button className={styles.back} onClick={() => navigate('#/projects')}>← 返回项目管理</button>
        </div>
      </div>
    )
  }

  const assetCount = world.assets.filter((a) => a.scope === 'project' && a.scopeId === pid).length

  return (
    <div className={page.page}>
      {/* 项目头 */}
      <div className={styles.head}>
        <button className={styles.back} onClick={() => navigate('#/projects')}>← 项目管理</button>
        <div className={styles.headMain}>
          <img className={styles.cover} src={project.cover} alt={project.name} />
          <div>
            <h1 className={styles.name}>{project.name}</h1>
            <p className={styles.meta}>{assetCount} 项项目资产</p>
          </div>
        </div>
      </div>

      {/* 子页签 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => navigate(`#/project/${pid}`)}
        >
          概览
        </button>
        <button
          className={`${styles.tab} ${tab === 'assets' ? styles.tabActive : ''}`}
          onClick={() => navigate(`#/project/${pid}/assets`)}
        >
          项目资产库
        </button>
      </div>

      {tab === 'assets' ? (
        <AssetGrid scope="project" projectId={pid} />
      ) : (
        <div className={styles.modeCards}>
          <HomeEntryCard
            icon="/assets/home/home-workflow.svg"
            title="进入工作流"
            desc="剧本拆解 → 分镜 → 逐镜生成的流水线式创作。"
            onClick={() => navigate(`#/project/${pid}/workflow`)}
          />
          <HomeEntryCard
            icon="/assets/home/home-canvas.svg"
            title="进入无限画布"
            desc="自由摆放节点的草稿台，右键把成品上传成项目资产。"
            onClick={() => navigate(`#/project/${pid}/canvas`)}
          />
        </div>
      )}
    </div>
  )
}
