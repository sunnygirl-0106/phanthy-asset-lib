/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【页面】素材广场 —— 上「平台作品」下「精选素材」（对齐 素材广场_设计稿_v4_2）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 布局（v7 重做，参考设计稿 + 截屏）：整页自适应屏宽，不设固定窄容器。
 *   顶部平台作品：其他创作者用广场素材搭出来的短片（WorkCard → WorkPlayerModal，纯陈列）。
 *     大字「平台作品」+ 小字副标题；封面占大头、下方文字紧凑；右侧最新/最热排序。
 *   底部精选素材：官方货架——大字「精选素材」+ 副标题 + 一排类目胶囊（白底选中）+ 满幅封面网格。
 *     不套边框、不设左边栏（按截屏来）。
 *
 * 【逻辑照旧、一份没少】素材卡点开的仍是全局 AssetDetail 弹窗（团队库同款好看外壳）：
 *   广场作用域下它天然只读——主账号出「＋ 直接复用到项目」「☆ 收藏进团队库」两个动作；
 *   子账号只出「＋ 直接复用到项目」，收藏入口整个不渲染（0814 · PRD #37 / 权限矩阵），
 *   不显示改名 / 设为封面 / 换音色 / 上传等编辑项（canEditCover·canEditVoice 对 plaza 恒 false）。
 *   所有流转动作仍只调 store（runDirectReuse / runFavorite …），规则留在 services/ 里，这里只管陈列。
 *
 * 单一数据源 + 派生视图：素材网格只是对同一份 world + currentUser 按 scope='plaza' 的又一种过滤，不复制数据。
 * ─────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react'
import type { Category } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSee, isListed, canFavorite } from '../services/permission'
import { AssetCard } from '../components/AssetCard'
import { AssetDetail } from '../components/AssetDetail'
import { WorkCard } from '../components/WorkCard'
import { WorkPlayerModal } from '../components/WorkPlayerModal'
import { PLAZA_WORKS } from '../data/plazaWorks'
import styles from './PlazaPage.module.css'

/** 类目胶囊：'all' = 全部，其余四类（广场无音频内容）。 */
type CatFilter = 'all' | Category
const CHIPS: { key: CatFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '角色' },
  { key: 'costume', label: '服装' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
]

export function PlazaPage() {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  // 作品播放页
  const [workId, setWorkId] = useState<string | null>(null)
  const openedWork = PLAZA_WORKS.find((w) => w.id === workId) ?? null

  // 顶部全局搜索：一处输入，作品 + 素材一起过滤。
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // 素材区局部状态：类目 / 打开哪个详情
  const [category, setCategory] = useState<CatFilter>('all')
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)

  // 搜索命中的作品（按标题 / 作者）。
  const works = useMemo(
    () =>
      q
        ? PLAZA_WORKS.filter(
            (w) => w.title.toLowerCase().includes(q) || w.author.toLowerCase().includes(q),
          )
        : PLAZA_WORKS,
    [q],
  )

  // 当前账号在广场能看到的官方素材（权限说了算；广场对所有人可见）。
  // 显式再收一道 isListed：canSee 给了投稿人本人一个口子（让他在通知跳转等处看到自己被下架的那份），
  // 但广场是对外货架，下架的东西不该混在货架里给作者一个人看——所以货架页再过滤一次。
  const plazaAssets = useMemo(
    () => world.assets.filter((a) => a.scope === 'plaza' && isListed(a) && canSee(world, user, a)),
    [world, user],
  )

  // 类目 → 搜索 派生出当前网格要摆的素材（默认最新在前）。
  const visible = useMemo(
    () =>
      plazaAssets
        .filter((a) => category === 'all' || a.category === category)
        .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
        .sort((a, b) => b.createdAt - a.createdAt),
    [plazaAssets, category, q],
  )

  return (
    <div className={styles.page}>
      {/* ══ 顶部全局搜索（对齐 Figma 1:418：暗色胶囊 + 放大镜 + 占位）══ */}
      <div className={styles.topBar}>
        <div className={styles.search}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="搜索作品、角色、场景…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ══ 平台作品 ══ */}
      <section className={styles.section}>
        <div className={styles.secHead}>
          <div>
            <h2 className={styles.secTitle}>平台作品</h2>
            <p className={styles.secSub}>看看其他创作者最近发布的短片</p>
          </div>
          <div className={styles.sortGroup}>
            <button className={`${styles.sortBtn} ${styles.sortOn}`}>最新</button>
            <button className={styles.sortBtn}>最热</button>
          </div>
        </div>
        {works.length === 0 ? (
          <div className={styles.empty}>没有匹配「{query.trim()}」的作品。</div>
        ) : (
          <div className={styles.vgrid}>
            {works.map((w) => (
              <WorkCard key={w.id} work={w} onClick={() => setWorkId(w.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ══ 底部：精选素材（官方货架）══ */}
      <section className={styles.assetsSection}>
        <div className={styles.secHead}>
          <div>
            <h2 className={styles.secTitle}>精选素材</h2>
            {/* 副标题按角色分（PRD #37）：子账号没有「收藏进团队库」这项能力，
                就不该在页面上读到这句话——文案跟入口一起收，别让人白点一圈。 */}
            <p className={styles.secSub}>
              {canFavorite(user) ? '可收藏进团队库，直接复用到项目' : '可直接复用到项目'}
            </p>
          </div>
        </div>

        <div className={styles.chips}>
          {CHIPS.map((c) => (
            <button
              key={c.key}
              className={`${styles.chip} ${category === c.key ? styles.chipOn : ''}`}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            {q ? `没有匹配「${query.trim()}」的官方素材。` : '该类目下暂无官方素材。'}
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                onClick={() => setDetailAssetId(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 素材详情弹窗（团队库同款好看外壳；广场作用域下天然只读） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}

      {/* 作品播放页 */}
      {openedWork && <WorkPlayerModal work={openedWork} onClose={() => setWorkId(null)} />}
    </div>
  )
}
