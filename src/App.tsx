/**
 * App.tsx —— 应用根组件
 *
 * 阶段 2 起退化成一层薄壳：只挂 AppShell（深色外壳 + 四板块顶栏 + hash 路由）。
 * 真正的东西都在各自文件里：路由在 hooks/useHashRoute，外壳在 layout/，
 * 页面在 pages/，UI 块在 components/，数据/规则/状态在 data·services·store。
 */

import { AppShell } from './layout/AppShell'

export function App() {
  return <AppShell />
}
