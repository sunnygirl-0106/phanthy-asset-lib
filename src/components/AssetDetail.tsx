/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】AssetDetail —— 资产详情 + 流转动作（0803 结构重做）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 新模型：一份资产 = 一张【定稿图】(cover) + 一个【候选池】(candidates)。
 * 变体（睡衣苏晚等）各自独立成资产，不再作为"造型子资产"挂在这里。
 *
 * 布局（库页弹窗）：
 *   · 左栏：定稿大图 + 设为定稿/下载/删除（删触发 3.5 归零判定）+ 音色 + 提示词入口
 *   · 右栏：候选池（已保留），★ 定稿；hover 设为定稿/下载/删除
 *   （左侧的「提示词 + 参考图 + 参数 + 生成」三栏生成面板在阶段二补齐。）
 *
 * 逻辑仍完全由 asset.scope + 当前账号权限决定，动作只调 store。
 * ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react'
import type { Category, Voice } from '../data/types'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { canDirectReuse, canFavorite, canReuseFromTeam, canRemovePlazaAsset, canDeleteLibraryAsset, canContributeToPlaza, canViewPrompt, canRegenerate, isAdmin } from '../services/permission'
import { coverOf } from '../services/assetService'
import { COST_PER_IMAGE } from '../data/pricing'
import { PRESET_VOICES } from '../data/presetVoices'
import { CanvasAssetPanel, type PickedRef } from './canvas/CanvasAssetPanel'
import { assetUrl } from '../utils/assets'
import styles from './AssetDetail.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}
/** 空态文案按类目走："你的角色图将会在这里展示"。音频不进这个面板。 */
const EMPTY_HINT_BY_CATEGORY: Record<Category, string> = {
  character: '你的角色图将会在这里展示',
  costume: '你的服装图将会在这里展示',
  scene: '你的场景图将会在这里展示',
  prop: '你的道具图将会在这里展示',
  audio: '',
  other: '',
}
const SCOPE_LABEL = { plaza: '素材广场', team: '团队资产库', project: '项目资产库' }
/** 「其他」媒介文案（详情大图 cap / 徽章共用）。 */
const OTHER_MEDIA_LABEL: Record<'image' | 'video' | 'text', string> = { image: '图片', video: '视频', text: '文本' }
/** Demo 无生图后端：生成 / 恢复空壳时先落这张占位图，接模型后换真图。 */
const IMG_PLACEHOLDER = assetUrl('assets/canvas/image-placeholder.svg')

/** 去掉 ?g=N 后缀，拿到图片本体地址。 */
function baseUrl(u: string): string { return u.split('?')[0] }
/** 生成图来源：定稿 → 造型真实成品图替身（fields.lookUrl，演示脚手架）→ 参考图第一张 → 通用占位图。 */
function genSourceOf(a: { cover: string; fields?: { lookUrl?: unknown }; referenceImages?: string[] }): string {
  const look = typeof a.fields?.lookUrl === 'string' ? a.fields.lookUrl : undefined
  return baseUrl(a.cover || look || a.referenceImages?.[0] || IMG_PLACEHOLDER)
}

/** 生成参数选项（纯展示，对齐现有产品「一键生成」弹窗；仅数量驱动张数）。 */
const RATIO_OPTS = ['3 : 4', '1 : 1', '9 : 16', '16 : 9']
const COUNT_OPTS = [4, 1, 2, 6]
const QUALITY_OPTS = ['2K', '1K', '4K']
const MODEL_OPTS = ['即梦 5.0', '即梦 4.0', 'Seedream 3.0']

// 弹出的"目标选择"面板处于哪种模式
type PickerMode = 'directReuse' | 'reuse' | 'favorite' | 'contribute' | 'deposit' | 'voice' | null

/** 极简"提示词"角标图标。 */
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

/** 空壳占位大图图标。 */
function PlaceholderIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

/** 重新生成图标（清空图片确认弹窗用）。 */
function RegenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

/** 放大查看图标。 */
function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  )
}

/** 下载图标。 */
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

/** 极简话筒图标——音色入口共用。 */
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
    </svg>
  )
}

/** 未设置音色时的静音话筒。 */
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

/** 一个极简试听按钮：点一下就播这段音源。 */
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
  /** 画布场景专用：传入后，定稿 / 候选图浮出「使用」（落图片节点），音色浮出「放到画布」（落音频节点）。
   *  v6：提示词也能「添加到画布」→ 落一个文本节点（text）。 */
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
  /** 画布单图资产从卡片点「提示词」时，进入详情后直接展开定稿提示词。 */
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
  const runRemoveCandidate = useStore((s) => s.runRemoveCandidate)
  const runSetFinal = useStore((s) => s.runSetFinal)
  const runUnsetFinal = useStore((s) => s.runUnsetFinal)
  const appendCandidates = useStore((s) => s.appendCandidates)
  const setPrompt = useStore((s) => s.setPrompt)
  const removeReferenceImage = useStore((s) => s.removeReferenceImage)
  const addReferenceImages = useStore((s) => s.addReferenceImages)
  const clearAssetImages = useStore((s) => s.clearAssetImages)
  const renameAsset = useStore((s) => s.renameAsset)
  const setVoice = useStore((s) => s.setVoice)
  const clearVoice = useStore((s) => s.clearVoice)

  // 从 world 里取最新的这份资产（改名后能立即反映）
  const asset = world.assets.find((a) => a.id === assetId)

  const [picker, setPicker] = useState<PickerMode>(null)
  // 删最后一张图的样式化确认弹窗：'whole'=删整份资产（团队/广场/其他），'clear'=清空图片保留提示词（项目）
  const [confirmKind, setConfirmKind] = useState<'whole' | 'clear' | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [renameResult, setRenameResult] = useState<ActionResult | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(asset?.name ?? '')
  // 音色设置面板的两条路：挑预置 / 复刻
  const [voiceTab, setVoiceTab] = useState<'preset' | 'clone'>('preset')
  const [includeVoice, setIncludeVoice] = useState(true)
  // 路 B 复刻：临时存用户上传的音源文件 + 命名草稿（本期占位，不接后端）
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  // 提示词子面板：查看 / 编辑定稿提示词
  const [promptOpen, setPromptOpen] = useState(!!openBasePromptOnMount)
  const [promptDraft, setPromptDraft] = useState(asset?.prompt ?? '')
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null) // 放大查看灯箱

  // ── 阶段二 · 三栏生成面板的本地态 ──────────────────────────────────
  // 生成中（demo 用定时器模拟出图耗时，让演示看得出"在调模型"）。null = 不在生成；值 = 本次生成张数。
  const [generating, setGenerating] = useState<number | null>(null)
  // 中栏预览的是候选池里哪一张。null = 定稿（没有定稿时 = 池里第一张）。
  const [centerKeptId, setCenterKeptId] = useState<string | null>(null)
  // 生成参数（纯展示，仅「生成数量」驱动本次生成的张数）。
  const [genCount, setGenCount] = useState(4)
  // 参考图选择器（0804）：null=关；'menu'=二选一；'library'=从素材库多选。
  const [refPicker, setRefPicker] = useState<'menu' | 'library' | null>(null)

  // Esc：先收子面板 / 改名，再关整扇弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (preview) setPreview(null)
      else if (refPicker) setRefPicker(null)
      else if (promptOpen) setPromptOpen(false)
      else if (picker) setPicker(null)
      else if (renaming) setRenaming(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, refPicker, promptOpen, picker, renaming, onClose])

  // 切换到另一份资产时，清掉三栏面板的本地态（生成中 / 中栏选中 / 提示词草稿）。
  useEffect(() => {
    setGenerating(null)
    setCenterKeptId(null)
    setRefPicker(null)
    setPromptDraft(asset?.prompt ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  // 结果提示 3 秒自动消失（浮层，不占布局）。
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setResult(null), 3000)
    return () => window.clearTimeout(t)
  }, [result])

  if (!asset) return null

  // 当前账号能作为"目标"的项目
  const projectsForDirect = world.projects.filter((p) => canDirectReuse(user, p))
  const projectsForReuse = world.projects.filter((p) => canReuseFromTeam(user, p))

  // 「其他」类目（创作留存物）走精简模式：无候选池/音色/提示词、不向上流转、删除即直删。
  const isOther = asset.category === 'other'
  const otherMedia = isOther ? ((asset.fields.media as 'image' | 'video' | 'text' | undefined) ?? 'image') : null
  const isCharacter = asset.category === 'character'
  const canEditVoice = isCharacter && asset.scope !== 'plaza' && !isAdmin(user)
  const canRegen = canRegenerate(user, asset)

  const coverImg = coverOf(asset)
  const candidates = asset.candidates ?? []
  const isEmpty = asset.status === 'empty'
  const referenceImages = asset.referenceImages ?? []
  const referenceLabels = asset.referenceLabels ?? []
  // 候选池是项目层特有的生产过程留存物（规则 14）：团队库 / 广场只展示定稿，右栏不出。
  const hasCandidatePool = asset.scope === 'project' && !isOther
  // 参考图选择器（从素材库添加）需要项目上下文：空壳/造型都在项目层，取它所在项目。
  const refProject = asset.scope === 'project' ? world.projects.find((p) => p.id === asset.scopeId) : undefined

  const canRemovePlaza = canRemovePlazaAsset(user, asset)
  const canDeleteLib = canDeleteLibraryAsset(user, asset)
  // 「其他」留存物中栏删除入口：广场（下架-删投稿）/ 团队·项目库有图可删。
  const showCoverTrash = isEmpty || canRemovePlaza || (canDeleteLib && !!coverImg)

  const master = asset.masterId ? world.assets.find((a) => a.id === asset.masterId) : undefined
  const referencedFrom = asset.referencedFrom ? world.assets.find((a) => a.id === asset.referencedFrom) : undefined

  // 执行一个动作后：记录结果、收起选择面板
  function done(r: ActionResult) {
    setResult(r)
    setPicker(null)
  }

  function deleteWholeAsset() {
    const r = asset!.scope === 'plaza' ? runRemovePlaza(asset!.id) : runDeleteAsset(asset!.id)
    setResult(r)
    if (r.ok) onClose?.()
  }

  /** 定稿大图垃圾桶的统一入口（3.5）：按当前态分流。 */
  function deleteCoverImage() {
    if (isEmpty) return deleteWholeAsset() // 空壳整删，无需确认
    if (isOther) return setConfirmKind('whole') // 「其他」是成品留存物，删就是删
    if (canRemovePlaza) return setConfirmKind('whole') // 广场下架/删投稿
    // 池里还有别的图 → 交给 removeCandidate 处理（它会顶一张上来或降级空壳）。
    // 待定稿态 cover === ''，找不到定稿时兜底删第一张，别错走归零分流。
    if (candidates.length > 1) {
      const target = (asset!.cover && candidates.find((c) => c.url === asset!.cover)) || candidates[0]
      return setResult(runRemoveCandidate(asset!.id, target.id))
    }
    // 最后一张 → 归零分流：团队删整份，项目仅清空图片。
    if (asset!.scope === 'team') setConfirmKind('whole')
    else if (asset!.scope === 'project') setConfirmKind('clear')
  }

  /** 候选池里的某张删除：非最后一张直接删；恰是最后一张则走归零分流。 */
  function deleteCandidate(candidateId: string) {
    if (candidates.length <= 1) return deleteCoverImage()
    setResult(runRemoveCandidate(asset!.id, candidateId))
  }

  function runConfirmedDelete() {
    if (confirmKind === 'whole') deleteWholeAsset()
    else if (confirmKind === 'clear') setResult(clearAssetImages(asset!.id))
    setConfirmKind(null)
  }

  // ─── 结果区面板：派生值 ─────────────────────────────────────────
  // 有生成能力（canRegen）且非「其他」→ 出左栏（提示词 + 参考图 + 参数 + 生成）。
  const hasGenPanel = canRegen && !isOther
  // 弹窗加宽：出左栏 或 出右栏（全部图片）时都用宽版布局。
  const wide = hasGenPanel || hasCandidatePool
  // 定稿是按 url 认的候选；待定稿时 cover 为空 → finalCandId 为 undefined。
  const finalCandId = asset.cover ? candidates.find((c) => c.url === asset.cover)?.id : undefined
  // 中栏预览：优先用户点选的那张 → 定稿 → 池里第一张（待定稿态的默认预览）。
  const centerCand =
    (centerKeptId ? candidates.find((c) => c.id === centerKeptId) : undefined) ||
    (finalCandId ? candidates.find((c) => c.id === finalCandId) : undefined) ||
    candidates[0]
  // ⚠️ 团队库 / 广场资产没有候选池（规则 14），centerCand 恒为 undefined，必须回落到 cover，
  //    否则中栏会渲染空 src 裂图。这是本次最容易踩的一个坑。
  const centerUrl = centerCand?.url ?? coverImg
  const centerIsFinal = centerCand ? centerCand.id === finalCandId : !!coverImg
  // 定稿是项目层的生产概念：团队库 / 广场里每一张都已经是定稿，标了等于没标。
  const showFinalBadge = asset.scope === 'project'
  // 当前预览的这张，是不是已经在参考图里了。
  // ⚠️ 必须按 baseUrl 比：候选池的 url 带 ?g=N 去重后缀，参考图存的是不带后缀的裸地址
  //    （见 seed.ts 里素模的 cover 与 referenceImages），裸字符串比较永远不相等。
  const isCenterInRefs = !!centerCand && referenceImages.some((u) => baseUrl(u) === baseUrl(centerCand.url))

  /** 生成：先进「生成中」骨架态，1.2s 后把 genCount 张直接并入候选池，并自动预览第一张。 */
  function doGenerate() {
    if (!canRegen || generating !== null) return
    if (!promptDraft.trim()) {
      setResult({ ok: false, message: '先写提示词再生成' })
      return
    }
    if (promptDraft !== (asset!.prompt ?? '')) setPrompt(asset!.id, promptDraft)
    setGenerating(genCount)
    const src = genSourceOf(asset!)
    const urls = Array.from({ length: genCount }, (_, i) => `${src}?g=${Date.now()}${i}`)
    window.setTimeout(() => {
      const r = appendCandidates(asset!.id, urls)
      setGenerating(null)
      setResult(r.ok ? { ok: true, message: `${r.message} · 消耗 ${genCount * COST_PER_IMAGE} 星钻` } : r)
      // 生成完自动预览本批第一张——否则用户点了生成，中栏还停在旧定稿上，像什么都没发生。
      // 已有定稿的资产同样要跳过去看新图（用户刚花了星钻，第一诉求就是看结果）。
      if (r.ok) {
        const fresh = useStore.getState().world.assets.find((a) => a.id === asset!.id)
        const firstNew = fresh?.candidates?.[(fresh.candidates?.length ?? 0) - urls.length]
        if (firstNew) setCenterKeptId(firstNew.id)
      }
    }, 1200)
  }

  /**
   * 上传本地图片作为这份资产的图（不是参考图）：并入候选池，进待定稿等用户拍板。
   * 传 allowAutoFinal=false——上传是用户主动放进来的探索行为，即便是第一张也不代他定稿。
   */
  function uploadLocalImage(file: File | null) {
    if (!file) return
    const url = URL.createObjectURL(file)
    const r = appendCandidates(asset!.id, [url], false)
    setResult(r.ok ? { ok: true, message: '已上传，挑一张点「设为定稿」' } : r)
  }

  /**
   * 把当前预览的这张图加进 / 移出这份资产自己的参考图（0808）。
   * 标签直接写资产名（规则 20：参考图标签写它的真名），与种子里素模的口径一致。
   * 存进去的 url 统一去掉 ?g=N 后缀，跟 referenceImages 的既有格式对齐——
   * 否则同一张图会以两个字符串身份存在，判重和「已是参考图」都会失灵。
   */
  function toggleAsReference(cand: { url: string }) {
    const key = baseUrl(cand.url)
    const i = referenceImages.findIndex((u) => baseUrl(u) === key)
    if (i >= 0) {
      setResult(removeReferenceImage(asset!.id, i))
      return
    }
    setResult(addReferenceImages(asset!.id, [{ url: key, label: asset!.name }]))
  }

  /** 参考图选择器：确定从素材库选的图 → 并入 referenceImages（标签写被选资产的真名 · 规则 20）。 */
  function confirmRefPick(pickedItems: PickedRef[]) {
    if (pickedItems.length === 0) return setRefPicker(null)
    const items = pickedItems.map((p) => ({ url: p.cover, label: p.name }))
    setResult(addReferenceImages(asset!.id, items, pickedItems[0].assetId))
    setRefPicker(null)
  }

  /** 参考图选择器：上传本地临时参考图（纯前端占位，刷新即失）。 */
  function uploadTempRef(file: File | null) {
    if (!file) return
    const url = URL.createObjectURL(file)
    setResult(addReferenceImages(asset!.id, [{ url, label: '临时' }]))
    setRefPicker(null)
  }

  function renderDeleteConfirm() {
    if (!confirmKind) return null
    const isWhole = confirmKind === 'whole'
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setConfirmKind(null)} />
        <div className={styles.confirmCard}>
          <div className={`${styles.confirmIcon} ${isWhole ? styles.confirmIconDanger : styles.confirmIconAccent}`}>
            {isWhole ? <TrashIcon /> : <RegenIcon />}
          </div>
          <h4 className={styles.confirmTitle}>{isWhole ? '删除整个资产？' : '清空全部图片？'}</h4>
          <p className={styles.confirmBody}>
            {isOther
              ? '「其他」是存进来的创作留存物，删除后将直接从项目库移除，无法恢复。'
              : isWhole
                ? '这是该资产的最后一张图片，继续将删除整个资产，提示词会一并删除，且无法恢复。'
                : '图片将清空，提示词会保留，你可以随时重新生成。'}
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.btnGhost} onClick={() => setConfirmKind(null)}>取消</button>
            <button
              className={`${styles.btn} ${isWhole ? styles.btnDanger : styles.btnPri}`}
              onClick={runConfirmedDelete}
            >
              {isWhole ? '删除资产' : '清空图片'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /** 参考图选择器（0804 · 改动三）：二选一菜单 + 从素材库多选 / 上传临时参考。 */
  function renderRefPicker() {
    if (!refPicker) return null
    if (refPicker === 'library') {
      return (
        <div className={styles.refPickRoot}>
          <div className={styles.sscrim} onClick={() => setRefPicker(null)} />
          <div className={styles.refPickPanel}>
            <CanvasAssetPanel
              pid={asset!.scopeId ?? ''}
              projectName={refProject?.name ?? '当前项目'}
              mode="pick"
              onUse={() => {}}
              onPick={confirmRefPick}
              onClose={() => setRefPicker(null)}
            />
          </div>
        </div>
      )
    }
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setRefPicker(null)} />
        <div className={styles.msub}>
          <h4 className={styles.subH}>添加参考图</h4>
          <div className={styles.refChoices}>
            <button className={styles.refChoice} onClick={() => setRefPicker('library')}>
              <b>从素材库添加</b>
              <span>选一张已有资产的定稿图作为参考</span>
            </button>
            <label className={styles.refChoice} title="本地预览，接后端后落对象存储">
              <b>上传临时参考</b>
              <span>从本地选图，仅本次生成使用</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadTempRef(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className={styles.inlActions}>
            <button className={styles.btnGhost} onClick={() => setRefPicker(null)}>取消</button>
          </div>
        </div>
      </div>
    )
  }

  /** 音色块（角色专用）：中栏定稿下方展示，读写权限由 canEditVoice 决定。 */
  function renderVoice() {
    return (
      <div className={styles.voiceWrap}>
        <div className={styles.lbl}>音色</div>
        {asset!.voice ? (
          <div className={styles.vbar}>
            <div className={styles.vi}><MicIcon /></div>
            <div className={styles.vmeta}>
              <div className={styles.vn}>
                {asset!.voice.name}
                {asset!.voice.gender && <span className={styles.gtag}>{asset!.voice.gender}</span>}
              </div>
              {asset!.voice.type === 'cloned' && <div className={styles.vsub}>复刻 · 接模型后生效</div>}
            </div>
            <PlayButton src={asset!.voice.previewUrl} label="" />
            {canEditVoice && (
              <>
                <button className={styles.vset} onClick={() => { setVoiceTab('preset'); setPicker('voice') }}>更换</button>
                <button className={styles.vset} onClick={() => clearVoice(asset!.id)}>清除</button>
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
        {asset!.voice?.type === 'cloned' && !asset!.voice.providerVoiceId && (
          <p className={styles.note}>复刻音色将在接入语音模型后生效（当前为上传原音试听）。</p>
        )}
      </div>
    )
  }

  function openPicker(mode: Exclude<PickerMode, null>) {
    setIncludeVoice(true)
    setPicker(mode)
  }

  function openPrompt() {
    setCopied(false)
    setPromptDraft(asset!.prompt ?? '')
    setPromptOpen(true)
  }

  /** 库页提示词子面板：查看 / 复制；有权限（canRegenerate）时可就地编辑并保存。 */
  function renderPromptPanel() {
    if (!promptOpen) return null
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setPromptOpen(false)} />
        <div className={styles.msub}>
          <h4 className={styles.subH}>提示词</h4>
          {canRegen ? (
            <>
              <textarea className={styles.promptEdit} rows={7} value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} />
              <div className={styles.inlActions}>
                <button
                  className={`${styles.btn} ${styles.btnPri}`}
                  onClick={() => { setResult(setPrompt(asset!.id, promptDraft)); setPromptOpen(false) }}
                >
                  保存
                </button>
                <button className={styles.btnGhost} onClick={() => setPromptOpen(false)}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.promptBox}>{asset!.prompt || '（暂无提示词）'}</div>
              <div className={styles.inlActions}>
                <button
                  className={`${styles.btn} ${styles.btnPri}`}
                  disabled={!asset!.prompt}
                  onClick={() => { navigator.clipboard?.writeText(asset!.prompt ?? ''); setCopied(true) }}
                >
                  {copied ? '已复制 ✓' : '复制'}
                </button>
                <button className={styles.btnGhost} onClick={() => setPromptOpen(false)}>关闭</button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  /** 画布提示词子面板：只查看 / 复制 / 「添加到画布」（落一个文本节点）。 */
  function renderCanvasPromptPanel() {
    if (!promptOpen) return null
    const text = asset!.prompt ?? ''
    const nodeName = `${asset!.name}·提示词`
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setPromptOpen(false)} />
        <div className={styles.msub}>
          <h4 className={styles.subH}>提示词</h4>
          <div className={styles.promptBox}>{text || '（暂无提示词）'}</div>
          <div className={styles.inlActions}>
            <button
              className={`${styles.btn} ${styles.btnPri}`}
              disabled={!text}
              onClick={() => { navigator.clipboard?.writeText(text); setCopied(true) }}
            >
              {copied ? '已复制 ✓' : '复制'}
            </button>
            <button
              className={styles.btn}
              disabled={!text}
              onClick={() => { onUse?.({ text: { content: text, name: nodeName } }); setPromptOpen(false) }}
            >
              ＋ 添加到画布
            </button>
            <button className={styles.btnGhost} onClick={() => setPromptOpen(false)}>关闭</button>
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

  // ── 头部流转动作按钮（scope + 权限判断；0803 起不再有造型勾选面板，直接执行）──
  function headActions() {
    if (isAdmin(user)) return null
    return (
      <>
        {asset!.scope === 'plaza' && (
          <>
            <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('directReuse')}>直接复用到项目</button>
            {canFavorite(user) && (
              <button className={styles.btn} onClick={() => done(runFavorite(asset!.id))}>收藏进团队库</button>
            )}
          </>
        )}
        {asset!.scope === 'team' && (
          <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('reuse')}>复用到项目</button>
        )}
        {/* 存入团队库：直接执行（0803 不再勾选造型）。同名先挡。「其他」不参与流转。 */}
        {asset!.scope === 'project' && !isOther && (
          <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => done(runDeposit(asset!.id))}>
            存入团队库
          </button>
        )}
        {/* 贡献到广场（scope-aware）：直接执行。「其他」不参与流转。 */}
        {(asset!.scope === 'team' || asset!.scope === 'project') && !isOther && canContributeToPlaza(user, asset!) && (
          <button className={styles.btn} onClick={() => done(runContribute(asset!.id))}>
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
          <p className={styles.subD}>选一个项目（拷一份独立副本，只带定稿图）：</p>
          <ProjectChips
            projects={projectsForDirect}
            onPick={(pid) => done(runDirectReuse(asset!.id, pid, includeVoice))}
          />
        </>
      )
    } else if (picker === 'reuse') {
      inner = (
        <>
          <h4 className={styles.subH}>复用到项目</h4>
          <p className={styles.subD}>选一个项目（拷一份独立副本，只带定稿图）：</p>
          <ProjectChips projects={projectsForReuse} onPick={(pid) => done(runReuse(asset!.id, pid))} />
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
                      previewUrl: url,
                      sampleUrl: url,
                      providerVoiceId: undefined,
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

  // ═══ 画布场景（onUse）：定稿 + 候选池，挑一张图用到画布。 ═══
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
          {/* 定稿（左）+ 音色（右）并排 */}
          <div className={styles.anchorWrap}>
            <div className={styles.secTag}><span className={styles.secDot} />定稿</div>
            <div className={styles.anchorRow}>
              <div className={styles.sumo}>
                <div className={styles.sumoPic}>
                  {isEmpty ? (
                    <div className={styles.emptyBig}><PlaceholderIcon /><span>待生成</span></div>
                  ) : (
                    <img src={coverImg} alt={asset.name} />
                  )}
                  {!isEmpty && (
                    <div className={styles.thumbIcons}>
                      <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: coverImg, name: '定稿' })}><ZoomIcon /></button>
                      <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(coverImg, `${asset.name}·定稿`)}><DownloadIcon /></button>
                    </div>
                  )}
                  {!isEmpty && (
                    <div className={styles.sumoOvC}>
                      <button className={styles.lookUse} onClick={() => onUse({ cover: coverImg })}>使用</button>
                      {canViewPrompt(asset) && (
                        <button className={styles.sumoPrompt} onClick={openPrompt}>提示词</button>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.sumoCap}><b>定稿</b></div>
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
                      <div className={styles.voiceTop}>
                        <div className={`${styles.voiceIco} ${styles.voiceIcoOff}`}><MicOffIcon /></div>
                        <div className={styles.voiceMeta}>
                          <div className={styles.voiceNameOff}>音色 · 未设置</div>
                          <div className={styles.voiceTag}>这个角色还没有声音</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 全部图片：挑一张用到画布（规则 14：只有项目层资产有候选池；团队库 / 广场只给定稿 → 使用）。 */}
          {hasCandidatePool && (
          <div className={styles.looksHead}>
            <div className={styles.looksHeadT}>全部图片（{candidates.length}）</div>
          </div>
          )}
          {hasCandidatePool && candidates.length > 0 && (
            <div className={styles.looksGrid}>
              {candidates.map((c) => (
                <div key={c.id} className={styles.lookCard}>
                  <div className={styles.lookPic}>
                    <img src={c.url} alt={asset.name} loading="lazy" />
                    <div className={styles.thumbIcons}>
                      <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: c.url, name: '候选图' })}><ZoomIcon /></button>
                      <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(c.url, `${asset.name}·候选`)}><DownloadIcon /></button>
                    </div>
                    <div className={styles.lookOvC}>
                      <button className={styles.lookUse} onClick={() => onUse({ cover: c.url })}>使用</button>
                    </div>
                    {showFinalBadge && c.id === finalCandId && <span className={styles.finalBadgeSm}>★ 定稿</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {renderPicker()}
        {renderCanvasPromptPanel()}
        {renderLightbox()}
      </div>
    )
  }

  return (
    <div className={styles.mroot}>
      <div className={styles.mscrim} onClick={onClose} />
      <div className={`${styles.modal} ${wide ? styles.modal3 : ''}`}>
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
                  {/* 广场是源头，不展示"我从哪来"（血缘 / 参考自）——规则 14。 */}
                  {asset.scope !== 'plaza' && asset.masterId && (
                    <span className={`${styles.chip} ${styles.chipCopy}`}>副本 · 源自「{master?.name ?? '母版'}」</span>
                  )}
                  {asset.scope !== 'plaza' && referencedFrom && (
                    <span className={styles.chip}>参考自「{referencedFrom.name}」</span>
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

        {/* ── 主体：左（提示词 + 参考图 + 参数 + 计价/生成）｜中（本批结果区 / 定稿大图）｜右（已保留）── */}
        <div className={`${styles.mbody} ${wide ? styles.mbody3 : ''}`}>

          {/* ═══ 左栏：生成面板（有生成能力才出）═══ */}
          {hasGenPanel && (
            <div className={styles.genLeft}>
              <div className={`${styles.gfield} ${styles.gfieldGrow}`}>
                <div className={styles.flabel}>提示词 <span className={styles.req}>*</span></div>
                <textarea
                  className={styles.genPrompt}
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  onBlur={() => { if (promptDraft !== (asset.prompt ?? '')) setResult(setPrompt(asset.id, promptDraft)) }}
                  placeholder="描述你想要的画面…"
                />
              </div>

              <div className={styles.gfield}>
                <div className={styles.flabel}>参考图</div>
                <div className={styles.refRow}>
                  {referenceImages.map((src, i) => (
                    <div key={i} className={styles.refItem}>
                      <div className={styles.refSlot}>
                        <img src={src} alt="参考图" loading="lazy" />
                        <button className={styles.refZoom} title="放大查看" onClick={() => setPreview({ src, name: referenceLabels[i] || '参考图' })}><ZoomIcon /></button>
                        <button className={styles.refRemove} title="移除参考图" onClick={() => setResult(removeReferenceImage(asset.id, i))}>✕</button>
                      </div>
                      {referenceLabels[i] && <span className={styles.refLabel}>{referenceLabels[i]}</span>}
                    </div>
                  ))}
                  <button className={styles.refAdd} onClick={() => setRefPicker('menu')} title="从素材库添加 / 上传临时参考">
                    <span className={styles.refPlus}>＋</span>
                    <span>添加参考图</span>
                  </button>
                </div>
              </div>

              {/* 生成参数：4 个下拉压成紧凑一行，给上方提示词让出空间。 */}
              <div className={styles.paramGrid}>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>生成比例</span>
                  <select className={styles.sel} defaultValue={RATIO_OPTS[0]}>{RATIO_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>生成数量</span>
                  <select className={styles.sel} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))}>
                    {COUNT_OPTS.map((o) => <option key={o} value={o}>{o} 张</option>)}
                  </select>
                </label>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>图片清晰度</span>
                  <select className={styles.sel} defaultValue={QUALITY_OPTS[0]}>{QUALITY_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>模型</span>
                  <select className={styles.sel} defaultValue={MODEL_OPTS[0]}>{MODEL_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
              </div>

              {/* 底部一行：预计消耗星钻 + 生成 */}
              <div className={styles.genFoot}>
                <span className={styles.costHint}>预计消耗 <b>{genCount * COST_PER_IMAGE}</b> 星钻</span>
                <button
                  className={`${styles.genBtn} ${!asset.cover ? styles.genBtnPulse : ''}`}
                  disabled={generating !== null}
                  onClick={doGenerate}
                >
                  {generating !== null ? '生成中…' : '生成'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ 中栏：预览台（生成中骨架 / 空态 / 预览大图）+ 动作 + 音色 ═══ */}
          <div className={styles.genCenter}>
            <div className={styles.stageTitle}>
              {isOther ? OTHER_MEDIA_LABEL[otherMedia!] : isEmpty ? '待生成' : '预览'}
            </div>
            <div className={styles.bigframe}>
              {isOther ? (
                otherMedia === 'text' ? (
                  <div className={styles.otherTextBig}>{(asset.fields.text as string) || '（暂无正文）'}</div>
                ) : (
                  <div className={styles.bigMediaWrap}>
                    <img src={coverImg} alt={asset.name} />
                    {otherMedia === 'video' && (
                      <div className={styles.videoPlayBig} title="视频播放器占位（本期不接真实播放）" aria-hidden>▶</div>
                    )}
                  </div>
                )
              ) : generating !== null ? (
                /* 生成中骨架态：中栏旋转圈 + 一行说明（右栏同步出流光骨架格）。 */
                <div className={styles.genLoading}>
                  <div className={styles.genSpinner} />
                  <span>正在生成 {generating} 张…</span>
                </div>
              ) : isEmpty ? (
                /* 空态（改动三）：大片留白 + 一行灰字 + 上传本地图片，不放占位方框。 */
                <div className={styles.emptyResult}>
                  <span className={styles.emptyResultText}>{EMPTY_HINT_BY_CATEGORY[asset.category] || '你的图将会在这里展示'}</span>
                  {canRegen && (
                    <label className={styles.emptyUpload}>
                      上传本地图片
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadLocalImage(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </div>
              ) : (
                <div className={styles.bigImgWrap}>
                  <img src={centerUrl} alt={asset.name} />

                  {/* 定稿徽章：半透明黑底 + 青绿字。待定稿态显示灰底「待定稿」。只在项目库出（规则 25）。 */}
                  {showFinalBadge && (centerIsFinal
                    ? <span className={styles.finalBadge}>★ 定稿</span>
                    : !asset.cover && <span className={styles.pendingBadge}>待定稿</span>)}

                  {/* 图片自身的操作一律 hover 浮在图上（规则 17）。 */}
                  <div className={styles.thumbIcons}>
                    <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: centerUrl, name: asset.name })}><ZoomIcon /></button>
                    <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(centerUrl, asset.name)}><DownloadIcon /></button>
                    {/* 删除（规则 18 改写）：项目库删的是"预览的这一张候选"；团队库 / 广场没有候选池，
                        沿用原来的整份删除 / 下架路径（deleteCoverImage 内部按层分流）。 */}
                    {centerCand
                      ? canDeleteLib && (
                          <button className={styles.thumbBtn} title="删除这张" onClick={() => deleteCandidate(centerCand.id)}><TrashIcon /></button>
                        )
                      : (canRemovePlaza || (asset.scope === 'team' && canDeleteLib && !!coverImg)) && (
                          <button className={styles.thumbBtn} title={canRemovePlaza ? '下架 / 删除' : '删除资产'} onClick={deleteCoverImage}><TrashIcon /></button>
                        )}
                  </div>
                </div>
              )}
              {/* 只读态（无左栏生成面板）才在大图上给提示词入口。 */}
              {!hasGenPanel && !isEmpty && !isOther && canViewPrompt(asset) && (
                <button className={styles.promptBadge} title="查看提示词" onClick={openPrompt}>
                  <PromptIcon />
                </button>
              )}
            </div>

            {/* ── 预览动作条（0808）：改变资产状态的动作用实体按钮（规则 17）── */}
            {!isOther && !isEmpty && centerCand && canRegen && (
              <div className={styles.previewActs}>
                <button
                  className={styles.pvBtn}
                  onClick={() => toggleAsReference(centerCand)}
                >
                  {isCenterInRefs ? '✓ 已是参考图' : '＋ 添加至参考图'}
                </button>
                {centerIsFinal ? (
                  <button className={styles.pvBtn} onClick={() => setResult(runUnsetFinal(asset.id))}>
                    取消定稿
                  </button>
                ) : (
                  <button
                    className={`${styles.pvBtn} ${styles.pvBtnPri}`}
                    onClick={() => setResult(runSetFinal(asset.id, centerCand.id))}
                  >
                    ★ 设为定稿
                  </button>
                )}
              </div>
            )}

            {/* 「其他」留存物删除入口（预览台的成品删除都收在大图 hover 里，这里只剩「其他」）。 */}
            {isOther && showCoverTrash && (
              <div className={styles.centerActs}>
                <button className={`${styles.btn} ${styles.btnDangerGhost}`} onClick={deleteCoverImage}>删除该留存物</button>
              </div>
            )}

            {/* 音色（角色专用）：中栏最底部常驻（规则 4b）。 */}
            {isCharacter && renderVoice()}

            {/* 「其他」留存物说明 */}
            {isOther && (
              <p className={styles.secD}>
                「其他」是创作过程的留存物（分镜 / 视频片段 / 台词）：仅存在于本项目、可随时拖回画布，
                不存入团队库、不贡献到广场。
              </p>
            )}

            {/* 治理提示。结果提示已改成弹窗顶部的浮层 toast——
                原来挂在这里（音色块下方），每出一次提示就把中栏顶一次，布局一直在跳。 */}
            {isAdmin(user) && asset.scope !== 'plaza' && (
              <div className={styles.mfoot}>
                <p className={styles.note}>管理员只治理，不参与创作与流转。</p>
              </div>
            )}
          </div>

          {/* ═══ 右栏：全部图片（候选池只属于项目层 · 规则 14）═══ */}
          {hasCandidatePool && (
            <div className={styles.genRight}>
              <div className={styles.rsecHead}>
                <div className={styles.rsecT}>全部图片 <b>（{candidates.length}）</b></div>
                {canRegen && (
                  <label className={styles.rUpload} title="从本地上传一张图，直接进这份资产">
                    ＋ 上传
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadLocalImage(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>
              {/* 生成中：右栏铺 genCount 个流光骨架格，与中栏骨架同步。 */}
              {generating !== null ? (
                <div className={styles.thumbsGrid}>
                  {Array.from({ length: generating }, (_, i) => (
                    <div key={i} className={styles.thumbSkeleton} />
                  ))}
                </div>
              ) : candidates.length > 0 ? (
                <div className={styles.thumbsGrid}>
                  {candidates.map((c) => {
                    const isFinal = c.id === finalCandId
                    const isCur = centerCand?.id === c.id
                    return (
                      <div
                        key={c.id}
                        className={`${styles.look} ${isCur ? styles.thumbCurrent : ''}`}
                        onClick={() => setCenterKeptId(c.id)}
                      >
                        <img src={c.url} alt={asset.name} loading="lazy" />
                        {showFinalBadge && isFinal && <span className={styles.finalBadgeSm}>★ 定稿</span>}
                        {canDeleteLib && (
                          <button type="button" className={styles.cardDelete} title="删除这张图片" onClick={(e) => { e.stopPropagation(); deleteCandidate(c.id) }}>
                            <TrashIcon />
                          </button>
                        )}
                        {canRegen && !isFinal && (
                          <div className={styles.lookOv}>
                            <button className={styles.tbtn} onClick={(e) => { e.stopPropagation(); setResult(runSetFinal(asset.id, c.id)) }}>设为定稿</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.rempty}>生成，或从本地上传一张</div>
              )}
            </div>
          )}
        </div>

        {/* 结果提示：浮在弹窗顶部，不占布局、3 秒自动消失。 */}
        {result && (
          <div className={`${styles.toast} ${result.ok ? styles.toastOk : styles.toastErr}`}>
            {result.message}
          </div>
        )}

        {renderPicker()}
        {renderPromptPanel()}
        {renderDeleteConfirm()}
        {renderRefPicker()}
      </div>
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
