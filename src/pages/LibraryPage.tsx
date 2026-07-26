/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【页面】LibraryPage —— 三层库浏览页
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个页面把这一阶段的东西串起来：
 *   身份条（当前是谁）→ 作用域切换（广场/团队库/项目库）→ 类目Tab → 资产网格。
 *
 * 它是"currentUser 驱动一切"最直观的舞台：
 *   页面读的是全局 currentUser + world，用 canSee() 过滤出"这个账号能看到的资产"。
 *   你在右下角切个账号，这里的网格立刻变——因为它整个就是 currentUser 的函数。
 *
 * 注意：这个页面自己不判断权限，判断都委托给 services/permission.ts。
 *      页面只负责"把能看到的摆出来"。这就是分层——界面薄、逻辑集中。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import type { Scope } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSee, canSeeProjectAssets, getTeam } from '../services/permission'
import { AssetCard } from '../components/AssetCard'
import { CategoryTabs, type CategoryFilter } from '../components/CategoryTabs'
import { Modal } from '../components/Modal'
import { AssetDetail } from '../components/AssetDetail'
import styles from './LibraryPage.module.css'

export function LibraryPage() {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  // 页面自己的局部状态：当前看哪一层、看哪个项目、筛哪个类目
  const [scope, setScope] = useState<Scope>('plaza')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null) // 打开详情的资产

  // 当前账号"进得去"的项目（项目库作用域用它列出可选项目）
  const accessibleProjects = world.projects.filter((p) => {
    const team = getTeam(world, p.teamId)
    return team ? canSeeProjectAssets(user, p, team) : false
  })
  // 有效选中项目：优先用选中的，否则用第一个进得去的
  const effectiveProjectId =
    accessibleProjects.find((p) => p.id === selectedProjectId)?.id ?? accessibleProjects[0]?.id ?? null

  // ── 核心：算出"当前账号在当前视图下能看到的资产" ──
  const visible = world.assets
    .filter((a) => canSee(world, user, a)) // ① 先按身份过滤（权限层说了算）
    .filter((a) => {
      // ② 再按作用域过滤
      if (scope === 'plaza') return a.scope === 'plaza'
      if (scope === 'team') return a.scope === 'team'
      return a.scope === 'project' && a.scopeId === effectiveProjectId
    })
    .filter((a) => category === 'all' || a.category === category) // ③ 最后按类目筛

  return (
    <div className={styles.page}>
      {/* 身份条 */}
      <div className={styles.identity}>
        <img className={styles.identityAvatar} src={user.avatar} alt={user.name} />
        <div className={styles.identityText}>
          <div className={styles.identityName}>{user.name}</div>
          <div className={styles.identitySub}>{identityLine(user.role)}</div>
        </div>
      </div>

      {/* 作用域切换 */}
      <div className={styles.scopes}>
        <button className={scopeCls(scope === 'plaza')} onClick={() => setScope('plaza')}>素材广场</button>
        <button className={scopeCls(scope === 'team')} onClick={() => setScope('team')}>{teamScopeLabel(user, world)}</button>
        <button className={scopeCls(scope === 'project')} onClick={() => setScope('project')}>项目资产库</button>
      </div>
      <p className={styles.scopeDesc}>{scopeDesc(scope)}</p>

      {/* 项目选择（仅项目库作用域）*/}
      {scope === 'project' && (
        <div className={styles.projectChips}>
          {accessibleProjects.length === 0 && <span className={styles.count}>当前账号没有可进入的项目</span>}
          {accessibleProjects.map((p) => (
            <button
              key={p.id}
              className={`${styles.chip} ${p.id === effectiveProjectId ? styles.chipActive : ''}`}
              onClick={() => setSelectedProjectId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* 类目筛选 */}
      <CategoryTabs value={category} onChange={setCategory} />

      {/* 网格 */}
      {visible.length === 0 ? (
        <div className={styles.empty}>这个视图下没有可见的资产。<br />试试右下角切换到别的账号，或换个作用域。</div>
      ) : (
        <>
          <p className={styles.count}>共 {visible.length} 项</p>
          <div className={styles.grid}>
            {visible.map((a) => (
              <AssetCard key={a.id} asset={a} onClick={() => setDetailAssetId(a.id)} />
            ))}
          </div>
        </>
      )}

      {/* 资产详情弹窗 */}
      {detailAssetId && (
        <Modal onClose={() => setDetailAssetId(null)}>
          <AssetDetail assetId={detailAssetId} />
        </Modal>
      )}
    </div>
  )

  function scopeCls(active: boolean): string {
    return `${styles.scopeBtn} ${active ? styles.scopeActive : ''}`
  }
}

/* ─── 一些纯展示用的小文案函数 ─── */

function identityLine(role: string): string {
  return role === 'admin'
    ? '平台管理员 · 只治理不创作'
    : role === 'owner'
      ? '主账号 · 团队拥有者'
      : '子账号 · 团队成员'
}

/** 团队库标题随团队状态翻：一人团队 = "我的资产库"，有子账号 = "团队资产库"。 */
function teamScopeLabel(user: { teamId?: string; role: string }, world: { users: { role: string; teamId?: string }[] }): string {
  if (user.role === 'admin') return '团队库（治理）'
  const hasSubs = world.users.some((u) => u.role === 'sub' && u.teamId === user.teamId)
  return hasSubs ? '团队资产库' : '我的资产库'
}

function scopeDesc(scope: Scope): string {
  if (scope === 'plaza') return '官方货架 · 全网可见'
  if (scope === 'team') return '我/团队跨项目反复用的常驻母版库'
  return '单个项目在用的资产池 · 项目之间互相隔离'
}
