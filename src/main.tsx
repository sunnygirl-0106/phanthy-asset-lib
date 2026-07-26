/**
 * 入口文件：把 React 应用挂到 index.html 里那个 <div id="root"> 上。
 * 现在界面还很简陋——因为我们这一阶段的重点是"逻辑内核"，不是界面。
 * 等逻辑站稳了，下一阶段再在它上面搭真正的页面（切换器、资产网格等）。
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
