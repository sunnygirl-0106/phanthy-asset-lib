/**
 * App.tsx —— 应用外壳
 *
 * 现在它把两块拼在一起：
 *   - LibraryPage：三层库浏览页（主体）
 *   - PersonaSwitcher：右下角人物切换器（悬浮在所有内容之上）
 *
 * 之所以这么薄，是因为真正的东西都在各自的文件里：
 * 数据在 data/，规则在 services/，全局状态在 store/，页面在 pages/，UI 块在 components/。
 * App 只负责"把它们摆在一起"。这就是分层带来的清爽。
 */

import { LibraryPage } from './pages/LibraryPage'
import { PersonaSwitcher } from './components/PersonaSwitcher'

export function App() {
  return (
    <>
      <LibraryPage />
      <PersonaSwitcher />
    </>
  )
}
