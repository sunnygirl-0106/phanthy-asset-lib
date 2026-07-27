/**
 * 【页面】素材广场 —— = AssetGrid(plaza)
 *
 * 官方货架 · 全网可见。逻辑与团队库同源，只是作用域换成 plaza。
 */

import { AssetGrid } from '../components/AssetGrid'
import page from './page.module.css'

export function PlazaPage() {
  return (
    <div className={page.page}>
      <div className={page.header}>
        <h1 className={page.title}>素材广场</h1>
        <p className={page.subtitle}>官方货架 · 全网可见</p>
      </div>
      <AssetGrid scope="plaza" />
    </div>
  )
}
