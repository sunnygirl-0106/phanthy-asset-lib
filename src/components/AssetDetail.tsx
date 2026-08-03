/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】AssetDetail —— 资产详情 + 流转动作（弹窗版 v4 · 移植自角色详情交互原型）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 点开一份资产看到的东西：素模 / 封面大图、字段、血缘、音色、造型，
 * 以及"这份资产在这一层、由当前这个账号能做的流转动作"。
 *
 * 【视觉】整套弹窗 UI 直接复用「角色详情交互原型_弹窗版_3.html」：
 *   · 弹窗自带外壳（遮罩 + 两栏面板），不再套通用 <Modal>；
 *   · 头部：标题 + ✎ 改名 + 血缘/字段 chips + 流转动作按钮 + 关闭；
 *   · 左栏：身份锚点（素模，非角色则退化成封面大图）+ 音色 bar；
 *   · 右栏：造型网格（可设为封面）；
 *   · 目标选择 / 音色设置以居中子面板（sub-panel）浮出。
 *
 * 【逻辑】完全不变：按钮出现与否仍由 asset.scope + 当前账号权限决定，
 *   所有动作只调用 store（runReuse / runDeposit / setVoice …），规则仍在
 *   permission.ts / assetService.ts 里。这里只换了"长什么样"。
 * ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react'
import type { Category, Voice } from '../data/types'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { canDirectReuse, canFavorite, canReuseFromTeam, canRemovePlazaAsset, canDeleteLibraryAsset, canContributeToPlaza, canViewPrompt, canRegenerate, isAdmin, depositMode } from '../services/permission'
import { coverOf } from '../services/assetService'
import { teamHasSameName } from '../services/canvasService'
import { PRESET_VOICES } from '../data/presetVoices'
import { PROMPT_CHARACTER } from '../data/seed'
import styles from './AssetDetail.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频',
}
const SCOPE_LABEL = { plaza: '素材广场', team: '团队资产库', project: '项目资产库' }

// 弹出的"目标选择"面板处于哪种模式
type PickerMode = 'directReuse' | 'reuse' | 'favorite' | 'contribute' | 'deposit' | 'voice' | null

/** 极简"提示词"角标图标（对话气泡里一行字）——素模 / 造型的提示词入口共用。 */
function PromptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M7 9h10M7 12h6" />
    </svg>
  )
}

/** 详情图片卡片 hover 删除入口。 */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** 空壳占位大图图标（R1：图片被清空后详情左栏大图显示）。 */
function PlaceholderIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

/** 放大查看图标（画布详情：封面 / 造型 右上角 hover 浮出）。 */
function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  )
}

/** 下载图标（画布详情：封面 / 造型 右上角 hover 浮出）。 */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

/** 存原图：同源静态资源用 <a download> 触发浏览器下载（本期占位图即可）。 */
function downloadImage(src: string, name: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = `${name || 'image'}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 极简话筒图标——音色入口共用（替代原来的 emoji）。 */
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
    </svg>
  )
}

/** 未设置音色时的静音话筒（替代原来的 emoji）。 */
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

/** 一个极简试听按钮：点一下就播这段音源（详情页、候选行共用）。 */
function PlayButton({ src, label = '试听' }: { src: string; label?: string }) {
  return (
    <button
      type="button"
      className={styles.playBtn}
      onClick={(e) => {
        e.stopPropagation()
        new Audio(src).play().catch(() => {})
      }}
    >
      ▶ {label}
    </button>
  )
}

/**
 * 造型勾选的默认值（v5 改动2）：文档口径「默认全部勾上、允许取消」——
 * 直接复用 / 复用 / 贡献 / 存入团队库四个带造型的动作统一默认全勾（素模不在此列、一律带上）。
 */
function defaultPicked(asset: { looks?: { id: string }[] }): string[] {
  return (asset.looks ?? []).map((l) => l.id)
}

export function AssetDetail({
  assetId,
  onClose,
  onUse,
  onBack,
  onVoiceDragStart,
  openBasePromptOnMount,
}: {
  assetId: string
  onClose?: () => void
  /** 画布场景专用：传入后，素模 / 每套造型浮出「使用」（落图片节点），音色浮出「放到画布」（落音频节点）。
   *  v6：提示词也能「添加到画布」→ 落一个文本节点（text）。
   *  库页（团队库 / 广场 / 项目库）不传，详情就还是纯查看 + 流转，不出现「使用」。 */
  onUse?: (opts: {
    cover?: string
    lookName?: string
    voice?: { url: string; name: string }
    text?: { content: string; name: string }
  }) => void
  /** 画布场景专用：详情就地嵌在左侧面板里（二级页），‹ 返回上一级列表；不传则退化成 onClose。 */
  onBack?: () => void
  /** 画布场景专用：音色框拖起时的载荷设置（落一个音色 / 音频节点）。 */
  onVoiceDragStart?: (e: React.DragEvent) => void
  /** 画布单图资产从卡片点「提示词」时，进入详情后直接展开素模 / 封面提示词。 */
  openBasePromptOnMount?: boolean
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const runDirectReuse = useStore((s) => s.runDirectReuse)
  const runFavorite = useStore((s) => s.runFavorite)
  const runReuse = useStore((s) => s.runReuse)
  const runDeposit = useStore((s) => s.runDeposit)
  const runContribute = useStore((s) => s.runContribute)
  const runRemovePlaza = useStore((s) => s.runRemovePlaza)
  const runDeleteAsset = useStore((s) => s.runDeleteAsset)
  const runDeleteLook = useStore((s) => s.runDeleteLook)
  const clearAssetImages = useStore((s) => s.clearAssetImages)
  const renameAsset = useStore((s) => s.renameAsset)
  const setCover = useStore((s) => s.setCover)
  const setVoice = useStore((s) => s.setVoice)
  const clearVoice = useStore((s) => s.clearVoice)
  const regenerateBaseModel = useStore((s) => s.regenerateBaseModel)
  const regenerateLook = useStore((s) => s.regenerateLook)
  const addLook = useStore((s) => s.addLook)

  // 从 world 里取最新的这份资产（改名后能立即反映）
  const asset = world.assets.find((a) => a.id === assetId)

  const [picker, setPicker] = useState<PickerMode>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [renameResult, setRenameResult] = useState<ActionResult | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(asset?.name ?? '')
  // 音色设置面板的两条路：挑预置 / 复刻
  const [voiceTab, setVoiceTab] = useState<'preset' | 'clone'>('preset')
  // 复用/直接复用/贡献 角色时，勾选要一起带上的造型 id（素模始终带上，不在这里选）
  const [pickedLooks, setPickedLooks] = useState<string[]>([])
  const [includeVoice, setIncludeVoice] = useState(true)
  const toggleLook = (id: string, on: boolean) =>
    setPickedLooks((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
  // 路 B 复刻：临时存用户上传的音源文件 + 命名草稿（本期占位，不接后端）
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  // 提示词子面板（v6）：当前打开的是素模 / 某个造型 / 新增造型；null = 未打开
  const [promptTarget, setPromptTarget] = useState<
    { kind: 'base' } | { kind: 'look'; lookId: string } | { kind: 'addLook' } | null
  >(openBasePromptOnMount ? { kind: 'base' } : null)
  const [regenDraft, setRegenDraft] = useState(openBasePromptOnMount ? asset?.prompt ?? '' : '') // 重新生成 / 新增造型的可编辑提示词草稿
  const [newLookName, setNewLookName] = useState('') // 新增造型的名字草稿（可空）
  const [copied, setCopied] = useState(false) // 「已复制」瞬时反馈
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null) // 放大查看灯箱

  // Esc：先收子面板 / 改名，再关整扇弹窗（原来的 Esc 由通用 Modal 管，现在弹窗自管）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (preview) setPreview(null)
      else if (promptTarget) setPromptTarget(null)
      else if (picker) setPicker(null)
      else if (renaming) setRenaming(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, promptTarget, picker, renaming, onClose])

  if (!asset) return null

  // 当前账号能作为"目标"的项目
  const projectsForDirect = world.projects.filter((p) => canDirectReuse(user, p))
  const projectsForReuse = world.projects.filter((p) => canReuseFromTeam(user, p))

  // 能不能改这份资产的封面：
  //   · 只有"角色"（有造型可挑）才谈得上选封面；
  //   · 广场是官方素材、上架后不可编辑（v4），所以广场资产不给改；
  //   · admin 只治理不创作，也不改。
  const hasLooks = !!(asset.looks && asset.looks.length > 0)
  const canEditCover = hasLooks && asset.scope !== 'plaza' && !isAdmin(user)
  // 素模是否正在作为封面：cover 为空（回落到 baseModel）或显式等于 baseModel 时成立
  const isBaseModelCover = !asset.cover || asset.cover === (asset.baseModel ?? '')

  // 能不能改这份资产的音色：只有"角色"有音色；广场官方素材不可编辑；admin 只治理不创作。
  const isCharacter = asset.category === 'character'
  // 多图变体的分区名：角色本体是「素模」，素模之外挂在 looks 里的都是「其他造型」；
  // 场景/道具等其它品类同理叫「其他样式」（能力一致、只是叫法不同）。
  // 都用「其他…」口径，没有时统一显示（0），和场景/道具闭环。
  const stylesLabel = isCharacter ? '其他造型' : '其他样式'
  const canEditVoice = isCharacter && asset.scope !== 'plaza' && !isAdmin(user)

  // 口径展示：素模（+ 音色，若有）作为角色锚点，流转时一定随角色带上（逻辑已在 cloneForCopy 自动带走）。
  const anchorLabel = asset.voice ? '素模 + 音色一定会带上' : '素模（角色本体）一定会带上'

  // 流转勾选面板里那张固定带上的「素模」缩略图：仍取素模（非角色退化成封面），语义不变。
  const heroImg = asset.baseModel ?? coverOf(asset)

  // 弹窗左栏大图 = 当前封面（v7 修正语义）：素模也进了造型网格后，左边不再固定显示素模，
  // 而是"选谁当封面就大图显示谁"——选中某套造型则显示该造型图 + 造型名，回落素模则显示素模。
  const coverImg = coverOf(asset)
  const coverLook = asset.looks?.find((l) => l.cover === asset.cover)
  const coverName = isBaseModelCover ? '素模' : coverLook?.name ?? '封面'
  const coverPromptTarget: NonNullable<typeof promptTarget> =
    isBaseModelCover || !coverLook ? { kind: 'base' } : { kind: 'look', lookId: coverLook.id }

  // ── 删除分层（R1/R2）───────────────────────────────────────────────
  // 一份资产的「图片集合」大小：角色 = 素模(1) + 造型；其它类目 = 本体图(1) + 其它样式。
  const isEmpty = asset.status === 'empty'
  const bodyImage = isCharacter ? (asset.baseModel ? 1 : 0) : (coverImg ? 1 : 0)
  const imageCount = bodyImage + (asset.looks?.length ?? 0)
  const canRemovePlaza = canRemovePlazaAsset(user, asset) // 广场：admin 下架 / 作者删自己投稿（维持现状）
  const canDeleteLib = canDeleteLibraryAsset(user, asset) // 团队 / 项目库：非 admin 可删
  // 封面大图上的垃圾桶（R2：正常浏览态不出现，删除下沉到图片卡）：只在这几种情况出现——
  //   · 空壳 → 删掉整份空壳（提示词一并删）；
  //   · 广场 → 下架 / 删投稿（维持现状）；
  //   · 团队 / 项目成品：大图恰好是「最后一张图」（删了就归零），或大图正显示某套造型（删这张造型）。
  const showCoverTrash =
    isEmpty || canRemovePlaza || (canDeleteLib && (imageCount <= 1 || !!coverLook))
  const coverTrashTitle = isEmpty
    ? '删除该资产（提示词将一并删除）'
    : canRemovePlaza && asset.scope === 'plaza' && isAdmin(user)
      ? '下架该素材'
      : canRemovePlaza
        ? '删除该素材'
        : imageCount <= 1
          ? '删除这张图片'
          : '删除这套造型'

  const master = asset.masterId ? world.assets.find((a) => a.id === asset.masterId) : undefined

  // 执行一个动作后：记录结果、收起选择面板
  function done(r: ActionResult) {
    setResult(r)
    setPicker(null)
  }

  function deleteWholeAsset() {
    const r = asset!.scope === 'plaza'
      ? runRemovePlaza(asset!.id)
      : runDeleteAsset(asset!.id)
    setResult(r)
    if (r.ok) onClose?.()
  }

  // 封面大图垃圾桶的统一入口（R1/R2）：按当前态分流。
  function deleteCoverImage() {
    // 空壳整删 / 广场下架 / 删投稿 —— 维持现状。
    if (isEmpty || canRemovePlaza) return deleteWholeAsset()
    // 大图正显示某套造型（它恰好被设为封面）：删这张造型，removeLook 会自动把封面回落到剩余图或素模。
    if (imageCount > 1 && coverLook) return setResult(runDeleteLook(asset!.id, coverLook.id))
    // 大图是「最后一张图」→ 归零分流。
    deleteLastImage()
  }

  // 归零分流（R1）：删掉最后一张图时按层走不同后果。demo 用 window.confirm 即可，不做样式化弹窗。
  function deleteLastImage() {
    if (asset!.scope === 'team') {
      if (!window.confirm('这是该资产的最后一张图片，继续将删除整个资产，提示词会一并删除。')) return
      const r = runDeleteAsset(asset!.id)
      setResult(r)
      if (r.ok) onClose?.()
    } else if (asset!.scope === 'project') {
      if (!window.confirm('图片将清空，提示词会保留，你可以随时重新生成。')) return
      setResult(clearAssetImages(asset!.id))
    }
  }

  function openPicker(mode: Exclude<PickerMode, null>) {
    setPickedLooks(defaultPicked(asset!))
    setIncludeVoice(true)
    setPicker(mode)
  }

  // ── 提示词子面板（v6）：打开时预填草稿——素模/造型填当前提示词，新增造型填人物模板。──
  function openPrompt(target: NonNullable<typeof promptTarget>) {
    setCopied(false)
    if (target.kind === 'base') setRegenDraft(asset!.prompt ?? '')
    else if (target.kind === 'look')
      setRegenDraft(asset!.looks?.find((l) => l.id === target.lookId)?.prompt ?? '')
    else {
      setRegenDraft(PROMPT_CHARACTER) // 新增造型：预填人物模板，用户按需改
      setNewLookName('')
    }
    setPromptTarget(target)
  }

  /**
   * 库页提示词子面板：查看 / 复制；有权限（canRegenerate）时可就地编辑提示词并重新生成 / 新增造型。
   * 素模改素模、造型改造型，互不影响（各调各的 store 动作）。沿用现有 msub 居中浮层视觉。
   */
  function renderPromptPanel() {
    if (!promptTarget) return null
    let inner: React.ReactNode

    if (promptTarget.kind === 'addLook') {
      inner = (
        <>
          <h4 className={styles.subH}>新增{stylesLabel}</h4>
          <p className={styles.subD}>填写{stylesLabel}提示词（已预填模板，按需修改），生成一套新{stylesLabel}挂到这份资产下。</p>
          <div className={styles.field}>
            <label>{stylesLabel}名称（可选）</label>
            <input placeholder="如：夜行造型" value={newLookName} onChange={(e) => setNewLookName(e.target.value)} />
          </div>
          <textarea className={styles.promptEdit} rows={6} value={regenDraft} onChange={(e) => setRegenDraft(e.target.value)} />
          <div className={styles.inlActions}>
            <button
              className={`${styles.btn} ${styles.btnPri}`}
              disabled={!regenDraft.trim()}
              onClick={() => {
                setResult(addLook(asset!.id, regenDraft, newLookName))
                setPromptTarget(null)
              }}
            >
              生成
            </button>
            <button className={styles.btnGhost} onClick={() => setPromptTarget(null)}>取消</button>
          </div>
          <p className={styles.note}>本期占位：先存下提示词、挂一张占位图；接入生图模型后自动出图。</p>
        </>
      )
    } else {
      const isBase = promptTarget.kind === 'base'
      const lookId = promptTarget.kind === 'look' ? promptTarget.lookId : ''
      const look = lookId ? asset!.looks?.find((l) => l.id === lookId) : undefined
      const title = isBase ? '素模 · 提示词' : `${look?.name ?? '造型'} · 提示词`
      const canRegen = canRegenerate(user, asset!)
      inner = (
        <>
          <h4 className={styles.subH}>{title}</h4>
          <textarea className={styles.promptEdit} rows={7} value={regenDraft} onChange={(e) => setRegenDraft(e.target.value)} />
          {canRegen && (
            <div className={styles.inlActions}>
              <button
                className={`${styles.btn} ${styles.btnPri}`}
                onClick={() => {
                  const r = isBase
                    ? regenerateBaseModel(asset!.id, regenDraft)
                    : regenerateLook(asset!.id, lookId, regenDraft)
                  setResult(r)
                  setPromptTarget(null)
                }}
              >
                重新生成
              </button>
            </div>
          )}
        </>
      )
    }

    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setPromptTarget(null)} />
        <div className={styles.msub}>{inner}</div>
      </div>
    )
  }

  /**
   * 画布提示词子面板（v6）：只查看 / 复制 / 「添加到画布」（落一个文本节点）——画布里不放"重新生成"。
   * 复用 msub 居中浮层（叠在 cvInline 上，与 renderPicker 一致）。
   */
  function renderCanvasPromptPanel() {
    if (!promptTarget || promptTarget.kind === 'addLook') return null
    const isBase = promptTarget.kind === 'base'
    const lookId = promptTarget.kind === 'look' ? promptTarget.lookId : ''
    const look = lookId ? asset!.looks?.find((l) => l.id === lookId) : undefined
    const text = isBase ? asset!.prompt ?? '' : look?.prompt ?? ''
    const title = isBase ? '素模 · 提示词' : `${look?.name ?? '造型'} · 提示词`
    const nodeName = isBase ? `${asset!.name}·提示词` : `${asset!.name}·${look?.name}·提示词`
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setPromptTarget(null)} />
        <div className={styles.msub}>
          <h4 className={styles.subH}>{title}</h4>
          <div className={styles.promptBox}>{text || '（暂无提示词）'}</div>
          <div className={styles.inlActions}>
            <button
              className={`${styles.btn} ${styles.btnPri}`}
              disabled={!text}
              onClick={() => {
                navigator.clipboard?.writeText(text)
                setCopied(true)
              }}
            >
              {copied ? '已复制 ✓' : '复制'}
            </button>
            <button
              className={styles.btn}
              disabled={!text}
              onClick={() => {
                onUse?.({ text: { content: text, name: nodeName } })
                setPromptTarget(null)
              }}
            >
              ＋ 添加到画布
            </button>
            <button className={styles.btnGhost} onClick={() => setPromptTarget(null)}>关闭</button>
          </div>
        </div>
      </div>
    )
  }

  function commitRename() {
    const r = renameAsset(asset!.id, nameDraft)
    setRenameResult(r)
    if (r.ok) setRenaming(false)
  }

  // 放大查看灯箱：库页详情 / 画布详情共用同一段（大图 + 下载 + 关闭；点遮罩 / Esc 关）。
  function renderLightbox() {
    if (!preview) return null
    return (
      <div className={styles.lbRoot} onClick={() => setPreview(null)}>
        <div className={styles.lbStage} onClick={(e) => e.stopPropagation()}>
          <img className={styles.lbImg} src={preview.src} alt={preview.name} />
          <div className={styles.lbBar}>
            <span className={styles.lbName}>{preview.name}</span>
            <button className={styles.lbDownload} onClick={() => downloadImage(preview.src, `${asset!.name}·${preview.name}`)}>
              <DownloadIcon /> 下载原图
            </button>
          </div>
        </div>
        <button className={styles.lbClose} title="关闭" onClick={() => setPreview(null)}>✕</button>
      </div>
    )
  }

  // ── 头部流转动作按钮（跟原来的 scope + 权限判断一字不差，只是挪到了标题右侧）──
  function headActions() {
    if (isAdmin(user)) return null
    return (
      <>
        {asset!.scope === 'plaza' && (
          <>
            <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('directReuse')}>直接复用到项目</button>
            {canFavorite(user) && (
              <button className={styles.btn} onClick={() => openPicker('favorite')}>收藏进团队库</button>
            )}
          </>
        )}
        {asset!.scope === 'team' && (
          <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('reuse')}>复用到项目</button>
        )}
        {/* 存入团队库：角色要先勾选带哪些造型（素模必带、默认全勾）；非角色直接存入。
            同名先挡（v5 改动1/2）：团队库已有同名时不进造型勾选面板，直接提示改名。*/}
        {asset!.scope === 'project' && (
          <button
            className={`${styles.btn} ${styles.btnLead}`}
            onClick={() => {
              if (user.teamId && teamHasSameName(world.assets, user.teamId, asset!.name)) {
                done(runDeposit(asset!.id))
              } else if (hasLooks) {
                openPicker('deposit')
              } else {
                done(runDeposit(asset!.id))
              }
            }}
          >
            存入团队库
          </button>
        )}
        {/* 贡献到广场（v6 scope-aware）：主账号团队库/项目库都能投；子账号仅项目库——
            团队库详情页对子账号不出现此按钮。审核方是 admin。角色要先勾选带哪些造型（素模必带）。*/}
        {(asset!.scope === 'team' || asset!.scope === 'project') && canContributeToPlaza(user, asset!) && (
          <button
            className={styles.btn}
            onClick={() => {
              if (hasLooks) openPicker('contribute')
              else done(runContribute(asset!.id))
            }}
          >
            贡献到素材广场
          </button>
        )}
      </>
    )
  }

  // ── 居中子面板（目标选择 / 音色设置）──
  function renderPicker() {
    if (!picker) return null
    let inner: React.ReactNode = null

    if (picker === 'directReuse') {
      inner = (
        <>
          <h4 className={styles.subH}>直接复用到项目</h4>
          {isCharacter && (
            <LookCheckboxes baseCover={heroImg} looks={asset!.looks ?? []} picked={pickedLooks} onToggle={toggleLook} />
          )}
          {asset!.voice && (
            <button
              type="button"
              className={`${styles.voicePick} ${includeVoice ? '' : styles.voicePickOff}`}
              aria-pressed={includeVoice}
              onClick={() => setIncludeVoice((v) => !v)}
            >
              <span className={styles.voicePickIcon}><MicIcon /></span>
              <span className={styles.voicePickName}>{asset!.voice.name}</span>
              <span className={styles.voicePickCheck}>{includeVoice ? '✓' : ''}</span>
            </button>
          )}
          <ProjectChips
            projects={projectsForDirect}
            onPick={(pid) => done(runDirectReuse(asset!.id, pid, isCharacter ? pickedLooks : undefined, includeVoice))}
          />
        </>
      )
    } else if (picker === 'reuse') {
      inner = (
        <>
          <h4 className={styles.subH}>复用到项目</h4>
          {hasLooks && (
            <>
              <p className={styles.subD}><b>{anchorLabel}</b>；勾选要一起带进项目的造型（可不选，就只带素模）：</p>
              <LookCheckboxes baseCover={heroImg} looks={asset!.looks!} picked={pickedLooks} onToggle={toggleLook} />
            </>
          )}
          <p className={styles.subD}>选一个项目：</p>
          <ProjectChips projects={projectsForReuse} onPick={(pid) => done(runReuse(asset!.id, pid, hasLooks ? pickedLooks : undefined))} />
        </>
      )
    } else if (picker === 'favorite') {
      inner = (
        <>
          <h4 className={styles.subH}>收藏进团队库</h4>
          {hasLooks && (
            <>
              <p className={styles.subD}><b>{anchorLabel}</b>；勾选要一起收藏进团队库的造型（默认全选，可取消，就只收素模）：</p>
              <LookCheckboxes baseCover={heroImg} looks={asset!.looks!} picked={pickedLooks} onToggle={toggleLook} />
            </>
          )}
          <p className={styles.subD}>收藏 = 拷一份独立副本进团队库：</p>
          <div className={styles.inlActions}>
            <button className={`${styles.btn} ${styles.btnPri}`} onClick={() => done(runFavorite(asset!.id, hasLooks ? pickedLooks : undefined))}>
              确认收藏（{hasLooks ? pickedLooks.length + 1 : 1}）张
            </button>
            <button className={styles.btnGhost} onClick={() => setPicker(null)}>取消</button>
          </div>
        </>
      )
    } else if (picker === 'deposit') {
      inner = (
        <>
          <h4 className={styles.subH}>存入团队库</h4>
          <LookCheckboxes baseCover={heroImg} looks={asset!.looks!} picked={pickedLooks} onToggle={toggleLook} />
          {depositMode(user) === 'apply' && <p className={styles.note}>上传后需主账号审核。</p>}
          {asset!.cover === asset!.baseModel && (
            <p className={styles.note}>当前用素模当封面，可到造型里「设为封面」挑张定妆照，货架上更好看好找。</p>
          )}
          <div className={styles.inlActions}>
            <button className={`${styles.btn} ${styles.btnPri}`} onClick={() => done(runDeposit(asset!.id, pickedLooks))}>
              确认存入（{pickedLooks.length + 1}）张
            </button>
            <button className={styles.btnGhost} onClick={() => setPicker(null)}>取消</button>
          </div>
        </>
      )
    } else if (picker === 'contribute') {
      inner = (
        <>
          <h4 className={styles.subH}>贡献到素材广场</h4>
          <LookCheckboxes baseCover={heroImg} looks={asset!.looks!} picked={pickedLooks} onToggle={toggleLook} />
          {asset!.cover === asset!.baseModel && (
            <p className={styles.note}>当前用素模当封面，可到造型里「设为封面」挑张定妆照，货架上更好看好找。</p>
          )}
          <div className={styles.inlActions}>
            <button className={`${styles.btn} ${styles.btnPri}`} onClick={() => done(runContribute(asset!.id, pickedLooks))}>
              确认贡献（{pickedLooks.length + 1}）张
            </button>
            <button className={styles.btnGhost} onClick={() => setPicker(null)}>取消</button>
          </div>
        </>
      )
    } else if (picker === 'voice') {
      const isPreset = voiceTab === 'preset'
      inner = (
        <>
          <h4 className={styles.subH}>{asset!.voice ? '更换音色' : '设置音色'}</h4>
          <p className={styles.subD}>一个角色只有一个音色</p>
          <div className={styles.vtabs}>
            <button className={`${styles.vtab} ${isPreset ? styles.vtabOn : ''}`} onClick={() => setVoiceTab('preset')}>
              <b>挑一个预置音色</b>
            </button>
            <button className={`${styles.vtab} ${!isPreset ? styles.vtabOn : ''}`} onClick={() => setVoiceTab('clone')}>
              <b>上传音色</b>
            </button>
          </div>
          {isPreset ? (
            PRESET_VOICES.map((v) => (
              <div key={v.id} className={styles.preset}>
                <div className={styles.pi}><MicIcon /></div>
                <div className={styles.pmeta}>
                  <div className={styles.pn}>{v.name}{v.gender && <span className={styles.gtag}>{v.gender}</span>}</div>
                </div>
                <PlayButton src={v.previewUrl} />
                <button className={`${styles.btn} ${styles.btnPri} ${styles.btnSm}`} onClick={() => { setVoice(asset!.id, { ...v }); setPicker(null) }}>选用</button>
              </div>
            ))
          ) : (
            <>
              <label className={styles.drop}>
                <div className={styles.dropMic}><MicIcon /></div>
                <div><b>上传 5–10 秒清晰人声</b>（安静环境）</div>
                <div style={{ marginTop: 6, fontSize: 11.5 }}>对齐主流复刻模型的样本要求</div>
                <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => setCloneFile(e.target.files?.[0] ?? null)} />
              </label>
              {cloneFile && <p className={styles.note}>已选：{cloneFile.name}</p>}
              <div className={styles.field}>
                <label>音色命名</label>
                <input placeholder="如：男主 · 磁性低音" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
              </div>
              <div className={styles.inlActions}>
                <button
                  className={`${styles.btn} ${styles.btnPri}`}
                  disabled={!cloneFile}
                  onClick={() => {
                    if (!cloneFile) return
                    const url = URL.createObjectURL(cloneFile)
                    const voice: Voice = {
                      id: `cloned_${Date.now()}`,
                      type: 'cloned',
                      name: cloneName.trim() || '未命名音色',
                      previewUrl: url, // 占位：回放原音
                      sampleUrl: url,
                      providerVoiceId: undefined, // 待接入
                    }
                    setVoice(asset!.id, voice)
                    setCloneFile(null)
                    setCloneName('')
                    setPicker(null)
                    setResult({ ok: true, message: '已保存音源，复刻将在接入语音模型后生效' })
                  }}
                >
                  确认
                </button>
                <button className={styles.btnGhost} onClick={() => setPicker(null)}>取消</button>
              </div>
              <p className={styles.note}>本期占位：先存下样本、试听回放原音；接入语音模型后复刻自动生效，入口零改动。</p>
            </>
          )}
        </>
      )
    }

    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setPicker(null)} />
        <div className={styles.msub}>{inner}</div>
      </div>
    )
  }

  // ═══ 画布场景（onUse）：单栏"身份锚点 + 造型"布局，只做"挑一张图用到画布"。
  //     复用同一份 state / 音色 picker（renderPicker）/ setVoice，库页布局完全不受影响。 ═══
  if (onUse) {
    const playVoice = () => { if (asset.voice) new Audio(asset.voice.previewUrl).play().catch(() => {}) }
    return (
      <div className={styles.cvInline}>
        <div className={styles.cvHead}>
          <div className={styles.cvTitleRow}>
            <span className={styles.cvTitle}>资产</span>
            <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
          </div>
          <button className={styles.cvBack} onClick={onBack ?? onClose}>‹ {asset.name}</button>
        </div>

        <div className={styles.cvBody}>
            {/* 封面（左）+ 音色（右）并排：封面跟随当前选中的封面（素模 / 造型），音色摆在图右边 */}
            <div className={styles.anchorWrap}>
              <div className={styles.secTag}><span className={styles.secDot} />封面</div>
              <div className={styles.anchorRow}>
                <div className={styles.sumo}>
                  <div className={styles.sumoPic}>
                    <img src={coverImg} alt={coverName} />
                    <div className={styles.thumbIcons}>
                      <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: coverImg, name: coverName })}><ZoomIcon /></button>
                      <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(coverImg, `${asset.name}·${coverName}`)}><DownloadIcon /></button>
                    </div>
                    <div className={styles.sumoOvC}>
                      <button className={styles.lookUse} onClick={() => onUse({ cover: coverImg, lookName: coverLook?.name })}>使用</button>
                      {canViewPrompt(asset) && (
                        <button className={styles.sumoPrompt} onClick={() => openPrompt(coverPromptTarget)}>
                          提示词
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.sumoCap}><b>{coverName}</b></div>
                </div>

                {isCharacter && (
                  <div className={styles.rightAnchor}>
                    <div
                      className={styles.voiceBox}
                      draggable={!!(asset.voice && onVoiceDragStart)}
                      onDragStart={asset.voice ? onVoiceDragStart : undefined}
                    >
                      {asset.voice ? (
                        <>
                          <div className={styles.voiceTop}>
                            <div className={styles.voiceIco}><MicIcon /></div>
                            <div className={styles.voiceMeta}>
                              <div className={styles.voiceName}>
                                {asset.voice.name}
                                {asset.voice.gender && <span className={styles.gtag}>{asset.voice.gender}</span>}
                              </div>
                              <div className={styles.voiceTag}>
                                {asset.voice.type === 'cloned' ? '复刻 · 接模型后生效' : '预置音色'}
                              </div>
                            </div>
                            {asset.scope === 'plaza' && <span className={styles.voiceRo}>官方·只读</span>}
                          </div>
                          <div className={styles.voiceActions}>
                            <button className={styles.listen} onClick={playVoice}>▶ 试听</button>
                            <button
                              className={styles.useVoice}
                              onClick={() => onUse?.({ voice: { url: asset.voice!.previewUrl, name: `${asset.name}·音色` } })}
                            >
                              ＋ 放到画布
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.voiceTop}>
                            <div className={`${styles.voiceIco} ${styles.voiceIcoOff}`}><MicOffIcon /></div>
                            <div className={styles.voiceMeta}>
                              <div className={styles.voiceNameOff}>音色 · 未设置</div>
                              <div className={styles.voiceTag}>这个角色还没有声音</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 造型：挑一套用到画布 */}
            <>
                <div className={styles.looksHead}>
                  <div className={styles.looksHeadT}>{stylesLabel}（{asset.looks?.length ?? 0}）</div>
                </div>
                {hasLooks && (
                <div className={styles.looksGrid}>
                  {asset.looks!.map((look) => (
                    <div key={look.id} className={styles.lookCard}>
                      <div className={styles.lookPic}>
                        <img src={look.cover} alt={look.name} loading="lazy" />
                        <div className={styles.thumbIcons}>
                          <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: look.cover, name: look.name })}><ZoomIcon /></button>
                          <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(look.cover, `${asset.name}·${look.name}`)}><DownloadIcon /></button>
                        </div>
                        <div className={styles.lookOvC}>
                          <button className={styles.lookUse} onClick={() => onUse({ cover: look.cover, lookName: look.name })}>使用</button>
                          {canViewPrompt(asset) && (
                            <button className={styles.lookPrompt} onClick={() => openPrompt({ kind: 'look', lookId: look.id })}>
                              提示词
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={styles.lookMeta}><div className={styles.lookName}>{look.name}</div></div>
                    </div>
                  ))}
                </div>
                )}
              </>
          </div>

        {/* 复用库页那套「音色设置 / 更换」子面板 */}
        {renderPicker()}
        {/* 提示词子面板（v6）：查看 / 复制 / 添加到画布（落文本节点）——画布里不放"重新生成" */}
        {renderCanvasPromptPanel()}
        {/* 放大查看灯箱（库页 / 画布共用） */}
        {renderLightbox()}
      </div>
    )
  }

  return (
    <div className={styles.mroot}>
      <div className={styles.mscrim} onClick={onClose} />
      <div className={styles.modal}>
        {/* ── 头部：标题 + 改名 + chips + 流转动作 + 关闭 ── */}
        <div className={styles.mhead}>
          <div className={styles.mtitleWrap}>
            {renaming ? (
              <input
                className={styles.rnInput}
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
              />
            ) : (
              <>
                <div className={styles.mtitleRow}>
                  <span className={styles.mtitle}>{asset.name}</span>
                  {asset.scope !== 'plaza' && (
                    <button className={styles.pencil} title="改名" onClick={() => { setNameDraft(asset.name); setRenameResult(null); setRenaming(true) }}>✎</button>
                  )}
                </div>
                <div className={styles.chips}>
                  <span className={styles.chip}>{CATEGORY_LABEL[asset.category]}</span>
                  <span className={styles.chip}>{SCOPE_LABEL[asset.scope]}</span>
                  {asset.masterId && (
                    <span className={`${styles.chip} ${styles.chipCopy}`}>副本 · 源自「{master?.name ?? '母版'}」</span>
                  )}
                </div>
              </>
            )}
            {renameResult && (
              <div className={`${styles.result} ${renameResult.ok ? styles.resultOk : styles.resultErr}`}>
                {renameResult.ok ? '✅ ' : '⚠️ '}{renameResult.message}
              </div>
            )}
          </div>
          <div className={styles.mheadActions}>
            {renaming ? (
              <>
                <button className={`${styles.btn} ${styles.btnLead}`} onClick={commitRename}>保存</button>
                <button className={styles.btnGhost} onClick={() => setRenaming(false)}>取消</button>
              </>
            ) : (
              <>
                {headActions()}
                <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
              </>
            )}
          </div>
        </div>

        {/* ── 主体：左栏（素模/封面 + 音色）｜右栏（造型）── */}
        <div className={styles.mbody}>
          <div className={styles.mleft}>
            <div>
              <div className={styles.baseLg}>
                {isEmpty ? (
                  // 空壳（R1）：图片已清空，大图显示占位符；点提示词图标可编辑提示词并「重新生成」恢复成品。
                  <div className={styles.emptyBig}>
                    <PlaceholderIcon />
                    <span>待生成 · 点提示词可重新生成</span>
                  </div>
                ) : (
                  <img src={coverImg} alt={coverName} />
                )}
                <span className={styles.cap}>{isEmpty ? '空壳' : coverName}</span>
                {!isEmpty && (
                  <div className={`${styles.thumbIcons} ${showCoverTrash ? styles.thumbIconsShifted : ''}`}>
                    <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: coverImg, name: coverName })}><ZoomIcon /></button>
                    <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(coverImg, `${asset.name}·${coverName}`)}><DownloadIcon /></button>
                  </div>
                )}
                {showCoverTrash && (
                  <button
                    type="button"
                    className={styles.cardDelete}
                    title={coverTrashTitle}
                    onClick={deleteCoverImage}
                  >
                    <TrashIcon />
                  </button>
                )}
                {canViewPrompt(asset) && (
                  <button className={styles.promptBadge} title="查看提示词" onClick={() => openPrompt(coverPromptTarget)}>
                    <PromptIcon />
                  </button>
                )}
              </div>
            </div>

            {/* 音色 */}
            {isCharacter && (
              <div>
                <div className={styles.lbl}>音色</div>
                {asset.voice ? (
                  <div className={styles.vbar}>
                    <div className={styles.vi}><MicIcon /></div>
                    <div className={styles.vmeta}>
                      <div className={styles.vn}>
                        {asset.voice.name}
                        {asset.voice.gender && <span className={styles.gtag}>{asset.voice.gender}</span>}
                      </div>
                      {asset.voice.type === 'cloned' && <div className={styles.vsub}>复刻 · 接模型后生效</div>}
                    </div>
                    <PlayButton src={asset.voice.previewUrl} label="" />
                    {canEditVoice && (
                      <>
                        <button className={styles.vset} onClick={() => { setVoiceTab('preset'); setPicker('voice') }}>更换</button>
                        <button className={styles.vset} onClick={() => clearVoice(asset.id)}>清除</button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className={`${styles.vbar} ${styles.vbarOff}`}>
                    <div className={styles.vi}><MicOffIcon /></div>
                    <div className={styles.vmeta}><div className={styles.vunset}>音色 · 未设置</div></div>
                    {canEditVoice && (
                      <button className={styles.vset} onClick={() => { setVoiceTab('preset'); setPicker('voice') }}>＋ 设置音色</button>
                    )}
                  </div>
                )}
                {asset.voice?.type === 'cloned' && !asset.voice.providerVoiceId && (
                  <p className={styles.note}>复刻音色将在接入语音模型后生效（当前为上传原音试听）。</p>
                )}
              </div>
            )}
          </div>

          <div className={styles.mright}>
            <>
                <p className={styles.secT}>{stylesLabel} <span className={styles.cnt}>（{asset.looks?.length ?? 0}）</span></p>
                {hasLooks && <p className={styles.secD}>选一张作为封面</p>}
                <div className={styles.looks}>
                  {/* 当前封面只在左栏大图显示，右侧网格一律不重复它——所以卡片数恒等于「其他造型」计数。
                      素模作为可换回封面的选项：只在它「不是当前封面」时才排进来（可编辑封面时）。 */}
                  {canEditCover && asset.baseModel && !isBaseModelCover && (
                    // 素模是角色本体：不逐张删（R1/点 2 最小口径），删掉其他造型后随资产一并处理。
                    <div className={styles.look} title="素模为角色本体，删除其他图片后可随资产一并处理">
                      <img src={asset.baseModel} alt="素模" loading="lazy" />
                      <div className={styles.lkNm}>素模</div>
                      <div className={styles.lookOv}>
                        <button className={styles.tbtn} onClick={() => setCover(asset.id, '')}>设为封面</button>
                      </div>
                    </div>
                  )}
                  {/* 造型卡：过滤掉「正作为封面」的那套，它已经在左栏大图显示，避免右侧重复出现。 */}
                  {(asset.looks ?? []).filter((look) => look.cover !== asset.cover).map((look) => (
                      <div key={look.id} className={styles.look}>
                        <img src={look.cover} alt={look.name} loading="lazy" />
                        <div className={`${styles.thumbIcons} ${canDeleteLibraryAsset(user, asset) ? styles.thumbIconsShifted : ''}`}>
                          <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: look.cover, name: look.name })}><ZoomIcon /></button>
                          <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(look.cover, `${asset.name}·${look.name}`)}><DownloadIcon /></button>
                        </div>
                        {canDeleteLibraryAsset(user, asset) && (
                          <button
                            type="button"
                            className={styles.cardDelete}
                            title="删除该造型"
                            onClick={() => setResult(runDeleteLook(asset.id, look.id))}
                          >
                            <TrashIcon />
                          </button>
                        )}
                        {canViewPrompt(asset) && (
                          <button
                            className={styles.promptBadge}
                            title="查看提示词"
                            onClick={() => openPrompt({ kind: 'look', lookId: look.id })}
                          >
                            <PromptIcon />
                          </button>
                        )}
                        <div className={styles.lkNm}>{look.name}</div>
                        {canEditCover && (
                          <div className={styles.lookOv}>
                            <button className={styles.tbtn} onClick={() => setCover(asset.id, look.cover)}>设为封面</button>
                          </div>
                        )}
                      </div>
                  ))}
                  {/* ＋新增造型（v6）：有权限（canRegenerate）才显示，用户自填提示词生成一套新造型。 */}
                  {canRegenerate(user, asset) && (
                    <button className={styles.addLook} title={`新增${stylesLabel}`} onClick={() => openPrompt({ kind: 'addLook' })}>
                      <span style={{ fontSize: 22 }}>＋</span>
                      <span>新增{stylesLabel}</span>
                    </button>
                  )}
                </div>
              </>

            {/* 说明 / 治理 / 结果：随场景出现，逻辑与原来一致 */}
            <div className={styles.mfoot}>
              {isAdmin(user) && asset.scope !== 'plaza' && (
                <p className={styles.note}>管理员只治理，不参与创作与流转。</p>
              )}
              {result && (
                <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
                  {result.ok ? '✅ ' : '⚠️ '}{result.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 居中子面板：目标选择 / 音色设置 */}
        {renderPicker()}
        {/* 提示词子面板（v6）：查看 / 复制 / 重新生成 / 新增造型 */}
        {renderPromptPanel()}
      </div>
      {/* 放大查看灯箱：盖在整扇弹窗之上（挂在 .modal 外，避开其 overflow:hidden） */}
      {renderLightbox()}
    </div>
  )
}

/** 一排项目按钮，供"选目标项目"用。 */
function ProjectChips({
  projects,
  onPick,
}: {
  projects: { id: string; name: string }[]
  onPick: (projectId: string) => void
}) {
  if (projects.length === 0) return <p className={styles.note}>当前账号没有可作为目标的项目。</p>
  return (
    <div className={styles.projChips}>
      {projects.map((p) => (
        <button key={p.id} className={styles.pchip} onClick={() => onPick(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  )
}

/** 一组造型缩略图勾选框，供"复用/直接复用/贡献时选带哪些造型"用（素模不在这里选、一律带上）。 */
function LookCheckboxes({
  baseCover,
  looks,
  picked,
  onToggle,
}: {
  baseCover: string
  looks: { id: string; name: string; cover: string }[]
  picked: string[]
  onToggle: (lookId: string, on: boolean) => void
}) {
  return (
    <div className={styles.pick}>
      <div className={`${styles.pk} ${styles.pkLocked} ${styles.pkOn}`}>
        <img src={baseCover} alt="素模" loading="lazy" />
        <span className={styles.ck}>✓</span>
        <span className={styles.nm}>素模</span>
      </div>
      {looks.map((look) => {
        const checked = picked.includes(look.id)
        return (
          <label key={look.id} className={`${styles.pk} ${checked ? styles.pkOn : ''}`}>
            <input type="checkbox" checked={checked} style={{ display: 'none' }} onChange={(e) => onToggle(look.id, e.target.checked)} />
            <img src={look.cover} alt={look.name} loading="lazy" />
            <span className={styles.ck}>✓</span>
            <span className={styles.nm}>{look.name}</span>
          </label>
        )
      })}
    </div>
  )
}
