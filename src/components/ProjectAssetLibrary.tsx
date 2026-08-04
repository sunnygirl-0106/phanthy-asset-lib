/**
 * 【组件】ProjectAssetLibrary —— 项目资产库（画布模式 / 工作流模式共用）
 *
 * 外显对齐团队资产库（复用 AssetCard 满幅大图 + 批量/排序/搜索工具条），
 * 但按截图把类目 Tab 横排在顶部（不再走团队库的左侧类目边栏），
 * 因为项目工作台左栏已经被项目导航占用，类目只能上置。
 *
 * 数据仍走「单一数据源 + 派生视图」：只对同一份 world 里 scope=project & scopeId=pid
 * 那批资产做过滤/排序，不复制数据；切类目/搜索/排序/批量都是页面局部状态。
 * 点卡片开 AssetDetail（存入团队库等操作都在详情里，本次不改）。
 */

import { useMemo, useState } from 'react'
import type { Category, Asset } from '../data/types'
import { useStore } from '../store/useStore'
import { AssetCard } from './AssetCard'
import { AssetDetail } from './AssetDetail'
import { AudioList } from './AudioList'
import { OtherVideoPlayer } from './OtherVideoPlayer'
import { assetUrl } from '../utils/assets'
import styles from './ProjectAssetLibrary.module.css'

/** 顶部类目 Tab：顺序对齐团队库与截图。末尾「其他」是另一层东西，单独隔出（见 tabOther）。 */
const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'character', label: '角色', icon: assetUrl('assets/icons/cat-character.svg') },
  { key: 'costume', label: '服装', icon: assetUrl('assets/icons/cat-costume.svg') },
  { key: 'scene', label: '场景', icon: assetUrl('assets/icons/cat-scene.svg') },
  { key: 'prop', label: '道具', icon: assetUrl('assets/icons/cat-prop.svg') },
  // TODO: 替换音频 icon（产品后续提供正式链接，先用占位音符图标）
  { key: 'audio', label: '音频', icon: assetUrl('assets/icons/cat-audio.svg') },
  // TODO: 替换「其他」icon（先用占位九宫格图标）；「其他」= 创作留存物，仅项目库有，不存入。
  { key: 'other', label: '其他', icon: assetUrl('assets/icons/grid.svg') },
]

/** 支持手动新增的四个生产类目（0808 · 规则 27）。「音频」无文生图、「其他」是画布留存物，都不给入口。 */
const CREATABLE: Category[] = ['character', 'costume', 'scene', 'prop']
const CAT_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}

export function ProjectAssetLibrary({ projectId }: { projectId: string }) {
  const world = useStore((s) => s.world)
  const renameAsset = useStore((s) => s.renameAsset)
  const runDeleteAsset = useStore((s) => s.runDeleteAsset)
  const batchGenerate = useStore((s) => s.batchGenerate)
  const createShellAsset = useStore((s) => s.createShellAsset)
  // 演示脚手架（0805）：左下角「演示」控件用，只服务于讲解、交付时移除。
  const demoStep = useStore((s) => s.demoStep)
  const runDemoAnalyze = useStore((s) => s.runDemoAnalyze)
  const runDemoGenerate = useStore((s) => s.runDemoGenerate)
  const runDemoReset = useStore((s) => s.runDemoReset)

  const [category, setCategory] = useState<Category>('character')
  const [query, setQuery] = useState('')
  const [sortDesc, setSortDesc] = useState(true) // 时间倒序：默认最新在前
  const [batch, setBatch] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)
  const [demoOpen, setDemoOpen] = useState(false) // 演示控件收起/展开
  const [toast, setToast] = useState<string | null>(null)
  // 「其他」视频：不进详情弹窗，直接大屏播放（§用户口径：视频就直接大屏播放，不用这么麻烦）。
  const [videoAsset, setVideoAsset] = useState<Asset | null>(null)
  // 新增资产弹窗（0808）：只填名称，建完直接开详情页。
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createErr, setCreateErr] = useState<string | null>(null)

  /** 点开一份资产：「其他」里的视频直接大屏播放，其余（含图片 / 文本）走详情弹窗。 */
  const openAsset = (a: Asset) => {
    if (a.category === 'other' && a.fields.media === 'video') setVideoAsset(a)
    else setDetailAssetId(a.id)
  }

  // 本项目资产池（与画布共享同一批数据）。
  const projectAssets = useMemo(
    () => world.assets.filter((a) => a.scope === 'project' && a.scopeId === projectId),
    [world, projectId],
  )

  // 每个类目的真实数量（Tab 角标）。
  const counts = useMemo(() => {
    const m: Record<Category, number> = { character: 0, costume: 0, scene: 0, prop: 0, audio: 0, other: 0 }
    for (const a of projectAssets) m[a.category]++
    return m
  }, [projectAssets])

  // 当前类目下"可以生成了"的造型空壳（引导条用）：有 referencedFrom 的造型，且**参考图已挂上**。
  // 挂参考图 = 它要参考的素模/服装已经生成（演示第二步「资产生成」做的事）。参考图还没挂
  // （第一步「剧本分析」后的过渡态）就先别催生成——那时基础素材都还没出图，造型还轮不到。
  const emptyShells = useMemo(
    () =>
      projectAssets.filter(
        (a) =>
          a.category === category &&
          a.status === 'empty' &&
          a.referencedFrom &&
          (a.referenceImages?.length ?? 0) > 0,
      ),
    [projectAssets, category],
  )

  // 类目 → 搜索 → 排序，派生出当前网格要摆的资产。
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projectAssets
      .filter((a) => a.category === category)
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // 已生成的成品排在前面、待生成（空壳）排在后面；组内再按时间排序。
        const ae = a.status === 'empty' ? 1 : 0
        const be = b.status === 'empty' ? 1 : 0
        if (ae !== be) return ae - be
        return sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      })
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

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2600)
  }

  /** 批量生成：对选中的空壳各落一张占位图 → 成品（已有成品自动跳过），toast 汇报。 */
  function runBatchGenerate() {
    if (selected.size === 0) return
    const r = batchGenerate([...selected], assetUrl('assets/canvas/image-placeholder.svg'))
    showToast(r.message)
    exitBatch()
  }

  /** 引导条「批量生成」：自动勾选本类目全部空壳并直接执行（少两步点击）。 */
  function generateAllShells() {
    if (emptyShells.length === 0) return
    const r = batchGenerate(emptyShells.map((a) => a.id), assetUrl('assets/canvas/image-placeholder.svg'))
    showToast(r.message)
  }

  /** 建完直接打开详情页——用户接着就要写提示词、点生成，别让他再去网格里找一遍。 */
  function submitCreate() {
    const r = createShellAsset(projectId, category, newName)
    if (!r.ok) { setCreateErr(r.message); return }
    setCreating(false)
    setCreateErr(null)
    setDetailAssetId(r.message) // 成功时 message 是新资产 id
  }

  /** 演示控件的三步动作：走 store 的演示脚手架动作，toast 汇报。 */
  function onDemoStep(run: () => { ok: boolean; message: string }) {
    const r = run()
    showToast(r.message)
  }

  // AudioList 库模式（改名 / 删除）——音频类目专用（「其他」不含音频）。
  const audioLibMode = {
    kind: 'library' as const,
    onRename: (a: Asset, name: string) => renameAsset(a.id, name),
    onDelete: (a: Asset) => runDeleteAsset(a.id),
  }

  /** 卡片网格（支持批量勾选）——普通类目 &「其他」的图片/视频/文本子分区共用。 */
  function renderGrid(items: Asset[]) {
    return (
      <div className={styles.grid}>
        {items.map((a) => (
          <div
            key={a.id}
            className={`${styles.cell} ${batch && selected.has(a.id) ? styles.cellSelected : ''}`}
          >
            <AssetCard
              asset={a}
              onClick={batch ? () => toggleSelect(a.id) : () => openAsset(a)}
            />
            {batch && (
              <span className={`${styles.check} ${selected.has(a.id) ? styles.checkOn : ''}`}>
                {selected.has(a.id) ? '✓' : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  /** 分区小标题（复用画布资产面板设计）：灰字标签 + 数字角标 + 横线。 */
  function sectionHead(label: string, count: number, spaced = false) {
    return (
      <div className={`${styles.sectionHead} ${spaced ? styles.sectionHeadSpaced : ''}`}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.sectionRule} aria-hidden />
      </div>
    )
  }

  // 「其他」按媒介分区（复用画布资产面板的分区设计）：图片 → 视频 → 文本（音频不进「其他」）。
  const otherGroups = [
    { key: 'image', label: '图片', items: visible.filter((a) => (a.fields.media ?? 'image') === 'image') },
    { key: 'video', label: '视频', items: visible.filter((a) => a.fields.media === 'video') },
    { key: 'text', label: '文本', items: visible.filter((a) => a.fields.media === 'text') },
  ].filter((g) => g.items.length > 0)

  return (
    <div className={styles.wrap}>
      {/* ── 页头：标题 + 副标题（左） · 工具条（右） ── */}
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>项目资产库</h1>
          <p className={styles.subtitle}>浏览项目内的所有资产</p>
        </div>

        <div className={styles.tools}>
          {batch && (
            <span className={styles.batchStatus}>
              已选 {selected.size} 项
              <button className={styles.batchCancel} onClick={exitBatch}>
                取消
              </button>
            </span>
          )}

          {batch && (
            <button className={styles.btnGen} disabled={selected.size === 0} onClick={runBatchGenerate}>
              批量生成（{selected.size}）
            </button>
          )}

          {CREATABLE.includes(category) && !batch && (
            <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => { setNewName(''); setCreateErr(null); setCreating(true) }}>
              ＋ 新增{CAT_LABEL[category]}
            </button>
          )}

          <button
            className={`${styles.btn} ${batch ? styles.btnOn : ''}`}
            onClick={() => (batch ? exitBatch() : setBatch(true))}
          >
            <img className={styles.btnIcon} src={assetUrl('assets/icons/batch-all.svg')} alt="" aria-hidden />
            批量操作
          </button>

          <button className={styles.btn} onClick={() => setSortDesc((v) => !v)}>
            <img className={styles.btnIcon} src={assetUrl('assets/icons/sort-two.svg')} alt="" aria-hidden />
            {sortDesc ? '时间倒序' : '时间正序'}
            <img className={styles.btnCaret} src={assetUrl('assets/icons/chevron-down.svg')} alt="" aria-hidden />
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
      </header>

      {/* ── 类目 Tab（独立一行） ── */}
      <nav className={styles.tabs}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`${styles.tab} ${category === c.key ? styles.tabActive : ''}`}
            onClick={() => setCategory(c.key)}
          >
            <img className={styles.tabIcon} src={c.icon} alt="" aria-hidden />
            <span>{c.label}（{counts[c.key]}）</span>
          </button>
        ))}

        {/* 一键生成本类目全部空壳（0809）：原来是 Tab 下方一整条横幅，每次出现都把网格
            整体往下顶一截；它讲的又是"当前类目还剩几份"，本就属于 Tab 这一行，收进右端空白里。 */}
        {emptyShells.length > 0 && !batch && (
          <button className={styles.tabAction} onClick={generateAllShells}>
            一键生成剩余 {emptyShells.length} 份
          </button>
        )}
      </nav>

      {/* ── 网格 ── */}
      {visible.length === 0 ? (
        <div className={styles.empty}>
          该类目下暂无资产。
          <br />
          试试切换上方类目、清空搜索。
        </div>
      ) : category === 'audio' ? (
        // 音频为一等展示类目（R3）：条状行列表，仅支持改名 / 删除，不进详情、不参与批量。
        <AudioList items={visible} mode={audioLibMode} />
      ) : category === 'other' ? (
        // 「其他」按媒介分区（复用画布资产面板设计）：图片 → 视频 → 文本，从上到下（不含音频）。
        <div className={styles.otherSections}>
          {otherGroups.map((g, i) => (
            <section key={g.key}>
              {sectionHead(g.label, g.items.length, i > 0)}
              {renderGrid(g.items)}
            </section>
          ))}
        </div>
      ) : (
        renderGrid(visible)
      )}

      {/* 资产详情弹窗（自带外壳；存入团队库等操作都在里面，本次不改） */}
      {detailAssetId && (
        <AssetDetail assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}

      {/* 「其他」视频大屏播放器（直接播放，不走详情弹窗） */}
      {videoAsset && (
        <OtherVideoPlayer asset={videoAsset} onClose={() => setVideoAsset(null)} />
      )}

      {/* 新增资产弹窗（0808）：只填名称，建完直接开详情页写提示词 / 点生成。 */}
      {creating && (
        <div className={styles.msubroot}>
          <div className={styles.sscrim} onClick={() => setCreating(false)} />
          <div className={styles.createCard} onKeyDown={(e) => { if (e.key === 'Escape') setCreating(false) }}>
            <h4 className={styles.createTitle}>新增{CAT_LABEL[category]}</h4>
            <p className={styles.createDesc}>
              建好后是一份待生成的空壳，进详情页写提示词、加参考图，再点生成。
            </p>
            <input
              className={styles.createInput}
              autoFocus
              placeholder={`给这个${CAT_LABEL[category]}起个名字`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate() }}
            />
            {createErr && <div className={styles.createErr}>⚠️ {createErr}</div>}
            <div className={styles.createActs}>
              <button className={styles.btn} onClick={() => setCreating(false)}>取消</button>
              <button className={styles.btnGen} disabled={!newName.trim()} onClick={submitCreate}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量生成结果 toast */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* ── 左下角「演示」浮动控件（0805 · 演示脚手架，仅项目资产库页出现，交付时移除）── */}
      <div className={styles.demoDock}>
        {demoOpen ? (
          <div className={styles.demoCard}>
            <div className={styles.demoHead}>
              <span className={styles.demoTitle}>演示流程</span>
              <button className={styles.demoClose} title="收起" onClick={() => setDemoOpen(false)}>✕</button>
            </div>
            <p className={styles.demoScaffold}>演示脚手架 · 交付时移除</p>

            <button
              className={`${styles.demoStep} ${demoStep !== 'idle' ? styles.demoStepDone : ''}`}
              disabled={demoStep !== 'idle'}
              onClick={() => onDemoStep(runDemoAnalyze)}
            >
              <span className={styles.demoStepNo}>①</span>
              <span className={styles.demoStepLabel}>剧本分析</span>
              <span className={styles.demoStepState}>{demoStep !== 'idle' ? '✓ 已完成' : '执行'}</span>
            </button>

            <button
              className={`${styles.demoStep} ${demoStep === 'generated' ? styles.demoStepDone : ''}`}
              disabled={demoStep !== 'analyzed'}
              onClick={() => onDemoStep(runDemoGenerate)}
            >
              <span className={styles.demoStepNo}>②</span>
              <span className={styles.demoStepLabel}>资产生成</span>
              <span className={styles.demoStepState}>{demoStep === 'generated' ? '✓ 已完成' : '执行'}</span>
            </button>

            <button className={styles.demoReset} onClick={() => onDemoStep(runDemoReset)}>↺ 重置演示</button>
          </div>
        ) : (
          <button className={styles.demoPill} onClick={() => setDemoOpen(true)}>▷ 演示</button>
        )}
      </div>
    </div>
  )
}
