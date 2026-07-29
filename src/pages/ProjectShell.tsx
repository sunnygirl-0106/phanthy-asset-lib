/**
 * 【页面】ProjectShell —— 项目工作台外壳（画布列表 / 项目资产库）
 *
 * 承接（技术规划 §4.1）：项目管理点开一个项目 → 这里（对齐截图二"画布列表"）。
 * 左栏固定：项目名 + 风格标签、当前模式（无限画布 / 切换模式）、两个菜单项。
 * 右主区按 tab 切：
 *   · canvases → 画布列表（卡片网格 + 新建画布 + 搜索 / 批量 / 排序）
 *   · assets   → 项目资产库（ProjectAssetLibrary，外显对齐团队库大图 + 顶部类目 Tab）
 *
 * 工作流是另一套沉浸式整页（WorkflowShell），从"切换模式"进；本页只管这两个 tab。
 */

import { useMemo, useState } from 'react'
import type { Route } from '../hooks/useHashRoute'
import { useStore, useCurrentUser } from '../store/useStore'
import { getProject, getTeam, canSeeProjectAssets } from '../services/permission'
import { ProjectAssetLibrary } from '../components/ProjectAssetLibrary'
import styles from './ProjectShell.module.css'

export function ProjectShell({
  pid,
  tab,
  navigate,
}: {
  pid: string
  tab: 'canvases' | 'assets'
  navigate: (to: Route | string) => void
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const project = getProject(world, pid)

  // 无权限 / 项目不存在 → 挡回项目管理。切人物即重算（红线 4）。
  const team = project ? getTeam(world, project.teamId) : undefined
  const allowed = project && team ? canSeeProjectAssets(user, project, team) : false

  if (!project || !allowed) {
    return (
      <div className={styles.blocked}>
        当前账号无法进入该项目。
        <br />
        <button className={styles.linkBtn} onClick={() => navigate('#/projects')}>← 返回项目管理</button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* ── 左栏：项目头 + 当前模式 + 菜单 ── */}
      <aside className={styles.sidebar}>
        <button className={styles.back} onClick={() => navigate('#/projects')}>
          <span className={styles.backArrow}>‹</span> {project.name}
        </button>
        {project.tag && <span className={styles.tag}>{project.tag}</span>}

        <div className={styles.modePanel}>
          <span className={styles.modeLabel}>当前模式</span>
          <div className={styles.modeRow}>
            <strong>无限画布</strong>
            <button className={styles.modeSwitch} onClick={() => navigate(`#/project/${pid}/workflow`)}>
              切换模式
            </button>
          </div>
        </div>

        <nav className={styles.nav}>
          <button
            className={`${styles.navItem} ${tab === 'canvases' ? styles.navActive : ''}`}
            onClick={() => navigate(`#/project/${pid}`)}
          >
            画布列表
          </button>
          <button
            className={`${styles.navItem} ${tab === 'assets' ? styles.navActive : ''}`}
            onClick={() => navigate(`#/project/${pid}/assets`)}
          >
            项目资产库
          </button>
        </nav>
      </aside>

      {/* ── 主区 ── */}
      <main className={styles.main}>
        {tab === 'assets' ? (
          <ProjectAssetLibrary projectId={pid} />
        ) : (
          <CanvasList pid={pid} navigate={navigate} />
        )}
      </main>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
 * 画布列表：卡片网格 + 新建 + 搜索 / 批量 / 排序（对齐截图二）
 * ──────────────────────────────────────────────────────────────────────── */

function CanvasList({ pid, navigate }: { pid: string; navigate: (to: Route | string) => void }) {
  const canvases = useStore((s) => s.world.canvases)
  const createCanvas = useStore((s) => s.createCanvas)
  const renameCanvas = useStore((s) => s.renameCanvas)
  const deleteCanvas = useStore((s) => s.deleteCanvas)

  const [keyword, setKeyword] = useState('')
  const [desc, setDesc] = useState(true) // 时间倒序（默认新在前）
  const [batch, setBatch] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuId, setMenuId] = useState<string | null>(null)

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return canvases
      .filter((c) => c.projectId === pid)
      .filter((c) => !kw || c.name.toLowerCase().includes(kw))
      .sort((a, b) => (desc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [canvases, pid, keyword, desc])

  function openCanvas(cid: string) {
    if (batch) return toggleSelect(cid)
    navigate(`#/project/${pid}/canvas/${cid}`)
  }

  function newCanvas() {
    const cid = createCanvas(pid)
    navigate(`#/project/${pid}/canvas/${cid}`)
  }

  function toggleSelect(cid: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(cid) ? next.delete(cid) : next.add(cid)
      return next
    })
  }

  function exitBatch() {
    setBatch(false)
    setSelected(new Set())
  }

  function deleteSelected() {
    selected.forEach((cid) => deleteCanvas(cid))
    exitBatch()
  }

  function rename(cid: string, current: string) {
    setMenuId(null)
    const name = window.prompt('画布改名', current)
    if (name != null) renameCanvas(cid, name)
  }

  function remove(cid: string) {
    setMenuId(null)
    deleteCanvas(cid)
  }

  return (
    <div className={styles.canvasWrap} onClick={() => setMenuId(null)}>
      {/* 工具条 */}
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            placeholder="搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <button className={`${styles.toolBtn} ${batch ? styles.toolBtnOn : ''}`} onClick={() => (batch ? exitBatch() : setBatch(true))}>
          批量操作
        </button>
        <button className={styles.toolBtn} onClick={() => setDesc((v) => !v)}>
          {desc ? '时间倒序' : '时间正序'}
        </button>
        <button className={styles.primaryBtn} onClick={newCanvas}>＋ 新建画布</button>
      </div>

      {/* 网格 */}
      <div className={styles.grid}>
        {list.map((c) => {
          const isSel = selected.has(c.id)
          return (
            <div
              key={c.id}
              className={`${styles.card} ${isSel ? styles.cardSel : ''}`}
              onClick={() => openCanvas(c.id)}
            >
              <div className={styles.coverWrap}>
                <img className={styles.cover} src={c.cover} alt={c.name} />
                {batch && <span className={`${styles.check} ${isSel ? styles.checkOn : ''}`}>{isSel ? '✓' : ''}</span>}
              </div>
              <div className={styles.cardFoot}>
                <div className={styles.cardMeta}>
                  <div className={styles.cardName}>{c.name}</div>
                  <div className={styles.cardDate}>{formatDate(c.createdAt)}</div>
                </div>
                {!batch && (
                  <div className={styles.menuWrap}>
                    <button
                      className={styles.menuBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuId((v) => (v === c.id ? null : c.id))
                      }}
                    >
                      ⋮
                    </button>
                    {menuId === c.id && (
                      <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.menuItem} onClick={() => rename(c.id, c.name)}>重命名</button>
                        <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => remove(c.id)}>删除</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* 新建画布卡 */}
        {!batch && (
          <button className={styles.newCard} onClick={newCanvas}>
            <span className={styles.newPlus}>＋</span>
            <span className={styles.newText}>新建画布</span>
          </button>
        )}
      </div>

      {/* 批量操作底栏 */}
      {batch && (
        <div className={styles.batchBar}>
          <span>已选 {selected.size} 项</span>
          <button className={styles.batchDelete} disabled={selected.size === 0} onClick={deleteSelected}>
            删除
          </button>
          <button className={styles.batchExit} onClick={exitBatch}>退出批量</button>
        </div>
      )}
    </div>
  )
}

/** 把时间戳格式化成"2026年07月22日 16:05:14"（对齐截图二）。 */
function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
