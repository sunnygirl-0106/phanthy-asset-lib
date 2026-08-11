/**
 * 【页面】TeamLibraryPage —— 团队资产库
 *
 * v6：整页重做，对齐团队资产库 Figma（node 1:2）——
 *   左侧 200px 类目边栏（角色 / 服装 / 场景 / 道具，各带真实数量与图标，当前项青色高亮）
 *   右侧内容：工具条（排序 / 搜索）+ 满幅封面卡片网格 + 分页条。
 *
 * 数据仍走「单一数据源 + 派生视图」：只对同一份 world + currentUser 做过滤/排序，不复制数据。
 * 权限判断委托 services/permission.canSee；卡片视觉复用全局 AssetCard；点卡片开 AssetDetail。
 * 类目/搜索/排序/批量都是页面局部状态，切账号后各自重算。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../data/types'
import type { Asset } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSee, canHandleDepositRequests } from '../services/permission'
import { useHashRoute } from '../hooks/useHashRoute'
import { AssetCard } from '../components/AssetCard'
import { AssetDetail } from '../components/AssetDetail'
import { AudioList } from '../components/AudioList'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Pager, PAGE_SIZE } from '../components/Pager'
import { SortMenu, compareBySort, type SortKey } from '../components/SortMenu'
import { DepositRequestDrawer } from '../components/DepositRequestDrawer'
import { assetUrl } from '../utils/assets'
import styles from './TeamLibraryPage.module.css'

/** 边栏类目：顺序与图标对齐设计稿。 */
const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'character', label: '角色', icon: assetUrl('assets/icons/cat-character.svg') },
  { key: 'costume', label: '服装', icon: assetUrl('assets/icons/cat-costume.svg') },
  { key: 'scene', label: '场景', icon: assetUrl('assets/icons/cat-scene.svg') },
  { key: 'prop', label: '道具', icon: assetUrl('assets/icons/cat-prop.svg') },
  // TODO: 替换音频 icon（产品后续提供正式链接，先用占位音符图标）
  { key: 'audio', label: '音频', icon: assetUrl('assets/icons/cat-audio.svg') },
]


export function TeamLibraryPage() {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const applications = useStore((s) => s.applications)
  const renameAsset = useStore((s) => s.renameAsset)
  const runDeleteAsset = useStore((s) => s.runDeleteAsset)
  const { route, navigate } = useHashRoute()
  // 抽屉开关是路由状态（#/team/deposits）：可刷新、可后退、可被通知/边栏直接唤起。
  const drawerOpen = route.name === 'team' && route.drawer === 'deposits'

  // 团队库放存入申请入口（不展开审批 UI，只唤起抽屉）：主账号名下子账号仍在待审批的申请数。
  const pendingDeposits = useMemo(
    () =>
      applications.filter((a) => {
        const applicant = world.users.find((u) => u.id === a.applicantId)
        return applicant?.parentId === user.id && a.status === 'pending'
      }).length,
    [applications, world.users, user.id],
  )

  const [category, setCategory] = useState<Category>('character')
  const [query, setQuery] = useState('')
  // 排序（PRD #31）：与项目资产库同一套四项枚举，"智能排序"这种说不清的说法已下线。
  const [sortKey, setSortKey] = useState<SortKey>('timeDesc')
  const [page, setPage] = useState(1)
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)
  // 团队库删除（PRD #31）：仅主账号，二次确认后执行。
  const [confirmDelete, setConfirmDelete] = useState<Asset | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // 存入记录入口「刚处理完」回执：通过 N 条后，入口挂「已通过 N」停 3 秒再回静默态。
  const [receipt, setReceipt] = useState<number | null>(null)
  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDepositApproved = (n: number) => {
    setReceipt((prev) => (prev ?? 0) + n)
    if (receiptTimer.current) clearTimeout(receiptTimer.current)
    receiptTimer.current = setTimeout(() => setReceipt(null), 3000)
  }
  useEffect(() => () => { if (receiptTimer.current) clearTimeout(receiptTimer.current) }, [])

  // 当前账号在团队库里能看到的全部资产（权限说了算）。
  const teamAssets = useMemo(
    () => world.assets.filter((a) => canSee(world, user, a) && a.scope === 'team'),
    [world, user],
  )

  // 每个类目的真实数量（边栏角标）。
  const counts = useMemo(() => {
    // 团队库不含「其他」类目（other 仅存在于项目库），但 Record 需覆盖全部 Category 键。
    const m: Record<Category, number> = { character: 0, costume: 0, scene: 0, prop: 0, audio: 0, other: 0 }
    for (const a of teamAssets) m[a.category]++
    return m
  }, [teamAssets])

  // 类目 → 搜索 → 排序，派生出当前网格要摆的资产。
  // （0803 修订：团队库没有空壳，不再有「只看待生成」；生成/批量生成都挪到项目库。）
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teamAssets
      .filter((a) => a.category === category)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .sort((a, b) => compareBySort(a, b, sortKey))
  }, [teamAssets, category, query, sortKey])

  // 分页（PRD #2/#31）：每页 24 项，切类目 / 搜索 / 排序回到第 1 页。
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visible, safePage],
  )
  useEffect(() => { setPage(1) }, [category, query, sortKey])
  useEffect(() => { if (page !== safePage) setPage(safePage) }, [page, safePage])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2600)
  }

  /** 删除团队库资产（二次确认后执行）。 */
  function runConfirmedDelete() {
    const target = confirmDelete
    if (!target) return
    const r = runDeleteAsset(target.id)
    setConfirmDelete(null)
    showToast(r.ok ? `已删除「${target.name}」` : r.message)
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

        {/* 存入记录入口（§7）：主账号常驻，名字不随状态变。三态——
            · 有待审：呼吸绿点 + 青绿描边角标
            · 刚处理完：「已通过 N」回执停 3 秒（盖过角标）
            · 无待审：一行普通菜单，无底色无角标。
            贴底（margin-top:auto）+ 上方分隔线，读起来是"另一类东西"，不是第六个类目。 */}
        {canHandleDepositRequests(user) && (
          <button
            className={styles.depositEntry}
            onClick={() => navigate({ name: 'team', drawer: 'deposits' })}
          >
            <span
              className={`${styles.depositDot} ${
                receipt !== null ? styles.depositDotDone
                  : pendingDeposits > 0 ? styles.depositDotLive : ''
              }`}
            />
            <span className={styles.depositLabel}>存入记录</span>
            {receipt !== null ? (
              <span className={styles.depositReceipt}>已通过 {receipt}</span>
            ) : pendingDeposits > 0 ? (
              <span className={styles.depositCount}>{pendingDeposits}</span>
            ) : null}
          </button>
        )}
      </aside>

      {/* ── 右侧内容 ── */}
      <section className={styles.content}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft} />

          <div className={styles.toolbarRight}>
            <SortMenu
              value={sortKey}
              onChange={setSortKey}
              className={`${styles.btn} ${styles.btnSort}`}
              icon={assetUrl('assets/icons/sort-two.svg')}
            />

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
        ) : category === 'audio' ? (
          // 音频为一等展示类目（R3）：条状行列表，仅支持改名 / 删除，不进详情、不参与批量。
          <AudioList
            items={paged}
            mode={{
              kind: 'library',
              onRename: (a, name) => renameAsset(a.id, name),
              // 删除先弹二次确认（PRD #31），不再点了就没。
              onDelete: (a) => setConfirmDelete(a),
            }}
          />
        ) : (
          <div className={styles.grid}>
            {paged.map((a) => (
              <div key={a.id} className={styles.cell}>
                <AssetCard asset={a} onClick={() => setDetailAssetId(a.id)} />
                {/* 最外层网格不再给单份删除入口（hover 垃圾桶）：删除一律点进详情里操作，避免误删。 */}
              </div>
            ))}
          </div>
        )}

        {/* 分页条：第 a–b 项，共 N 项 + 页码。 */}
        {visible.length > 0 && (
          <Pager page={safePage} total={visible.length} onChange={setPage} />
        )}
      </section>

      {/* 资产详情弹窗（自带外壳，见 AssetDetail） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}

      {/* 团队库删除二次确认（PRD #31）：与项目库共用同一套文案口径。 */}
      {confirmDelete && (
        <ConfirmDialog
          title={`删除「${confirmDelete.name}」？`}
          body={
            <>
              该资产将从团队资产库移除，<b>删除后无法恢复</b>。
              已复用到项目、画布或素材广场的副本不受影响。
            </>
          }
          onCancel={() => setConfirmDelete(null)}
          onConfirm={runConfirmedDelete}
        />
      )}

      {toast && <div className={styles.toast}>{toast}</div>}

      {/* 资产存入申请抽屉（§7.3）：路由 #/team/deposits 时覆盖在网格上。
          守卫 canHandleDepositRequests：子账号手敲这个 hash 也开不出抽屉。 */}
      {drawerOpen && canHandleDepositRequests(user) && (
        <DepositRequestDrawer onClose={() => navigate({ name: 'team' })} onApproved={onDepositApproved} />
      )}
    </div>
  )
}
