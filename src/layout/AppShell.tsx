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
import { TopBar } from './TopBar'
import { HomePage } from '../pages/HomePage'
import { ProjectsPage } from '../pages/ProjectsPage'
import { ProjectShell } from '../pages/ProjectShell'
import { WorkflowShell } from '../pages/WorkflowShell'
import { CanvasShell } from '../pages/CanvasShell'
import { TeamLibraryPage } from '../pages/TeamLibraryPage'
import { PlazaPage } from '../pages/PlazaPage'
import { ReviewCenterPage } from '../pages/ReviewCenterPage'
import { PersonaSwitcher } from '../components/PersonaSwitcher'
import styles from './AppShell.module.css'

export function AppShell() {
  const { route, navigate } = useHashRoute()

  // 无限画布是沉浸式整页：自带顶栏，不叠全局四板块顶栏（对齐截图）。
  const immersive = route.name === 'canvas'

  return (
    <>
      {!immersive && <TopBar route={route} navigate={navigate} />}

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
        // v2：审核中心恒定渲染，页面自己按角色分流（仅 admin 见内容，其余见指路提示）。
        return <ReviewCenterPage />
      case 'canvas':
        // 某一张无限画布：沉浸式整页，自带顶栏 + 左侧悬浮工具条。
        return <CanvasShell pid={route.pid} cid={route.cid} navigate={navigate} />
      case 'project':
        // 工作流是沉浸式整页（自有左栏），不套工作台框架。
        if (route.tab === 'workflow') return <WorkflowShell pid={route.pid} navigate={navigate} />
        // canvases（画布列表） / assets（项目资产库）→ 项目工作台外壳
        return <ProjectShell pid={route.pid} tab={route.tab} navigate={navigate} />
    }
  }
}
