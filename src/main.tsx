/**
 * 入口文件：把 React 应用挂到 index.html 里那个 <div id="root"> 上。
 * 现在界面还很简陋——因为我们这一阶段的重点是"逻辑内核"，不是界面。
 * 等逻辑站稳了，下一阶段再在它上面搭真正的页面（切换器、资产网格等）。
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// 深色外壳的两块地基：先 token 再全局基底，顺序不能反（global 里要用到 theme 的变量）。
import './styles/theme.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
