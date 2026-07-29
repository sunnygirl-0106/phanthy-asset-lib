/**
 * 【组件】ProjectAssetLibrary —— 项目资产库（画布模式 / 工作流模式共用）
 *
 * 外显对齐团队资产库（复用 AssetCard 满幅大图 + 批量/排序/搜索工具条），
 * 但按截图把类目 Tab 横排在顶部（不再走团队库的左侧类目边栏），
 * 因为项目工作台左栏已经被项目导航占用，类目只能上置。
 *
 * 数据仍走「单一数据源 + 派生视图」：只对同一份 world 里 scope=project & scopeId=pid
 * 那批资产做过滤/排序，不复制数据；切类目/搜索/排序/批量都是页面局部状态。
 * 点卡片开 AssetDetail（沉淀到团队库等操作都在详情里，本次不改）。
 */

import { useMemo, useState } from 'react'
import type { Category } from '../data/types'
import { useStore } from '../store/useStore'
import { AssetCard } from './AssetCard'
import { AssetDetail } from './AssetDetail'
import styles from './ProjectAssetLibrary.module.css'

/** 顶部类目 Tab：顺序对齐团队库与截图（项目资产暂无音频，故不陈列）。 */
const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'character', label: '角色', icon: '/assets/icons/cat-character.svg' },
  { key: 'costume', label: '服装', icon: '/assets/icons/cat-costume.svg' },
  { key: 'scene', label: '场景', icon: '/assets/icons/cat-scene.svg' },
  { key: 'prop', label: '道具', icon: '/assets/icons/cat-prop.svg' },
]

export function ProjectAssetLibrary({ projectId }: { projectId: string }) {
  const world = useStore((s) => s.world)

  const [category, setCategory] = useState<Category>('character')
  const [query, setQuery] = useState('')
  const [sortDesc, setSortDesc] = useState(true) // 时间倒序：默认最新在前
  const [batch, setBatch] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  // 本项目资产池（与画布共享同一批数据）。
  const projectAssets = useMemo(
    () => world.assets.filter((a) => a.scope === 'project' && a.scopeId === projectId),
    [world, projectId],
  )

  // 每个类目的真实数量（Tab 角标）。
  const counts = useMemo(() => {
    const m: Record<Category, number> = { character: 0, costume: 0, scene: 0, prop: 0, audio: 0 }
    for (const a of projectAssets) m[a.category]++
    return m
  }, [projectAssets])

  // 类目 → 搜索 → 排序，派生出当前网格要摆的资产。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projectAssets
      .filter((a) => a.category === category)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .sort((a, b) => (sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [projectAssets, category, query, sortDesc])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exitBatch() {
    setBatch(false)
    setSelected(new Set())
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>项目资产库</h1>

      {/* ── 类目 Tab（顶部横排）+ 工具条 同一行 ── */}
      <div className={styles.bar}>
        <nav className={styles.tabs}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`${styles.tab} ${category === c.key ? styles.tabActive : ''}`}
              onClick={() => setCategory(c.key)}
            >
              {category === c.key && (
                <img className={styles.tabIcon} src={c.icon} alt="" aria-hidden />
              )}
              <span>{c.label}（{counts[c.key]}）</span>
            </button>
          ))}
        </nav>

        <div className={styles.tools}>
          {batch && (
            <span className={styles.batchStatus}>
              已选 {selected.size} 项
              <button className={styles.batchCancel} onClick={exitBatch}>
                取消
              </button>
            </span>
          )}

          <button
            className={`${styles.btn} ${batch ? styles.btnOn : ''}`}
            onClick={() => (batch ? exitBatch() : setBatch(true))}
          >
            <img className={styles.btnIcon} src="/assets/icons/batch-all.svg" alt="" aria-hidden />
            批量操作
          </button>

          <button className={styles.btn} onClick={() => setSortDesc((v) => !v)}>
            <img className={styles.btnIcon} src="/assets/icons/sort-two.svg" alt="" aria-hidden />
            {sortDesc ? '时间倒序' : '时间正序'}
            <img className={styles.btnCaret} src="/assets/icons/chevron-down.svg" alt="" aria-hidden />
          </button>

          <div className={styles.search}>
            <img className={styles.btnIcon} src="/assets/icons/filter-search.svg" alt="" aria-hidden />
            <input
              className={styles.searchInput}
              placeholder="搜索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── 网格 ── */}
      {visible.length === 0 ? (
        <div className={styles.empty}>
          该类目下暂无资产。
          <br />
          试试切换上方类目、清空搜索。
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map((a) => (
            <div
              key={a.id}
              className={`${styles.cell} ${batch && selected.has(a.id) ? styles.cellSelected : ''}`}
            >
              <AssetCard
                asset={a}
                onClick={batch ? () => toggleSelect(a.id) : () => setDetailAssetId(a.id)}
              />
              {batch && (
                <span className={`${styles.check} ${selected.has(a.id) ? styles.checkOn : ''}`}>
                  {selected.has(a.id) ? '✓' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 资产详情弹窗（自带外壳；沉淀到团队库等操作都在里面，本次不改） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}
    </div>
  )
}
