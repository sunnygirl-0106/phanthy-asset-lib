/**
 * 【布局】AppShell —— 深色外壳 + 路由分发
 *
 * 职责（技术规划 §6）：把顶栏 + 当前路由对应的页面 + 常驻人物切换器摆在一起。
 * 它是"单一数据源 + 派生视图"的最外层：自己不存业务状态，只读 useHashRoute 的 route
 * 决定渲染哪个页面；切人物由右下角 PersonaSwitcher 改 currentUserId，各页面自会重算。
 *
 * 阶段 2 覆盖四个顶级板块 + 审核中心；项目工作台/工作流/画布是阶段 3、4 的活，
 * 这里先给 project.* 路由一个占位，保证本阶段单独可跑。
 */

import { useHashRoute } from '../hooks/useHashRoute'
import { useCurrentUser } from '../store/useStore'
import { isAdmin, isOwner } from '../services/permission'
import { TopBar } from './TopBar'
import { HomePage } from '../pages/HomePage'
import { ProjectsPage } from '../pages/ProjectsPage'
import { ProjectWorkspace } from '../pages/ProjectWorkspace'
import { WorkflowShell } from '../pages/WorkflowShell'
import { CanvasShell } from '../pages/CanvasShell'
import { TeamLibraryPage } from '../pages/TeamLibraryPage'
import { PlazaPage } from '../pages/PlazaPage'
import { ReviewCenterPage } from '../pages/ReviewCenterPage'
import { PersonaSwitcher } from '../components/PersonaSwitcher'
import styles from './AppShell.module.css'

export function AppShell() {
  const { route, navigate } = useHashRoute()
  const user = useCurrentUser()
  const canReview = isOwner(user) || isAdmin(user)

  return (
    <>
      <TopBar route={route} navigate={navigate} />

      <main className={styles.main}>{renderPage()}</main>

      {/* 人物切换器：右下角常驻，悬浮在所有内容之上（技术规划 §4.1） */}
      <PersonaSwitcher />
    </>
  )

  function renderPage() {
    switch (route.name) {
      case 'home':
        return <HomePage navigate={navigate} />
      case 'projects':
        return <ProjectsPage navigate={navigate} />
      case 'team':
        return <TeamLibraryPage />
      case 'plaza':
        return <PlazaPage />
      case 'review':
        // 只有能审的角色进得去；切到无权限账号时回落到创作中心。
        return canReview ? <ReviewCenterPage /> : <HomePage navigate={navigate} />
      case 'project':
        // 工作流 / 画布是沉浸式整页（各有自己的左栏），不套工作台框架。
        if (route.tab === 'workflow') return <WorkflowShell pid={route.pid} navigate={navigate} />
        if (route.tab === 'canvas') return <CanvasShell pid={route.pid} navigate={navigate} />
        // overview / assets → 项目工作台
        return <ProjectWorkspace pid={route.pid} tab={route.tab} navigate={navigate} />
    }
  }
}
