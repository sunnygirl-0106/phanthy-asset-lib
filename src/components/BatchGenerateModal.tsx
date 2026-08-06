/**
 * 【组件】BatchGenerateModal —— 生成前确认（0812 · §6）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 三个入口统一走这一个弹窗，不再有任何「点了就直接出图」的路径：
 *   · 一键生成全部资产（工具条主 CTA）：本项目全部没图的资产，跨类目
 *   · 批量生成（N）（批量模式工具条）：勾中的那些
 *   · 生成这 N 份（引导条）：参考图已就位、可以生成的那些
 *
 * 信息核心是参考 pill 的三态（§6.3）——它替代了所有说教文案，用户看一眼就知道
 * 为什么某行没勾。默认勾选规则收成一句话（§2）：没图，且不等任何人 → 默认勾选。
 * 「两步走」不是被规定的，是这条规则自己跑出来的结果。
 * ─────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react'
import type { Asset, Category } from '../data/types'
import { useStore } from '../store/useStore'
import { resolveRefs, pendingRefs, refsReady } from '../services/assetService'
import { COST_PER_IMAGE } from '../data/pricing'
import { assetUrl } from '../utils/assets'
import styles from './BatchGenerateModal.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}
/** 生产类目的分组顺序（音频 /「其他」不参与生成）。 */
const CAT_ORDER: Category[] = ['character', 'costume', 'scene', 'prop']

const RATIO_OPTS = ['3 : 4', '1 : 1', '9 : 16', '16 : 9']
const COUNT_OPTS = [1, 2, 4, 6]
const QUALITY_OPTS = ['2K', '1K', '4K']
const MODEL_OPTS = ['即梦 5.0', '即梦 4.0', 'Seedream 3.0']

const PLACEHOLDER = assetUrl('assets/canvas/image-placeholder.svg')

export function BatchGenerateModal({
  title,
  assetIds,
  initialCat,
  onClose,
  onDone,
}: {
  title: string
  /** 候选池：本项目全部生产类资产（不按 status 过滤，弹窗内自己分区）。 */
  assetIds: string[]
  /** 初始作用域：当前类目 Tab；音频 /「其他」等无生产语义的 Tab 传 null → 落到「全部」。 */
  initialCat: Category | null
  onClose: () => void
  /** 生成动作已触发后回调（把结果 message 抛给页面 toast）。 */
  onDone: (message: string) => void
}) {
  const world = useStore((s) => s.world)
  const batchGenerate = useStore((s) => s.batchGenerate)
  const setPrompt = useStore((s) => s.setPrompt)

  // 从 world 取出候选资产（保持 assetIds 的存在性；音频 /「其他」天然不在生产类目里）。
  const assets = useMemo(
    () =>
      assetIds
        .map((id) => world.assets.find((a) => a.id === id))
        .filter((a): a is Asset => !!a && CAT_ORDER.includes(a.category)),
    [assetIds, world],
  )

  // 作用域：当前类目 ↔ 全部生产类目。默认跟随打开时所在的 Tab（与批量删除的作用域对齐）。
  const [scope, setScope] = useState<Category | 'all'>(initialCat ?? 'all')
  const scoped = useMemo(
    () => (scope === 'all' ? assets : assets.filter((a) => a.category === scope)),
    [assets, scope],
  )
  // 作用域选项：始终「全部」打头，其后按 CAT_ORDER（角色→服装→场景→道具）。
  const scopeOpts: { key: Category | 'all'; label: string }[] = [
    { key: 'all', label: '全部' },
    ...CAT_ORDER.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })),
  ]
  const scopeCount = (k: Category | 'all') =>
    k === 'all' ? assets.length : assets.filter((a) => a.category === k).length

  // 三分：没图（可勾）/ 生成中（只展示、不可勾）/ 已生成（可勾 = 重新生成）。
  const noImage = scoped.filter((a) => a.status === 'empty')
  const generatingNow = scoped.filter((a) => a.status === 'generating')
  const hasImage = scoped.filter((a) => a.status === 'done' || a.status === 'failed')

  /** 默认勾选（§2）：没图、且不等任何人 → 勾。已生成的一律不勾（避免白烧星钻）。 */
  function defaultsFor(list: Asset[]) {
    return new Set(list.filter((a) => a.status === 'empty' && refsReady(world, a)).map((a) => a.id))
  }
  const [selected, setSelected] = useState<Set<string>>(() => defaultsFor(scoped))

  function switchScope(next: Category | 'all') {
    setScope(next)
    const nextScoped = next === 'all' ? assets : assets.filter((a) => a.category === next)
    setSelected(defaultsFor(nextScoped)) // 切作用域 = 重算默认，可预期优先（会丢手动勾/取消）
  }
  const [count, setCount] = useState(COUNT_OPTS[0])
  // 二次确认：null=不弹；'together'=有资产要参考本批内的（§6.4 第一种）；'unreachable'=参考不到（第二种）。
  const [confirm, setConfirm] = useState<'together' | 'unreachable' | null>(null)

  const selSet = selected // alias
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // 列表里是否存在 #3（有 pending 槽的空壳）——决定顶部提示条是否出现。
  const hasWaiting = noImage.some((a) => pendingRefs(world, a).length > 0)

  // 分组排序（§6.2）：按类目分组，组内 #1/#2（就位）→ #3（未就位）。
  const groups = CAT_ORDER
    .map((cat) => {
      const items = noImage
        .filter((a) => a.category === cat)
        .sort((a, b) => {
          const aw = pendingRefs(world, a).length > 0 ? 1 : 0
          const bw = pendingRefs(world, b).length > 0 ? 1 : 0
          return aw - bw
        })
      return { cat, items }
    })
    .filter((g) => g.items.length > 0)

  // 勾中的里，哪些是新生成（空壳）、哪些是重新生成（已有图）——底部说明和费用都要用。
  const pickedNew = noImage.filter((a) => selSet.has(a.id))
  const pickedRegen = hasImage.filter((a) => selSet.has(a.id))
  const selectedCount = pickedNew.length + pickedRegen.length
  const cost = selectedCount * count * COST_PER_IMAGE

  // 全选：作用域内所有可勾的（没图 + 已生成，生成中不可勾）。全勾时按钮变「取消全选」。
  const selectable = [...noImage, ...hasImage]
  const allPicked = selectable.length > 0 && selectable.every((a) => selSet.has(a.id))
  function toggleAll() {
    setSelected(allPicked ? new Set() : new Set(selectable.map((a) => a.id)))
  }

  /** 点「生成」：按 §6.4 决定要不要弹二次确认。 */
  function requestGenerate() {
    if (selectedCount === 0) return
    const picked = [...pickedNew, ...pickedRegen]
    // 这次参考不到的：有 pending 槽、且该上游不在本批次勾选内。
    const unreachable = picked.filter((a) =>
      pendingRefs(world, a).some((r) => !selSet.has(r.assetId)),
    )
    // 要参考同批内其他资产的：资产级槽指向本批次内另一份被勾中的资产。
    const together = picked.filter((a) =>
      (a.references ?? []).some((ref) => ref.kind === 'asset' && ref.assetId !== a.id && selSet.has(ref.assetId)),
    )
    if (unreachable.length > 0) { setConfirm('unreachable'); return }
    if (together.length > 0) { setConfirm('together'); return }
    doGenerate()
  }

  function doGenerate() {
    const ids = [...pickedNew, ...pickedRegen].map((a) => a.id)
    const r = batchGenerate(ids, PLACEHOLDER, count)
    setConfirm(null)
    onDone(r.message)
    onClose()
  }

  /** 参考 pill 三态（§6.3）。 */
  function renderRefs(a: Asset) {
    const refs = a.references ?? []
    if (refs.length === 0) return null
    const resolved = resolveRefs(world, a)
    return (
      <div className={styles.refs}>
        <span className={styles.refsLabel}>参考：</span>
        {refs.map((ref, i) => {
          const r = resolved[i]
          // 图级槽：纯缩略图，不带任何文字。
          if (ref.kind === 'image') {
            return <img key={i} className={styles.refThumb} src={ref.url} alt="参考图" loading="lazy" />
          }
          if (r.state === 'ready') {
            return (
              <span key={i} className={styles.refPill}>
                <img className={styles.refPillThumb} src={r.url} alt={r.label} loading="lazy" />
                <span className={styles.refPillName}>{r.label}</span>
              </span>
            )
          }
          return (
            <span key={i} className={`${styles.refPill} ${styles.refPillPending}`}>
              <span className={styles.refPillBox} aria-hidden />
              <span className={styles.refPillName}>{r.label} ·{r.state === 'pending' ? '待生成' : '已删除'}</span>
            </span>
          )
        })}
      </div>
    )
  }

  /** 一行：勾选 + 名字 + 类目 chip + 可编辑提示词 + 参考 pill。isRegen=已有图、重新生成。 */
  function renderRow(a: Asset, isRegen = false) {
    const on = selSet.has(a.id)
    return (
      <div key={a.id} className={`${styles.row} ${isRegen ? styles.rowRegen : ''}`}>
        <label className={styles.rowHead}>
          <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
          <span className={styles.rowName}>{a.name}</span>
          <span className={styles.rowChip}>{CATEGORY_LABEL[a.category]}</span>
          {isRegen && (
            <span className={styles.regenTag}>已有 {a.candidates?.length ?? 1} 张 · 重新生成</span>
          )}
        </label>
        <div className={styles.promptWrap}>
          <span className={styles.promptLabel}>提示词</span>
          <textarea
            className={styles.promptEdit}
            rows={2}
            defaultValue={a.prompt ?? ''}
            onBlur={(e) => { if (e.target.value !== (a.prompt ?? '')) setPrompt(a.id, e.target.value) }}
            placeholder="描述你想要的画面…"
          />
        </div>
        {renderRefs(a)}
      </div>
    )
  }

  const waitingCount = noImage.filter((a) => pendingRefs(world, a).length > 0).length

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.card}>
        {/* 头 */}
        <div className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
        </div>

        {/* 作用域切换器：始终「全部」打头，默认高亮打开时所在的 Tab（无生产语义则默认「全部」）。 */}
        <div className={styles.scopeBar}>
          {scopeOpts.map((o) => (
            <button
              key={o.key}
              className={`${styles.scopeBtn} ${scope === o.key ? styles.scopeBtnOn : ''}`}
              onClick={() => switchScope(o.key)}
            >
              {o.label}（{scopeCount(o.key)}）
            </button>
          ))}
        </div>

        {/* 顶部提示条（§6.4）：仅当列表里存在 #3 状态的资产。 */}
        {hasWaiting && (
          <div className={styles.hint}>
            本次有 <b>{waitingCount} 项</b>资产需参考其他资产的成品图，<b>已默认不勾选</b>。
            建议先生成被参考的资产、确认效果后再生成它们，形象更稳定；如需一并生成，勾选即可。
          </div>
        )}

        {/* 主体：待生成分组 + 生成中 + 已生成分区 */}
        <div className={styles.body}>
          {groups.map((g) => (
            <section key={g.cat} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupLabel}>{CATEGORY_LABEL[g.cat]}</span>
                <span className={styles.groupCount}>{g.items.length}</span>
                <span className={styles.groupRule} aria-hidden />
              </div>
              {g.items.map((a) => renderRow(a))}
            </section>
          ))}

          {generatingNow.length > 0 && (
            <section className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupLabel}>生成中</span>
                <span className={styles.groupCount}>{generatingNow.length}</span>
                <span className={styles.groupRule} aria-hidden />
              </div>
              {generatingNow.map((a) => (
                <div key={a.id} className={`${styles.row} ${styles.rowDone}`}>
                  <div className={styles.rowHead}>
                    <span className={styles.rowName}>{a.name}</span>
                    <span className={styles.rowChip}>{CATEGORY_LABEL[a.category]}</span>
                    <span className={styles.doneTag}>生成中…</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {hasImage.length > 0 && (
            <section className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupLabel}>已生成</span>
                <span className={styles.groupCount}>{hasImage.length}</span>
                <span className={styles.groupRule} aria-hidden />
                <span className={styles.groupNote}>勾选可重新生成，不覆盖原图</span>
              </div>
              {hasImage.map((a) => renderRow(a, true))}
            </section>
          )}

          {groups.length === 0 && generatingNow.length === 0 && hasImage.length === 0 && (
            <div className={styles.empty}>没有可生成的资产。</div>
          )}
        </div>

        {/* 底栏：已选 X/Y · 参数 · 星钻 · 生成 */}
        <div className={styles.foot}>
          <button className={styles.selectAll} disabled={selectable.length === 0} onClick={toggleAll}>
            {allPicked ? '取消全选' : '全选'}
          </button>
          <span className={styles.footSel}>已选 {selectedCount}/{scoped.length}</span>
          {pickedRegen.length > 0 && (
            <span className={styles.footNote}>其中 {pickedRegen.length} 份为重新生成，不覆盖原图</span>
          )}
          <div className={styles.params}>
            <select className={styles.sel} defaultValue={MODEL_OPTS[0]}>{MODEL_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
            <select className={styles.sel} defaultValue={QUALITY_OPTS[0]}>{QUALITY_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
            <select className={styles.sel} defaultValue={RATIO_OPTS[0]}>{RATIO_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
            <select className={styles.sel} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNT_OPTS.map((o) => <option key={o} value={o}>{o} 张</option>)}
            </select>
          </div>
          <span className={styles.cost}>⚡ {cost} 星钻</span>
          <button className={styles.genBtn} disabled={selectedCount === 0} onClick={requestGenerate}>
            生成（{selectedCount}）
          </button>
        </div>

        {/* 二次确认 */}
        {confirm && <ConfirmLayer kind={confirm} world={world} picked={[...pickedNew, ...pickedRegen]} selSet={selSet} onBack={() => setConfirm(null)} onGo={doGenerate} />}
      </div>
    </div>
  )
}

/** 二次确认层（§6.4）：两种文案。 */
function ConfirmLayer({
  kind, world, picked, selSet, onBack, onGo,
}: {
  kind: 'together' | 'unreachable'
  world: ReturnType<typeof useStore.getState>['world']
  picked: Asset[]
  selSet: Set<string>
  onBack: () => void
  onGo: () => void
}) {
  const byId = (id: string) => world.assets.find((a) => a.id === id)?.name ?? id
  if (kind === 'together') {
    const refers = picked.filter((a) => (a.references ?? []).some((ref) => ref.kind === 'asset' && ref.assetId !== a.id && selSet.has(ref.assetId)))
    const upstream = new Set<string>()
    for (const a of refers) for (const ref of a.references ?? []) if (ref.kind === 'asset' && selSet.has(ref.assetId)) upstream.add(ref.assetId)
    return (
      <div className={styles.confirmRoot}>
        <div className={styles.confirmScrim} onClick={onBack} />
        <div className={styles.confirmCard}>
          <h4 className={styles.confirmTitle}>有 {refers.length} 项资产需参考本批次内的其他资产</h4>
          <p className={styles.confirmBody}>
            系统将按依赖顺序先生成被参考的资产，再生成它们，参考可正常建立。但在此过程中，你将无法在被参考资产出图后<b>先行确认、更换定稿或调整提示词</b>——本批将一次性完成。
          </p>
          <p className={styles.confirmList}>需参考同批资产：{refers.map((a) => a.name).join(' · ')}</p>
          <p className={styles.confirmList}>被参考的资产：{[...upstream].map(byId).join(' · ')}</p>
          <div className={styles.confirmActions}>
            <button className={styles.btnGhost} onClick={onBack}>返回调整</button>
            <button className={styles.btnPri} onClick={onGo}>确认一并生成</button>
          </div>
        </div>
      </div>
    )
  }
  // unreachable
  const unreach = new Set<string>()
  for (const a of picked) for (const r of pendingRefs(world, a)) if (!selSet.has(r.assetId)) unreach.add(r.assetId)
  const n = picked.filter((a) => pendingRefs(world, a).some((r) => !selSet.has(r.assetId))).length
  return (
    <div className={styles.confirmRoot}>
      <div className={styles.confirmScrim} onClick={onBack} />
      <div className={styles.confirmCard}>
        <h4 className={styles.confirmTitle}>有 {unreach.size} 项参考对象尚未生成</h4>
        <p className={styles.confirmBody}>
          这些参考对象还没有生成图片，本次将<b>暂不参考其形象</b>，仅依据提示词生成。参考关系会为你保留，待它们出图后重新生成，即可自动生效。（影响 {n} 项资产）
        </p>
        <p className={styles.confirmList}>本次暂不参考：{[...unreach].map(byId).join(' · ')}</p>
        <div className={styles.confirmActions}>
          <button className={styles.btnGhost} onClick={onBack}>暂不生成</button>
          <button className={styles.btnPri} onClick={onGo}>确认生成</button>
        </div>
      </div>
    </div>
  )
}
