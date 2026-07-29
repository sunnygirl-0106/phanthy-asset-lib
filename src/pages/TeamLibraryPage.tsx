/**
 * 【页面】TeamLibraryPage —— 团队资产库
 *
 * v6：整页重做，对齐团队资产库 Figma（node 1:2）——
 *   左侧 200px 类目边栏（角色 / 服装 / 场景 / 道具，各带真实数量与图标，当前项青色高亮）
 *   右侧内容：工具条（批量操作 / 智能排序 / 搜索）+ 满幅封面卡片网格。
 *
 * 数据仍走「单一数据源 + 派生视图」：只对同一份 world + currentUser 做过滤/排序，不复制数据。
 * 权限判断委托 services/permission.canSee；卡片视觉复用全局 AssetCard；点卡片开 AssetDetail。
 * 类目/搜索/排序/批量都是页面局部状态，切账号后各自重算。
 */

import { useMemo, useState } from 'react'
import type { Category } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSee } from '../services/permission'
import { AssetCard } from '../components/AssetCard'
import { AssetDetail } from '../components/AssetDetail'
import { assetUrl } from '../utils/assets'
import styles from './TeamLibraryPage.module.css'

/** 边栏类目：顺序与图标对齐设计稿（音频本期团队库无内容，暂不陈列）。 */
const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'character', label: '角色', icon: assetUrl('assets/icons/cat-character.svg') },
  { key: 'costume', label: '服装', icon: assetUrl('assets/icons/cat-costume.svg') },
  { key: 'scene', label: '场景', icon: assetUrl('assets/icons/cat-scene.svg') },
  { key: 'prop', label: '道具', icon: assetUrl('assets/icons/cat-prop.svg') },
]

export function TeamLibraryPage() {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  const [category, setCategory] = useState<Category>('character')
  const [query, setQuery] = useState('')
  const [sortDesc, setSortDesc] = useState(true) // 智能排序：默认最新在前
  const [batch, setBatch] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  // 当前账号在团队库里能看到的全部资产（权限说了算）。
  const teamAssets = useMemo(
    () => world.assets.filter((a) => canSee(world, user, a) && a.scope === 'team'),
    [world, user],
  )

  // 每个类目的真实数量（边栏角标）。
  const counts = useMemo(() => {
    const m: Record<Category, number> = { character: 0, costume: 0, scene: 0, prop: 0, audio: 0 }
    for (const a of teamAssets) m[a.category]++
    return m
  }, [teamAssets])

  // 类目 → 搜索 → 排序，派生出当前网格要摆的资产。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teamAssets
      .filter((a) => a.category === category)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .sort((a, b) => (sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [teamAssets, category, query, sortDesc])

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
      {/* ── 左侧类目边栏 ── */}
      <aside className={styles.sidebar}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`${styles.navItem} ${category === c.key ? styles.navActive : ''}`}
            onClick={() => setCategory(c.key)}
          >
            <img className={styles.navIcon} src={c.icon} alt="" aria-hidden />
            <span className={styles.navLabel}>
              {c.label}（{counts[c.key]}）
            </span>
          </button>
        ))}
      </aside>

      {/* ── 右侧内容 ── */}
      <section className={styles.content}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {batch && (
              <div className={styles.batchStatus}>
                已选 {selected.size} 项
                <button className={styles.batchCancel} onClick={exitBatch}>
                  取消
                </button>
              </div>
            )}
          </div>

          <div className={styles.toolbarRight}>
            <button
              className={`${styles.btn} ${batch ? styles.btnOn : ''}`}
              onClick={() => (batch ? exitBatch() : setBatch(true))}
            >
              <img className={styles.btnIcon} src={assetUrl('assets/icons/batch-all.svg')} alt="" aria-hidden />
              批量操作
            </button>

            <button className={`${styles.btn} ${styles.btnSort}`} onClick={() => setSortDesc((v) => !v)}>
              <img className={styles.btnIcon} src={assetUrl('assets/icons/sort-two.svg')} alt="" aria-hidden />
              智能排序（{sortDesc ? '最新' : '最早'}）
            </button>

            <div className={styles.search}>
              <img className={styles.btnIcon} src={assetUrl('assets/icons/filter-search.svg')} alt="" aria-hidden />
              <input
                className={styles.searchInput}
                placeholder="搜索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            该类目下暂无可见资产。
            <br />
            试试切换左侧类目、清空搜索，或用右下角切换到别的账号。
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
      </section>

      {/* 资产详情弹窗（自带外壳，见 AssetDetail） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}
    </div>
  )
}
