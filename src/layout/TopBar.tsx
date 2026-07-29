/**
 * 【布局】TopBar —— 深色顶栏 + 四大板块导航
 *
 * 四板块（技术规划 §4.1）：创作中心 / 项目管理 / 团队资产库 / 素材广场
 *   （创作中心点击最频繁，排第一位）。
 * v6 视觉对齐团队资产库 Figma（node 1:2 的 TopNavBar）：
 *   左：品牌 logo + PhanthyMovie；中：四板块（当前板块白字 + 青色下划线，其余灰字）；
 *   右：充值中心（青色）+ 通知铃铛 + 头像菜单（审核中心从这里进）。
 *
 * 顶栏只管"当前在哪个板块高亮 + 点了去哪"，具体页面渲染在 AppShell 里按 route 分发。
 * 高亮判断：项目相关子路由（project）都归到"项目管理"板块。
 */

import type { Route } from '../hooks/useHashRoute'
import { NotificationBell } from '../components/NotificationBell'
import { AvatarMenu } from './AvatarMenu'
import styles from './TopBar.module.css'

const NAV: { key: Route['name']; label: string; to: string }[] = [
  { key: 'home', label: '创作中心', to: '#/home' },
  { key: 'projects', label: '项目管理', to: '#/projects' },
  { key: 'team', label: '团队资产库', to: '#/team' },
  { key: 'plaza', label: '素材广场', to: '#/plaza' },
]

export function TopBar({
  route,
  navigate,
}: {
  route: Route
  navigate: (to: Route | string) => void
}) {
  // 项目工作台/画布/工作流等 project.* 路由，顶栏都算在"项目管理"板块高亮。
  const activeKey: Route['name'] = route.name === 'project' ? 'projects' : route.name

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img className={styles.logo} src="/assets/icons/brand-logo.svg" alt="" aria-hidden />
        <span className={styles.brandName}>PhanthyMovie</span>
      </div>

      <nav className={styles.nav}>
        {NAV.map((item) => (
          <button
            key={item.key}
            className={`${styles.tab} ${activeKey === item.key ? styles.tabActive : ''}`}
            onClick={() => navigate(item.to)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.right}>
        <button className={styles.recharge}>充值中心</button>
        <NotificationBell />
        <AvatarMenu route={route} navigate={navigate} />
      </div>
    </header>
  )
}
