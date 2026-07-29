/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】AssetGrid —— 资产网格（从 LibraryPage 抽出的核心网格）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 由来（技术规划 §6）：原 LibraryPage 里那段
 *   world.assets.filter(canSee).filter(按作用域).filter(按类目)
 * 是三层库共用的净逻辑。把它抽成一个入参 scope + projectId 的通用网格后：
 *   · 团队库页  = <AssetGrid scope="team" />
 *   · 广场页    = <AssetGrid scope="plaza" />
 *   · 项目库 tab = <AssetGrid scope="project" projectId={pid} />
 *   · 画布左侧面板（阶段 4）也复用同一套过滤取三层数据
 *
 * 单一数据源 + 派生视图（红线 4）：它只是对同一份 world + currentUser 的又一种过滤摆法，
 * 不复制数据；切人物只改 currentUserId 指针，这里立刻重算。
 * 权限判断一律委托 services/permission.ts，组件只负责"把能看到的摆出来"。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import type { Scope } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSee } from '../services/permission'
import { AssetCard } from './AssetCard'
import { CategoryTabs, type CategoryFilter } from './CategoryTabs'
import { AssetDetail } from './AssetDetail'
import styles from './AssetGrid.module.css'

export function AssetGrid({ scope, projectId }: { scope: Scope; projectId?: string }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  // 只保留网格自身的局部状态：筛哪个类目、打开哪个详情。
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  // ── 核心：算出"当前账号在当前作用域下能看到的资产" ──
  const visible = world.assets
    .filter((a) => canSee(world, user, a)) // ① 先按身份过滤（权限层说了算）
    .filter((a) => {
      // ② 再按作用域过滤（项目库还要对上 projectId）
      if (scope === 'plaza') return a.scope === 'plaza'
      if (scope === 'team') return a.scope === 'team'
      return a.scope === 'project' && a.scopeId === projectId
    })
    .filter((a) => category === 'all' || a.category === category) // ③ 最后按类目筛

  return (
    <div>
      {/* 类目筛选 */}
      <CategoryTabs value={category} onChange={setCategory} />

      {/* 网格 */}
      {visible.length === 0 ? (
        <div className={styles.empty}>
          这个视图下没有可见的资产。
          <br />
          试试右下角切换到别的账号，或换个板块。
        </div>
      ) : (
        <>
          <p className={styles.count}>共 {visible.length} 项</p>
          <div className={styles.grid}>
            {visible.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                onClick={() => setDetailAssetId(a.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* 资产详情弹窗（自带外壳，见 AssetDetail） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}
    </div>
  )
}
