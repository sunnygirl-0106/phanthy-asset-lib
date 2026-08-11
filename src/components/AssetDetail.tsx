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

import { useEffect, useRef, useState } from 'react'
import type { Asset, AssetRef, AssetSnapshot, Category, Voice, Scope } from '../data/types'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { canDirectReuse, canFavorite, canReuseFromTeam, canRemovePlazaAsset, canDeleteLibraryAsset, canViewPrompt, canRegenerate, canContributeToPlaza, isAdmin } from '../services/permission'
import { coverOf, resolveRefs, pendingRefs as pendingRefsOf, usableRefUrls } from '../services/assetService'
import { COST_PER_IMAGE } from '../data/pricing'
import { PRESET_VOICES } from '../data/presetVoices'
import { CanvasAssetPanel, type PickedRef } from './canvas/CanvasAssetPanel'
import { AssetSaveModal, type SaveIntent } from './AssetSaveModal'
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
/** 「其他」媒介文案（详情大图 cap / 徽章共用）。 */
const OTHER_MEDIA_LABEL: Record<'image' | 'video' | 'text', string> = { image: '图片', video: '视频', text: '文本' }
/** Demo 无生图后端：生成 / 恢复空壳时先落这张占位图，接模型后换真图。 */
const IMG_PLACEHOLDER = assetUrl('assets/canvas/image-placeholder.svg')

/** 去掉 ?g=N 后缀，拿到图片本体地址。 */
function baseUrl(u: string): string { return u.split('?')[0] }

/* 本地上传的校验口径（0814 · PRD #6）——三个数写在一处，界面文案与校验读同一份，
   免得副文案写着 20 张、代码里拦 10 张这种经典对不上。 */
const UPLOAD_ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
const UPLOAD_ACCEPT_LABEL = 'png、jpg、webp'
const UPLOAD_MAX_COUNT = 20
const UPLOAD_MAX_MB = 20
const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024
/** 生成图来源（0812）：定稿 → 真实参考图（就位的槽）→ 造型成品图替身（lookUrl，演示脚手架）→ 通用占位图。 */
function genSourceOf(a: { cover: string; fields?: { lookUrl?: unknown } }, usableRef?: string): string {
  const look = typeof a.fields?.lookUrl === 'string' ? a.fields.lookUrl : undefined
  return baseUrl(a.cover || usableRef || look || IMG_PLACEHOLDER)
}

/** 生成参数选项（纯展示，对齐现有产品「一键生成」弹窗；仅数量驱动张数）。 */
const RATIO_OPTS = ['3 : 4', '1 : 1', '9 : 16', '16 : 9']
const COUNT_OPTS = [4, 1, 2, 6]
const QUALITY_OPTS = ['2K', '1K', '4K']
const MODEL_OPTS = ['phan nano Image 3', 'phan nano Image 2 Pro', 'Seedream 3.0']

/* ═══ 未保存改动追踪（定义层 vs 素材层）══════════════════════════════════
 * 详情页把一份资产上的字段分成两层，语义完全不同：
 *   · 素材层 —— candidates（本次生成 / 上传 / 从库添加的图）。花星钻换来的产出物，
 *     进来即落库、永远保留，不受「保存」管辖，退出也不提示。
 *   · 定义层 —— 下面 snapshotOf 收窄的这几个字段（名称 / 提示词 / 定稿 / 参考图 / 音色），
 *     回答「这份资产对外是什么」，会被画布节点引用、被同项目的人看到，需用户显式保存。
 * 生成参数（比例 / 数量 / 质量 / 模型）是纯本地 UI 态、压根没进 store，不计入未保存改动。
 *
 * 【0814 · 生成即保存】点「生成」= 对定义层做一次完整保存，等价于点了「保存」：
 * 名称 / 提示词 / 定稿 / 参考图 / 音色全部接受为新基线，退出不再回滚。
 * 理由是数据一致性而非体验偏好——图一旦生成就已入库、已扣星钻，是既成事实；
 * 若此时定义层被退出回滚，库里就会留下一张"配方对不上"的图，重新生成还会出另一个东西。
 * 生成之后再改的，照旧走右上角「N 处改动未保存」那条路。
 *
 * 「有没有未保存改动」不再靠一个布尔 dirty 猜，而是把当前定义层字段和进入详情时的
 * 快照逐条 diff——哪几条不一样就列哪几条，逐项可还原（见 store.revertAssetFields）。 */
function snapshotOf(a: Asset): AssetSnapshot {
  return {
    name: a.name,
    prompt: a.prompt,
    cover: a.cover ?? '',
    references: a.references,
    selfRefOff: a.selfRefOff,
    voice: a.voice,
  }
}
const refsEqual = (x?: AssetRef[], y?: AssetRef[]) => JSON.stringify(x ?? []) === JSON.stringify(y ?? [])
const voiceEqual = (x?: Voice, y?: Voice) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null)

// 弹出的"目标选择"面板处于哪种模式
type PickerMode = 'directReuse' | 'reuse' | 'favorite' | 'voice' | null

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

/** 分享入口图标（三点连线）。 */
function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11.8" cy="3.6" r="1.9" />
      <circle cx="4.2" cy="8" r="1.9" />
      <circle cx="11.8" cy="12.4" r="1.9" />
      <path d="M10.1 4.6L5.9 7M5.9 9l4.2 2.4" />
    </svg>
  )
}

/** 存入团队库（文件夹）。 */
function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.9 4.6h4L7.1 6.3H14.1v7.1H1.9z" />
      <path d="M1.9 4.6V2.9h3.3" />
    </svg>
  )
}

/** 贡献到素材广场（上传）。 */
function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 11V2.6" />
      <path d="M5.1 5.5L8 2.6l2.9 2.9" />
      <path d="M2.6 9.8v2.8c0 .5.4.9.9.9h9c.5 0 .9-.4.9-.9V9.8" />
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
  const runSendImage = useStore((s) => s.runSendImage)
  const runRemovePlaza = useStore((s) => s.runRemovePlaza)
  const runDeleteAsset = useStore((s) => s.runDeleteAsset)
  const runRemoveCandidate = useStore((s) => s.runRemoveCandidate)
  const runSetFinal = useStore((s) => s.runSetFinal)
  const appendCandidates = useStore((s) => s.appendCandidates)
  const setPrompt = useStore((s) => s.setPrompt)
  const setSelfRef = useStore((s) => s.setSelfRef)
  const removeRef = useStore((s) => s.removeRef)
  const addImageRefs = useStore((s) => s.addImageRefs)
  const clearAssetImages = useStore((s) => s.clearAssetImages)
  const renameAsset = useStore((s) => s.renameAsset)
  const setVoice = useStore((s) => s.setVoice)
  const clearVoice = useStore((s) => s.clearVoice)
  const revertAssetFields = useStore((s) => s.revertAssetFields)

  // 从 world 里取最新的这份资产（改名后能立即反映）
  const asset = world.assets.find((a) => a.id === assetId)

  const [picker, setPicker] = useState<PickerMode>(null)
  // 删最后一张图的样式化确认弹窗：'whole'=删整份资产（团队/广场/其他），'clear'=清空图片保留提示词（项目）
  const [confirmKind, setConfirmKind] = useState<'whole' | 'clear' | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [renameResult, setRenameResult] = useState<ActionResult | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(asset?.name ?? '')
  // 左栏「资产名称」字段（对齐 Figma）：常驻可编辑，失焦 / 回车即提交，改名失败回滚到原名。
  const [nameField, setNameField] = useState(asset?.name ?? '')
  // 音色设置面板的两条路：挑预置 / 复刻
  const [voiceTab, setVoiceTab] = useState<'preset' | 'clone'>('preset')
  const [includeVoice, setIncludeVoice] = useState(true)
  // 路 B 复刻：临时存用户上传的音源文件 + 命名草稿（本期占位，不接后端）
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  // 提示词子面板：查看 / 编辑定稿提示词
  const [promptOpen, setPromptOpen] = useState(!!openBasePromptOnMount)
  // 提示词全屏「展开」编辑（对齐 mockup ⤢）
  const [promptExpand, setPromptExpand] = useState(false)
  const [promptDraft, setPromptDraft] = useState(asset?.prompt ?? '')
  // 提示词「已保存」闪现标（1.6s 后自动消失）
  const [promptSaved, setPromptSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState<{ src: string; name: string } | null>(null) // 放大查看灯箱

  // ── 阶段二 · 三栏生成面板的本地态 ──────────────────────────────────
  // 生成中（demo 用定时器模拟出图耗时，让演示看得出"在调模型"）。null = 不在生成；值 = 本次生成张数。
  const [generating, setGenerating] = useState<number | null>(null)
  // 中栏预览的是候选池里哪一张。null = 定稿（没有定稿时 = 池里第一张）。
  const [centerKeptId, setCenterKeptId] = useState<string | null>(null)
  // 生成参数（纯展示，仅「生成数量」驱动本次生成的张数）。
  const [genCount, setGenCount] = useState(4)
  // 图像模型（受控）：title 能带全名兜底，也给未来「不同模型不同价」留钩子。
  const [model, setModel] = useState(MODEL_OPTS[0])
  // 参考图选择器（0804）：null=关；'menu'=二选一；'library'=从素材库多选。
  const [refPicker, setRefPicker] = useState<'menu' | 'library' | null>(null)
  // 图片级流转（0810）：选中一张图送出 → 打开统一上传弹窗（只出一层）。
  const [sendImg, setSendImg] = useState<{ url: string; scope: 'team' | 'plaza' } | null>(null)
  // 图片列表加号（0810）：null=关；'menu'=从素材库/本地二选一；'library'=从素材库挑图。
  const [addPicker, setAddPicker] = useState<'menu' | 'library' | null>(null)
  // 参考图第一槽：要不要以当前定稿为底（派生，不入 references）。
  // 【0813】初值 / 切资产时都从资产上的 selfRefOff 读取——已持久化，退出重进保持。
  const [useSelfRef, setUseSelfRef] = useState(asset?.selfRefOff !== true)
  // 生成软拦截二次确认（0812 §8.3）：有 pending 槽时弹一次「这次参考不到这 N 份」。
  const [confirmGen, setConfirmGen] = useState(false)
  // 最新的「请求关闭」逻辑放 ref 里——Esc 处理器闭包不随 hasUnsaved 变，直接读 ref 避免拿到旧值。
  const requestCloseRef = useRef<() => void>(() => {})
  // 预览动作条「分享」下拉（对齐设计稿）：收纳「存入团队库 / 贡献到素材广场」两个单张流转。
  const [shareOpen, setShareOpen] = useState(false)
  // 进入这份资产时的定义层快照（= 本次会话的「基线」）。改动明细 = 当前定义层 vs 这份快照。
  // 用 ref 在渲染中按 assetId 同步捕获：切资产的那一帧就换好基线，不闪错误的改动数。
  const baselineRef = useRef<{ id: string; snap: AssetSnapshot; imgs: number } | null>(null)
  // 头部「未保存」气泡（悬停展开改动明细）是否打开。
  const [dirtyOpen, setDirtyOpen] = useState(false)
  // markDirty 保留为空实现：改动检测已改为「当前定义层 vs 基线快照」逐条 diff，
  // 定义层动作本身即时写 store、diff 能查到；参数 / 素材层调它则被正确地无视。留着免动十几处调用点。
  const markDirty = () => {}

  // Esc：先收子面板 / 改名，再关整扇弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (shareOpen) setShareOpen(false)
      else if (sendImg) setSendImg(null)
      else if (confirmGen) setConfirmGen(false)
      else if (addPicker) setAddPicker(null)
      else if (preview) setPreview(null)
      else if (promptExpand) setPromptExpand(false)
      else if (refPicker) setRefPicker(null)
      else if (promptOpen) setPromptOpen(false)
      else if (picker) setPicker(null)
      else if (renaming) setRenaming(false)
      else requestCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareOpen, sendImg, confirmGen, addPicker, preview, promptExpand, refPicker, promptOpen, picker, renaming])

  // 「分享」下拉：点面板外任意处收起（对齐设计稿的 document click 关闭）。
  useEffect(() => {
    if (!shareOpen) return
    const onDown = () => setShareOpen(false)
    // 延到下一帧再挂，避免触发它打开的那次 click 立刻把它关掉。
    const t = window.setTimeout(() => document.addEventListener('click', onDown), 0)
    return () => { window.clearTimeout(t); document.removeEventListener('click', onDown) }
  }, [shareOpen])

  // 切换到另一份资产时，清掉三栏面板的本地态（生成中 / 中栏选中 / 子面板）。
  // 注意：草稿（提示词 / 名称 / 自参考）+ 基线快照改由下方渲染中同步捕获，
  // 免得切资产那一帧「新资产 vs 旧基线」闪一下假的改动数。
  useEffect(() => {
    setGenerating(null)
    setCenterKeptId(null)
    setRefPicker(null)
    setAddPicker(null)
    setShareOpen(false)
    setDirtyOpen(false)
    setPromptExpand(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  // 提示词「已保存」闪现标：1.6s 后自动消失。
  useEffect(() => {
    if (!promptSaved) return
    const t = window.setTimeout(() => setPromptSaved(false), 1600)
    return () => window.clearTimeout(t)
  }, [promptSaved])

  // 结果提示 3 秒自动消失（浮层，不占布局）。
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setResult(null), 3000)
    return () => window.clearTimeout(t)
  }, [result])

  if (!asset) return null

  // 进入 / 切到一份资产时，同步捕获它的定义层基线快照 + 当时的图片张数，并把草稿对齐到它。
  // 在渲染里做（而非 effect）：切资产的这一帧基线和草稿一起换好，diff 不会闪。
  // setState-in-render 用 id 守卫，只在真正换资产时触发一次额外渲染（React 官方「派生上一次渲染」写法）。
  if (baselineRef.current?.id !== asset.id) {
    baselineRef.current = { id: asset.id, snap: snapshotOf(asset), imgs: asset.candidates?.length ?? 0 }
    setPromptDraft(asset.prompt ?? '')
    setNameField(asset.name)
    setUseSelfRef(asset.selfRefOff !== true)
    setPromptSaved(false)
    setDirtyOpen(false)
  }
  const baseline = baselineRef.current.snap

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
  // 参考槽（0812）：references 与 resolved 下标对齐；pendingList = 还没就位的（pending + missing）。
  const references = asset.references ?? []
  const resolved = resolveRefs(world, asset)
  const pendingList = pendingRefsOf(world, asset)
  // 图级槽的裸 url 集合——判「当前预览这张是不是已在参考里」用。
  const imageRefUrls = references
    .filter((r) => r.kind === 'image')
    .map((r) => baseUrl((r as { url: string }).url))
  // 候选池是项目层特有的生产过程留存物（规则 14）：团队库 / 广场只展示定稿，右栏不出。
  const hasCandidatePool = asset.scope === 'project' && !isOther
  // 参考图选择器（从素材库添加）需要项目上下文：空壳/造型都在项目层，取它所在项目。
  const refProject = asset.scope === 'project' ? world.projects.find((p) => p.id === asset.scopeId) : undefined

  const canRemovePlaza = canRemovePlazaAsset(user, asset)
  const canDeleteLib = canDeleteLibraryAsset(user, asset)
  // 「其他」留存物中栏删除入口：广场（下架-删投稿）/ 团队·项目库有图可删。
  const showCoverTrash = isEmpty || canRemovePlaza || (canDeleteLib && !!coverImg)

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
    // 有图必有定稿，正常能按 cover 找到定稿；兜底删第一张，别错走归零分流。
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
  // 定稿是按 url 认的候选；空壳时 cover 为空 → finalCandId 为 undefined。
  const finalCandId = asset.cover ? candidates.find((c) => c.url === asset.cover)?.id : undefined
  // 中栏预览：优先用户点选的那张 → 定稿 → 池里第一张兜底。
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
  // 当前预览的这张，是不是就是"当前定稿"（= 参考图第一槽 selfRef 派生的那张）。
  const isCenterCover = !!centerCand && baseUrl(centerCand.url) === baseUrl(asset.cover ?? '')
  // 当前预览的这张，是不是已经在参考图里了。
  // ⚠️ 必须按 baseUrl 比：候选池的 url 带 ?g=N 去重后缀，图级槽存的是不带后缀的裸地址。
  // 两条路径都算"已是参考图"：① 已写进图级槽；② 它就是当前定稿、且自参考第一槽开着
  //    （素模自己的定稿不入库、由 selfRef 派生成第一槽——只查图级槽会漏判，按钮就一直显示"添加"）。
  const isCenterInRefs =
    !!centerCand &&
    (imageRefUrls.includes(baseUrl(centerCand.url)) || (isCenterCover && useSelfRef))

  // 参考图第一槽（0810）：资产自己的当前定稿，渲染时派生、不写进 references。
  // 定稿一换第一槽自动跟着换（因为是派生的）；关掉只影响本次生成，退出重进恢复。
  const selfRef = asset.cover && useSelfRef ? { url: baseUrl(asset.cover), label: '当前定稿' } : null

  // 提示词是否被改动（用于「保存」时决定要不要落一版提示词）。
  // 提示词是定义层里唯一「不即时写 store」的字段——只在保存 / 生成时才落库，所以拿草稿跟基线比。
  const promptDirty = promptDraft !== (baseline.prompt ?? '')

  /* ── 改动明细：当前定义层逐条 vs 基线，只列真变了的那几条，每条能单独还原。──
   * 单条还原借力 store.revertAssetFields：传一份「当前快照、但这一条换回基线值」的快照，
   * 于是只有这一条被改回去，其余定义层字段和素材层（candidates）纹丝不动。 */
  type DirtyItem = { key: string; label: string; revert: () => void }
  // 传「当前快照 + 只把这一条换回基线」。不动 prompt（它没即时落库，靠草稿），
  // 免得还原音色 / 参考时把没保存的提示词草稿顺手写进库。
  const revertOnly = (patch: Partial<AssetSnapshot>) =>
    setResult(revertAssetFields(asset!.id, { ...snapshotOf(asset!), ...patch }))
  const changes: DirtyItem[] = []
  if (promptDirty) changes.push({ key: 'prompt', label: '提示词改动', revert: () => { setPromptDraft(baseline.prompt ?? ''); revertOnly({ prompt: baseline.prompt }) } })
  if (asset.name !== baseline.name) changes.push({ key: 'name', label: '名称改动', revert: () => { setNameField(baseline.name); revertOnly({ name: baseline.name }) } })
  if (!refsEqual(asset.references, baseline.references) || (asset.selfRefOff ?? false) !== (baseline.selfRefOff ?? false))
    changes.push({ key: 'refs', label: '参考图改动', revert: () => { setUseSelfRef(baseline.selfRefOff !== true); revertOnly({ references: baseline.references, selfRefOff: baseline.selfRefOff }) } })
  // 定稿：空壳进来（基线 cover 为空）时，第一张定稿是本次生成顺带确立的，跟素材层绑在一起，不算「改了定稿」。
  if (baseline.cover && baseUrl(asset.cover ?? '') !== baseUrl(baseline.cover))
    changes.push({ key: 'cover', label: '定稿改动', revert: () => revertOnly({ cover: baseline.cover }) })
  if (!voiceEqual(asset.voice, baseline.voice)) changes.push({ key: 'voice', label: '音色改动', revert: () => revertOnly({ voice: baseline.voice }) })

  const hasUnsaved = changes.length > 0
  // 本次会话新入库的图片张数（素材层）：只用来在气泡里安抚「这些图不会丢」。
  const newImgCount = Math.max(0, (asset.candidates?.length ?? 0) - baselineRef.current.imgs)

  /**
   * 把「当前定义层状态」接受为新基线 = 一次保存。
   * 「保存」按钮和「生成」共用它——这样两条路径不可能对不齐（0814 · 生成即保存）。
   * 读 store 最新值而不是闭包里的 asset：调用前可能刚 setPrompt 过一次。
   */
  function commitBaseline() {
    const fresh = useStore.getState().world.assets.find((a) => a.id === asset!.id) ?? asset!
    baselineRef.current = {
      id: fresh.id,
      snap: { ...snapshotOf(fresh), prompt: promptDraft },
      imgs: fresh.candidates?.length ?? 0,
    }
    setPromptSaved(true)
  }

  /** 点「保存」：接受本次全部定义层改动——提示词落一版、把当前状态定为新基线，并闪现「已保存」。 */
  function commitSave() {
    if (promptDirty) setPrompt(asset!.id, promptDraft)
    commitBaseline()
    setDirtyOpen(false)
  }

  /** 请求关闭：不再弹退出确认弹窗，但离开时照旧丢弃未保存的定义层改动——
   * 直接把定义层还原回基线（candidates 素材层不动），跟顶部「离开会丢弃」提示一致。 */
  function requestClose() {
    if (hasGenPanel && hasUnsaved) revertAssetFields(asset!.id, baseline)
    onClose?.()
  }
  requestCloseRef.current = requestClose

  /**
   * 点「生成」：软拦截（0812 §8.3）。有 pending 槽（上游没出图）时不禁用按钮，
   * 弹一次二次确认（§6.4 第二种），确认后照常生成——参考槽是空的、模型本就拿不到，
   * 这次只是"少参考一张"，不是错误操作。
   */
  function requestGenerate() {
    if (!canRegen || generating !== null) return
    if (!promptDraft.trim()) {
      setResult({ ok: false, message: '先写提示词再生成' })
      return
    }
    if (pendingList.length > 0) { setConfirmGen(true); return }
    doGenerate()
  }

  /** 生成：先进「生成中」骨架态，1.2s 后把 genCount 张直接并入候选池，并自动预览第一张。 */
  function doGenerate() {
    if (!canRegen || generating !== null) return
    if (!promptDraft.trim()) {
      setResult({ ok: false, message: '先写提示词再生成' })
      return
    }
    // 【生成即保存】点生成 = 一次完整保存，不区分字段（0814 口径）。
    // 提示词是定义层里唯一不即时写 store 的字段，先把草稿落库；
    // 其余字段（名称 / 定稿 / 参考图 / 音色）本来就即时写了 store，只是会被退出回滚，
    // 所以这里把基线整份重置成"当前状态"，等于把它们一并接受下来。
    if (promptDraft !== (asset!.prompt ?? '')) setPrompt(asset!.id, promptDraft)
    commitBaseline()
    setGenerating(genCount)
    const src = genSourceOf(asset!, usableRefUrls(world, asset!)[0])
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
   * 上传本地图片作为这份资产的图（不是参考图）：并入图片列表。
   * 0810：资产原本没图时，第一张自动成为定稿（有图必有定稿）。
   * 0814（PRD #6）：支持一次多选，按「格式 → 大小 → 张数」三道校验后汇总一条结果，
   * 不合规的逐条说清为什么被跳过，而不是整批失败或者悄悄少几张。
   */
  function uploadLocalImages(files: FileList | null) {
    if (!files || files.length === 0) return
    const picked = Array.from(files)
    const rejects: string[] = []

    const typeOk = picked.filter((f) => {
      if (UPLOAD_ACCEPT.includes(f.type)) return true
      rejects.push(`「${f.name}」格式不支持`)
      return false
    })
    const sizeOk = typeOk.filter((f) => {
      if (f.size <= UPLOAD_MAX_BYTES) return true
      rejects.push(`「${f.name}」超过 ${UPLOAD_MAX_MB}MB`)
      return false
    })

    // 张数上限只截断、不算失败：用户一次拖了 30 张，留前 20 张比整批拒绝有用。
    const overflow = Math.max(0, sizeOk.length - UPLOAD_MAX_COUNT)
    const accepted = sizeOk.slice(0, UPLOAD_MAX_COUNT)

    if (accepted.length === 0) {
      setResult({ ok: false, message: rejects[0] ?? `仅支持 ${UPLOAD_ACCEPT_LABEL}` })
      return
    }

    const r = appendCandidates(asset!.id, accepted.map((f) => URL.createObjectURL(f)))
    markDirty()
    if (!r.ok) { setResult(r); return }

    const tail: string[] = []
    if (overflow > 0) tail.push(`一次最多上传 ${UPLOAD_MAX_COUNT} 张，已为你保留前 ${UPLOAD_MAX_COUNT} 张`)
    if (rejects.length > 0) tail.push(`${rejects.length} 张未通过校验：${rejects.join('、')}`)
    setResult({
      ok: true,
      message: tail.length ? `已添加 ${accepted.length} 张图片（${tail.join('；')}）` : `已添加 ${accepted.length} 张图片`,
    })
  }

  /** 图片列表加号：从素材库挑一张图并入这份资产。 */
  function confirmAddFromLibrary(pickedItems: PickedRef[]) {
    if (pickedItems.length === 0) return setAddPicker(null)
    setResult(appendCandidates(asset!.id, [pickedItems[0].cover]))
    markDirty()
    setAddPicker(null)
  }

  /** 图片级流转：把选中的这张图送出去（存入团队库 / 贡献广场）。 */
  function confirmSend(intent: SaveIntent) {
    if (intent.kind === 'flat') {
      setResult(runSendImage({ target: intent.target, payload: intent.payload, sourceAssetId: intent.sourceAssetId }))
    }
    setSendImg(null)
  }

  /**
   * 把当前预览的这张图加进 / 移出这份资产自己的参考图（0812）。产出**图级槽**（用户挑的一张具体的图）。
   * 存进去的 url 统一去掉 ?g=N 后缀，跟图级槽的既有格式对齐——
   * 否则同一张图会以两个字符串身份存在，判重和「已是参考图」都会失灵。
   */
  /** 切「当前定稿作为参考」第一槽：本地即时反映 + 即时持久化到资产（0813）。 */
  function applySelfRef(on: boolean) {
    setUseSelfRef(on)
    markDirty()
    setResult(setSelfRef(asset!.id, on))
  }

  function toggleAsReference(cand: { url: string }) {
    markDirty()
    const key = baseUrl(cand.url)
    // 当前定稿走"自参考第一槽"这条派生路径：加/移只翻 useSelfRef，不往 references 里塞一份重复的
    //    （与第一槽上那个 ✕ 同一个开关，行为对称）。
    if (key === baseUrl(asset!.cover ?? '')) {
      applySelfRef(!useSelfRef)
      return
    }
    const i = references.findIndex((r) => r.kind === 'image' && baseUrl((r as { url: string }).url) === key)
    if (i >= 0) {
      setResult(removeRef(asset!.id, i))
      return
    }
    setResult(addImageRefs(asset!.id, [key]))
  }

  /** 参考图选择器（0812）：确定从素材库选的图 → 产出图级槽（用户挑的具体某张图，不显示名字）。 */
  function confirmRefPick(pickedItems: PickedRef[]) {
    if (pickedItems.length === 0) return setRefPicker(null)
    setResult(addImageRefs(asset!.id, pickedItems.map((p) => p.cover)))
    markDirty()
    setRefPicker(null)
  }

  /** 参考图选择器：上传本地临时参考图（纯前端占位，刷新即失）→ 图级槽。 */
  function uploadTempRef(file: File | null) {
    if (!file) return
    const url = URL.createObjectURL(file)
    setResult(addImageRefs(asset!.id, [url]))
    markDirty()
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

  /**
   * 生成软拦截二次确认（0812 §6.4 第二种 · §8.3）：上游不在本批次里、还没出图。
   * 「这次不会参考到」是事实，不是含糊的风险提示——按钮写「知道了，现在生成」而不是「仍然生成」。
   */
  function renderGenConfirm() {
    if (!confirmGen) return null
    const n = pendingList.length
    const names = pendingList.map((r) => r.label).join(' · ')
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setConfirmGen(false)} />
        <div className={styles.confirmCard}>
          <div className={`${styles.confirmIcon} ${styles.confirmIconAccent}`}><RegenIcon /></div>
          <h4 className={styles.confirmTitle}>有 {n} 项参考对象尚未生成</h4>
          <p className={styles.confirmBody}>
            这些参考对象还没有生成图片，本次将<b>暂不参考其形象</b>，仅依据提示词生成。参考关系会为你保留，待它们出图后重新生成，即可自动生效。
          </p>
          <p className={styles.confirmList}>本次暂不参考：{names}</p>
          <div className={styles.confirmActions}>
            <button className={styles.btnGhost} onClick={() => setConfirmGen(false)}>暂不生成</button>
            <button
              className={`${styles.btn} ${styles.btnPri}`}
              onClick={() => { setConfirmGen(false); doGenerate() }}
            >
              确认生成
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
              alreadyPickedUrls={imageRefUrls}
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

  /** 图片列表加号（0810）：从素材库添加 / 上传本地图片 二选一 —— 加入这份资产的图片列表。 */
  function renderAddPicker() {
    if (!addPicker) return null
    if (addPicker === 'library') {
      return (
        <div className={styles.refPickRoot}>
          <div className={styles.sscrim} onClick={() => setAddPicker(null)} />
          <div className={styles.refPickPanel}>
            <CanvasAssetPanel
              pid={asset!.scopeId ?? ''}
              projectName={refProject?.name ?? '当前项目'}
              mode="pick"
              onUse={() => {}}
              onPick={confirmAddFromLibrary}
              onClose={() => setAddPicker(null)}
            />
          </div>
        </div>
      )
    }
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setAddPicker(null)} />
        <div className={styles.msub}>
          <h4 className={styles.subH}>添加图片</h4>
          <div className={styles.refChoices}>
            <button className={styles.refChoice} onClick={() => setAddPicker('library')}>
              <b>从素材库添加</b>
              <span>选一张已有资产的图，加入这份资产</span>
            </button>
            <label className={styles.refChoice} title="本地预览，接后端后落对象存储">
              <b>上传本地图片</b>
              <span>支持 {UPLOAD_ACCEPT_LABEL}，可多选，单次最多 {UPLOAD_MAX_COUNT} 张，单张不超过 {UPLOAD_MAX_MB}MB</span>
              <input
                type="file"
                multiple
                accept={UPLOAD_ACCEPT.join(',')}
                style={{ display: 'none' }}
                onChange={(e) => { uploadLocalImages(e.target.files); setAddPicker(null) }}
              />
            </label>
          </div>
          <div className={styles.inlActions}>
            <button className={styles.btnGhost} onClick={() => setAddPicker(null)}>取消</button>
          </div>
        </div>
      </div>
    )
  }

  /** 音色块（角色专用）：中栏定稿下方展示，读写权限由 canEditVoice 决定。 */
  function renderVoice() {
    return (
      <div className={styles.voiceWrap}>
        {/* 对齐 Figma：音色栏直接坐落在预览下方，栏内已写「音色 · 未设置」，不再单列「音色」小标题。 */}
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
                <button className={styles.vset} onClick={() => { clearVoice(asset!.id); markDirty() }}>清除</button>
              </>
            )}
          </div>
        ) : (
          canEditVoice ? (
            <button className={styles.voiceAddLite} onClick={() => { setVoiceTab('preset'); setPicker('voice') }}>
              <MicOffIcon /> ＋ 设置音色
            </button>
          ) : null
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

  /** 左栏「资产名称」字段提交：空 / 未变直接还原；改名失败回滚到原名并弹提示。 */
  function commitNameField() {
    const v = nameField.trim()
    if (!v || v === asset!.name) { setNameField(asset!.name); return }
    const r = renameAsset(asset!.id, v)
    setResult(r)
    if (r.ok) markDirty()
    else setNameField(asset!.name)
  }

  function renderLightbox() {
    if (!preview) return null
    return (
      <div className={styles.lbRoot} onClick={() => setPreview(null)}>
        <div className={styles.lbStage} onClick={(e) => e.stopPropagation()}>
          <img className={styles.lbImg} src={preview.src} alt={preview.name} />
          <div className={styles.lbBar}>
            <span className={styles.lbName}>{preview.name}</span>
            {/* 放大看清楚了才决定要不要送出去（0810）：灯箱里也给图片级流转入口。 */}
            {!onUse && asset!.scope === 'project' && canRegen && !isOther && (
              <>
                <button className={styles.lbDownload} onClick={() => { const u = preview!.src; setPreview(null); setSendImg({ url: u, scope: 'team' }) }}>存入团队库</button>
                <button className={styles.lbDownload} onClick={() => { const u = preview!.src; setPreview(null); setSendImg({ url: u, scope: 'plaza' }) }}>贡献到素材广场</button>
              </>
            )}
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
            <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('directReuse')}>直接添加到项目</button>
            {canFavorite(user) && (
              <button className={styles.btn} onClick={() => done(runFavorite(asset!.id))}>收藏进团队库</button>
            )}
          </>
        )}
        {asset!.scope === 'team' && (
          <>
            <button className={`${styles.btn} ${styles.btnLead}`} onClick={() => openPicker('reuse')}>添加到项目</button>
            {/* 0813 补漏：主账号可把团队库资产贡献到素材广场（权限/数据层一直支持，0810 下沉时漏了入口）。
                复用单张送出弹窗（sendImg）走 plaza 投稿，交 admin 审核。 */}
            {canContributeToPlaza(user, asset!) && !!coverImg && (
              <button className={styles.btn} onClick={() => setSendImg({ url: coverImg, scope: 'plaza' })}>贡献到素材广场</button>
            )}
          </>
        )}
        {/* 0810：项目库的「存入团队库 / 贡献到素材广场」下沉到中栏预览动作条——按单张图送出，不再是资产级动作。 */}
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
          <h4 className={styles.subH}>添加到我的项目</h4>
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
          <p className={styles.subD}>放到哪个项目？</p>
          <ProjectChips
            projects={projectsForDirect}
            onPick={(pid) => done(runDirectReuse(asset!.id, pid, includeVoice))}
          />
        </>
      )
    } else if (picker === 'reuse') {
      inner = (
        <>
          <h4 className={styles.subH}>添加到我的项目</h4>
          <p className={styles.subD}>放到哪个项目？</p>
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
                <button className={`${styles.btn} ${styles.btnPri} ${styles.btnSm}`} onClick={() => { setVoice(asset!.id, { ...v }); markDirty(); setPicker(null) }}>选用</button>
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
                    markDirty()
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

  // ═══ 画布场景（onUse）：一个统一图片网格，挑一张图用到画布；音色收进头部 pill。 ═══
  if (onUse) {
    const playVoice = () => { if (asset.voice) new Audio(asset.voice.previewUrl).play().catch(() => {}) }
    // 画布二级页统一成一个图片网格：项目层用候选池（定稿排第一），团队 / 广场只有定稿一张。
    const rawImages = hasCandidatePool && candidates.length > 0
      ? candidates.map((c) => ({ key: c.id, url: c.url, isFinal: showFinalBadge && c.id === finalCandId }))
      : coverImg
        ? [{ key: 'cover', url: coverImg, isFinal: false }]
        : []
    const gridImages = [...rawImages].sort((a, b) => Number(b.isFinal) - Number(a.isFinal))
    return (
      <div className={styles.cvInline}>
        <div className={styles.cvHead}>
          <div className={styles.cvTitleRow}>
            <span className={styles.cvTitle}>资产</span>
            <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
          </div>
          {/* 二级页头：返回 + 名称 + 图片数（左）｜ 音色 pill（右） */}
          <div className={styles.cvSubHead}>
            <button className={styles.cvBack} onClick={onBack ?? onClose}>
              <span className={styles.cvBackArrow}>‹</span>
              <span className={styles.cvBackName}>{asset.name}</span>
              {gridImages.length > 0 && <span className={styles.cvBackCount}>{gridImages.length} 张图片</span>}
            </button>
            {isCharacter && (
              asset.voice ? (
                <div
                  className={styles.voicePillBar}
                  draggable={!!onVoiceDragStart}
                  onDragStart={onVoiceDragStart}
                  title={`音色：${asset.voice.name}`}
                >
                  <span className={styles.vpbIco}><MicIcon /></span>
                  <span className={styles.vpbName}>
                    {asset.voice.name}
                    {asset.voice.gender && <span className={styles.gtag}>{asset.voice.gender}</span>}
                  </span>
                  <span className={styles.vpbDivider} aria-hidden />
                  <button className={styles.vpbPlay} title="试听" onClick={playVoice}>▶</button>
                  <button
                    className={styles.vpbAdd}
                    title="放到画布"
                    onClick={() => onUse?.({ voice: { url: asset.voice!.previewUrl, name: `${asset.name}·音色` } })}
                  >
                    ＋
                  </button>
                </div>
              ) : (
                <div className={`${styles.voicePillBar} ${styles.voicePillBarOff}`}>
                  <span className={`${styles.vpbIco} ${styles.vpbIcoOff}`}><MicOffIcon /></span>
                  <span className={styles.vpbNameOff}>未设置音色</span>
                </div>
              )
            )}
          </div>
        </div>

        <div className={styles.cvBody}>
          {isOther && otherMedia === 'text' ? (
            // 「其他」文本没有封面图，走不了图片网格：单独渲染一张正文卡，
            // 行为与图片一致——hover 出「使用」，点了落一个文本节点到画布（PRD #23/#24）。
            <div className={styles.cvGrid}>
              <div className={styles.cvCard}>
                <div className={`${styles.cvPic} ${styles.cvPicText}`}>
                  <div className={styles.otherTextBig}>{(asset.fields.text as string) || '（暂无正文）'}</div>
                  <div className={styles.cvOv}>
                    <button
                      className={styles.lookUse}
                      onClick={() => onUse({ text: { name: asset.name, content: (asset.fields.text as string) ?? '' } })}
                    >
                      使用
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : gridImages.length === 0 ? (
            <div className={styles.emptyResult}>
              <span className={styles.emptyResultText}>{EMPTY_HINT_BY_CATEGORY[asset.category] || '你的图将会在这里展示'}</span>
            </div>
          ) : (
            <div className={styles.cvGrid}>
              {gridImages.map((g, i) => (
                <div key={g.key} className={styles.cvCard}>
                  <div className={styles.cvPic}>
                    <img src={g.url} alt={asset.name} loading="lazy" />
                    <div className={styles.thumbIcons}>
                      <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: g.url, name: g.isFinal ? '定稿' : '图片' })}><ZoomIcon /></button>
                      <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(g.url, asset.name)}><DownloadIcon /></button>
                    </div>
                    <div className={styles.cvOv}>
                      <button className={styles.lookUse} onClick={() => onUse({ cover: g.url })}>使用</button>
                      {/* 提示词是资产级配方，只在第一张（定稿）卡上给入口，不逐张重复。 */}
                      {i === 0 && canViewPrompt(asset) && (!isOther || !!asset.prompt?.trim()) && (
                        <button className={styles.sumoPrompt} onClick={openPrompt}>提示词</button>
                      )}
                    </div>
                    {isOther && otherMedia === 'video' && <span className={styles.cvPlayGlyph} aria-hidden>▶</span>}
                    {g.isFinal && <span className={styles.finalBadgeSm}>★ 定稿</span>}
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
      <div className={styles.mscrim} onClick={requestClose} />
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
                {/* 名字 + 类目/范围 tag 同一行（省纵向空间）：tag 贴在名字右边。 */}
                <div className={styles.mtitleRow}>
                  <span className={styles.mtitle}>{asset.name}</span>
                  <span className={`${styles.chip} ${styles.chipCat}`}>
                    {isCharacter && (
                      <svg className={styles.chipCatIco} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="8" cy="5" r="2.6" />
                        <path d="M2.8 13.4c.5-2.6 2.6-4 5.2-4s4.7 1.4 5.2 4" />
                      </svg>
                    )}
                    {CATEGORY_LABEL[asset.category]}
                  </span>
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
                {/* 未保存改动（对齐 mockup）：呼吸点 +「N 处改动未保存」，悬停展开明细可逐项还原；
                    存完闪一下「已保存」。素材层的图不进这里——它们不会丢，气泡底部单独安抚一句。 */}
                {hasGenPanel && (promptSaved ? (
                  <span className={styles.headSaved}>✓ 已保存</span>
                ) : hasUnsaved ? (
                  <div
                    className={styles.dirtyWrap}
                    onMouseEnter={() => setDirtyOpen(true)}
                    onMouseLeave={() => setDirtyOpen(false)}
                  >
                    <span className={styles.headDirtyB}>
                      {changes.length} 处改动未保存
                    </span>
                    <span className={styles.headSaveWrap}>
                      {/* 淡淡的光晕：一圈脉动的光环绕在「保存」外侧（对齐 mockup 的 ringPulse）。 */}
                      <i className={styles.headSaveRing} aria-hidden />
                      <button className={styles.headSaveBtn} onClick={commitSave}>保存</button>
                    </span>
                    {dirtyOpen && (
                      <div className={styles.dirtyPop}>
                        <div className={styles.dirtyPopHd}>
                          <span>未保存的改动</span>
                          <span className={styles.dirtyPopSub}>离开会丢弃</span>
                        </div>
                        {changes.map((c) => (
                          <div key={c.key} className={styles.dirtyItem}>
                            <i className={styles.dirtyItemDot} />
                            <span className={styles.dirtyItemT}>{c.label}</span>
                            <button className={styles.dirtyRevert} onClick={c.revert}>还原</button>
                          </div>
                        ))}
                        {newImgCount > 0 && (
                          <>
                            <div className={styles.dirtyDiv} />
                            <div className={styles.dirtyKept}>
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <circle cx="8" cy="8" r="6.2" />
                                <path d="M5.2 8.3 7.1 10.2l3.7-4" />
                              </svg>
                              已生成的 {newImgCount} 张图片已入库，随时可取
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : null)}
                {headActions()}
                <button className={styles.close} title="关闭" onClick={requestClose}>✕</button>
              </>
            )}
          </div>
        </div>

        {/* ── 主体：左（提示词 + 参考图 + 参数 + 计价/生成）｜中（本批结果区 / 定稿大图）｜右（已保留）── */}
        <div className={`${styles.mbody} ${wide ? styles.mbody3 : ''}`}>

          {/* ═══ 左栏：生成面板（有生成能力才出）═══ */}
          {hasGenPanel && (
            <div className={styles.genLeft}>
              {/* 资产名称 + 内联音色（对齐 mockup）：角色的音色收进名称行右侧的下拉，不再单列一条 bar。 */}
              <div className={styles.gfield}>
                <div className={styles.flabel}>{isCharacter ? '角色名称' : '资产名称'} <span className={styles.req}>*</span></div>
                <div className={styles.nameRow}>
                  <input
                    className={styles.nameField}
                    value={nameField}
                    onChange={(e) => setNameField(e.target.value)}
                    onBlur={commitNameField}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    placeholder="给这份资产起个名字"
                  />
                  {isCharacter && (canEditVoice ? (
                    <button
                      className={`${styles.voicePill} ${asset.voice ? '' : styles.voicePillEmpty}`}
                      onClick={() => { setVoiceTab('preset'); setPicker('voice') }}
                      title={asset.voice ? `音色：${asset.voice.name}` : '设置音色'}
                    >
                      {asset.voice ? <MicIcon /> : <MicOffIcon />}
                      <span className={styles.voicePillName}>{asset.voice ? asset.voice.name : '设置音色'}</span>
                      <span className={styles.voicePillCaret}>⌄</span>
                    </button>
                  ) : asset.voice ? (
                    <span className={`${styles.voicePill} ${styles.voicePillRo}`} title={`音色：${asset.voice.name}`}>
                      <MicIcon />
                      <span className={styles.voicePillName}>{asset.voice.name}</span>
                    </span>
                  ) : null)}
                </div>
              </div>

              <div className={`${styles.gfield} ${styles.gfieldGrow}`}>
                <div className={styles.flabel}>
                  提示词 <span className={styles.req}>*</span>
                </div>
                <div className={styles.promptWrap}>
                  <textarea
                    className={styles.genPrompt}
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    placeholder="描述你想要的画面…"
                  />
                  <button className={styles.expandCorner} onClick={() => setPromptExpand(true)} title="展开编辑">⤢</button>
                </div>
              </div>

              <div className={styles.gfield}>
                <div className={styles.flabel}>参考图</div>
                <div className={styles.refRow}>
                  {/* 派生的第一槽：当前定稿。✕ 只关掉本次自参考，不动 referenceImages。 */}
                  {selfRef && (
                    <div className={styles.refItem}>
                      <div className={styles.refSlot}>
                        <img src={selfRef.url} alt="当前定稿" loading="lazy" />
                        <button className={styles.refZoom} title="放大查看" onClick={() => setPreview({ src: selfRef.url, name: selfRef.label })}><ZoomIcon /></button>
                        <button className={styles.refRemove} title="不再以当前定稿为底（已保存）" onClick={() => applySelfRef(false)}>✕</button>
                      </div>
                      <span className={styles.refLabel}>{selfRef.label}</span>
                    </div>
                  )}
                  {references.map((ref, i) => {
                    const r = resolved[i]
                    // 图级槽：纯缩略图，不带任何文字（用户自己挑的图，他知道那是什么）。
                    if (ref.kind === 'image') {
                      const src = ref.url
                      return (
                        <div key={i} className={styles.refItem}>
                          <div className={styles.refSlot}>
                            <img src={src} alt="参考图" loading="lazy" />
                            <button className={styles.refZoom} title="放大查看" onClick={() => setPreview({ src, name: '参考图' })}><ZoomIcon /></button>
                            <button className={styles.refRemove} title="移除参考图" onClick={() => { setResult(removeRef(asset.id, i)); markDirty() }}>✕</button>
                          </div>
                        </div>
                      )
                    }
                    // 资产级槽 · ready：缩略图 + 资产名（名字常驻，它是唯一标识）。
                    if (r.state === 'ready') {
                      return (
                        <div key={i} className={styles.refItem}>
                          <div className={styles.refSlot}>
                            <img src={r.url} alt={r.label ?? '参考'} loading="lazy" />
                            <button className={styles.refZoom} title="放大查看" onClick={() => setPreview({ src: r.url, name: r.label ?? '参考' })}><ZoomIcon /></button>
                            <button className={styles.refRemove} title="移除参考" onClick={() => { setResult(removeRef(asset.id, i)); markDirty() }}>✕</button>
                          </div>
                          <span className={styles.refLabel}>{r.label}</span>
                        </div>
                      )
                    }
                    // 资产级槽 · pending / missing：整颗灰化 + 资产名 + ·待生成 / ·已删除。
                    return (
                      <div key={i} className={styles.refItem}>
                        <div className={`${styles.refSlot} ${styles.refSlotPending}`}>
                          <div className={styles.refPendingBox} aria-hidden />
                          <button className={styles.refRemove} title="移除参考" onClick={() => { setResult(removeRef(asset.id, i)); markDirty() }}>✕</button>
                        </div>
                        <span className={styles.refLabel}>{r.label} ·{r.state === 'pending' ? '待生成' : '已删除'}</span>
                      </div>
                    )
                  })}
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
                  <select className={styles.sel} defaultValue={RATIO_OPTS[0]} onChange={markDirty}>{RATIO_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>生成数量</span>
                  <select className={styles.sel} value={genCount} onChange={(e) => { setGenCount(Number(e.target.value)); markDirty() }}>
                    {COUNT_OPTS.map((o) => <option key={o} value={o}>{o} 张</option>)}
                  </select>
                </label>
                <label className={styles.selWrap}>
                  <span className={styles.subLabel}>图片清晰度</span>
                  <select className={styles.sel} defaultValue={QUALITY_OPTS[0]} onChange={markDirty}>{QUALITY_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
              </div>

              {/* 图像模型已移到通栏底栏（对齐 mockup）；参数区到此结束。 */}

              {/* 有 pending 槽时的警示行（0812 §8.2）：确定的事用确定的语气。 */}
              {pendingList.length > 0 && (
                <div className={styles.refWarn}>
                  ◷ 参考对象 <b>{pendingList.map((r) => r.label).join('、')}</b> 尚未生成，本次将<b>暂不参考其形象</b>，仅依据提示词生成。参考关系已为你保留，待其出图后重新生成即可自动生效。
                </div>
              )}

              {/* 计价 + 生成 + 模型下拉已下沉到通栏底栏（见 mbody 之后的 genFootBar）。 */}
            </div>
          )}

          {/* ═══ 右侧深色舞台：中栏预览台 + 右栏全部图片，合成一块（对齐设计稿）═══ */}
          <div className={styles.genStage}>

          {/* ═══ 中栏：预览台（生成中骨架 / 空态 / 预览大图）+ 动作 + 音色 ═══ */}
          {/* 定稿态：给整块深色预览框描一圈青绿直角边（与头部「★ 当前定稿」同条件）。 */}
          <div className={`${styles.genCenter} ${hasGenPanel && !isEmpty && !isOther && generating === null && showFinalBadge && centerIsFinal ? styles.genCenterFinal : ''}`}>
            {/* 「预览」标题只在生成面板里有意义；团队库 / 广场只读态不写它（省地方）。
                右端计数「第 N 张 / 共 M 张 · 未/已定稿」对齐设计稿，只在有候选、非生成中时出。 */}
            {(hasGenPanel || isOther || isEmpty) && (
              <div className={styles.stageHead}>
                <div className={styles.stageHeadL}>
                  <span className={styles.stageTitle}>
                    {isOther ? OTHER_MEDIA_LABEL[otherMedia!] : isEmpty ? '待生成' : '预览'}
                  </span>
                  {/* 「当前定稿」标从图上移到这里（预览标题右边），不再遮挡大图。 */}
                  {hasGenPanel && !isEmpty && !isOther && generating === null && showFinalBadge && centerIsFinal && (
                    <span className={styles.finalChip}>★ 当前定稿</span>
                  )}
                </div>
                {hasGenPanel && !isEmpty && !isOther && generating === null && centerCand && candidates.length > 0 && (
                  <span className={styles.stageCount}>
                    第 {candidates.findIndex((c) => c.id === centerCand.id) + 1} 张 / 共 {candidates.length} 张
                  </span>
                )}
              </div>
            )}
            <div className={`${styles.bigframe} ${showFinalBadge && centerIsFinal ? styles.bigframeFinal : ''}`}>
              {isOther ? (
                otherMedia === 'text' ? (
                  <div className={styles.otherTextBig}>{(asset.fields.text as string) || '（暂无正文）'}</div>
                ) : (
                  <div className={styles.bigMediaWrap}>
                    {/* 视频与图片走同一条路径（PRD #23/#24）：都在详情里看。
                        有真实视频源就原地播放；demo 暂无源时退回"海报 + 播放三角"占位。 */}
                    {otherMedia === 'video' && !!(asset.fields.videoUrl as string | undefined) ? (
                      <video
                        className={styles.bigVideo}
                        src={asset.fields.videoUrl as string}
                        poster={coverImg}
                        controls
                      />
                    ) : (
                      <>
                        <img src={coverImg} alt={asset.name} />
                        {otherMedia === 'video' && (
                          <div className={styles.videoPlayBig} title="视频播放器占位 · 接入视频源后自动生效" aria-hidden>▶</div>
                        )}
                      </>
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
                /* 空态：只留一行占位灰字。添加图片走最右栏「＋ 添加图片」，这里不再重复给上传入口。 */
                <div className={styles.emptyResult}>
                  <span className={styles.emptyResultText}>{EMPTY_HINT_BY_CATEGORY[asset.category] || '你的图将会在这里展示'}</span>
                </div>
              ) : (
                <div className={styles.bigImgWrap}>
                  <img src={centerUrl} alt={asset.name} />

                  {/* 「当前定稿」标已移到预览头部（stageHead），此处不再叠在大图上。 */}

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

            {/* ── 预览动作条（0810）：参考图 · 定稿 · 图片级流转（存入团队库 / 贡献广场）── */}
            {!isOther && !isEmpty && centerCand && canRegen && (
              <div className={styles.previewActs}>
                <button
                  className={styles.pvBtn}
                  onClick={() => toggleAsReference(centerCand)}
                >
                  {isCenterInRefs ? '✓ 已是参考图' : '＋ 添加至参考图'}
                </button>
                {/* 当前定稿态不再在动作条重复标记（左上角已有「★ 当前定稿」徽章）；只有非定稿才给「设为定稿」。 */}
                {!centerIsFinal && (
                  <button
                    className={`${styles.pvBtn} ${styles.pvBtnPri}`}
                    onClick={() => { setResult(runSetFinal(asset.id, centerCand.id)); markDirty() }}
                  >
                    ★ 设为定稿
                  </button>
                )}
                {/* 单张流转收进「分享」下拉（对齐设计稿）：存入团队库 / 贡献到素材广场。 */}
                <div className={styles.pvShareWrap}>
                  <button
                    className={`${styles.pvBtn} ${styles.pvShareBtn} ${shareOpen ? styles.pvShareOpen : ''}`}
                    onClick={(e) => { e.stopPropagation(); setShareOpen((v) => !v) }}
                  >
                    <ShareIcon /> 分享 <span className={styles.pvShareCaret}>{shareOpen ? '⌃' : '⌄'}</span>
                  </button>
                  {shareOpen && (
                    <div className={styles.pvSharePop} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.pvShareItem}
                        onClick={() => { setShareOpen(false); setSendImg({ url: centerCand.url, scope: 'team' }) }}
                      >
                        <span className={styles.pvShareIco}><FolderIcon /></span>
                        <span className={styles.pvShareText}>
                          <span className={styles.pvShareTitle}>存入团队库</span>
                          <span className={styles.pvShareSub}>团队成员可以直接复用</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.pvShareItem}
                        onClick={() => { setShareOpen(false); setSendImg({ url: centerCand.url, scope: 'plaza' }) }}
                      >
                        <span className={styles.pvShareIco}><UploadIcon /></span>
                        <span className={styles.pvShareText}>
                          <span className={styles.pvShareTitle}>贡献到素材广场</span>
                          <span className={styles.pvShareSub}>公开给所有人使用</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 「其他」留存物删除入口（预览台的成品删除都收在大图 hover 里，这里只剩「其他」）。 */}
            {isOther && showCoverTrash && (
              <div className={styles.centerActs}>
                <button className={`${styles.btn} ${styles.btnDangerGhost}`} onClick={deleteCoverImage}>删除该留存物</button>
              </div>
            )}

            {/* 音色（角色专用）：有生成面板时收进左栏「角色名称」行的内联下拉（对齐 mockup）；
                没有生成面板时（团队库 / 广场 / 只读）音色仍留在中栏这条 bar 里，别弄丢。 */}
            {isCharacter && !hasGenPanel && renderVoice()}

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
              </div>
              {/* 生成中：右栏铺 genCount 个流光骨架格，与中栏骨架同步。 */}
              {generating !== null ? (
                <div className={styles.thumbsGrid}>
                  {Array.from({ length: generating }, (_, i) => (
                    <div key={i} className={styles.thumbSkeleton} />
                  ))}
                </div>
              ) : (
                <div className={styles.thumbsGrid}>
                  {/* 加号格固定排第一位（新图往末尾追加，加号放末尾会每次跳位）。 */}
                  {canRegen && (
                    <button className={styles.addTile} onClick={() => setAddPicker('menu')}>
                      <span className={styles.addPlus}>＋</span>
                      <span className={styles.addText}>添加图片</span>
                    </button>
                  )}
                  {candidates.map((c) => {
                    const isFinal = c.id === finalCandId
                    const isCur = centerCand?.id === c.id
                    return (
                      <div
                        key={c.id}
                        className={`${styles.look} ${showFinalBadge && isFinal ? styles.lookFinal : ''} ${isCur && !(showFinalBadge && isFinal) ? styles.thumbCurrent : ''}`}
                        onClick={() => setCenterKeptId(c.id)}
                      >
                        <img src={c.url} alt={asset.name} loading="lazy" />
                        {showFinalBadge && isFinal && <span className={styles.finalBarSm}>★ 定稿</span>}
                        {/* 正在中栏预览、且不是定稿的那张：底部标「查看中」（对齐设计稿；定稿条优先）。 */}
                        {isCur && !(showFinalBadge && isFinal) && <span className={styles.viewingBar}>查看中</span>}
                        {canDeleteLib && (
                          <button type="button" className={styles.cardDelete} title="删除这张图片" onClick={(e) => { e.stopPropagation(); deleteCandidate(c.id) }}>
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          </div>{/* /genStage */}
        </div>

        {/* ── 通栏底栏（对齐 mockup）：左＝图像模型下拉，右＝预计消耗 + 生成 ── */}
        {hasGenPanel && (
          <div className={styles.genFootBar}>
            <label className={styles.footModel} title={model}>
              <select className={styles.footSel} value={model} onChange={(e) => { setModel(e.target.value); markDirty() }}>
                {MODEL_OPTS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <div className={styles.footRight}>
              {/* 生成即保存（0814 · PRD #15.1）：把这句写在按钮旁边，
                  用户就不必先「保存」再「生成」——点生成本身就是一次保存。 */}
              {hasUnsaved && (
                <span className={styles.genTip}>点「生成」将一并保存当前的 {changes.length} 处改动</span>
              )}
              <span className={styles.costHint}>预计消耗 <b>{genCount * COST_PER_IMAGE}</b> 星钻</span>
              <button
                className={`${styles.genBtn} ${!asset.cover ? styles.genBtnPulse : ''}`}
                disabled={generating !== null}
                onClick={requestGenerate}
              >
                {generating !== null ? '生成中…' : (candidates.length > 0 ? '重新生成' : '生成')}
              </button>
            </div>
          </div>
        )}

        {/* 结果提示：浮在弹窗顶部，不占布局、3 秒自动消失。 */}
        {result && (
          <div className={`${styles.toast} ${result.ok ? styles.toastOk : styles.toastErr}`}>
            {result.message}
          </div>
        )}

        {renderPicker()}
        {renderPromptPanel()}
        {renderDeleteConfirm()}
        {renderGenConfirm()}
        {renderRefPicker()}
        {renderAddPicker()}

        {/* 提示词全屏「展开」编辑（对齐 mockup）：编辑的是同一份 promptDraft，收起后草稿保留。 */}
        {promptExpand && (
          <div className={styles.promptExpand} onClick={() => setPromptExpand(false)}>
            <div className={styles.promptExpandBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.promptExpandHead}>
                <span>提示词</span>
                <button className={styles.close} title="收起" onClick={() => setPromptExpand(false)}>✕</button>
              </div>
              <textarea
                className={styles.promptExpandArea}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="描述你想要的画面…"
                autoFocus
              />
              <div className={styles.promptExpandFoot}>
                <button className={styles.btnGhost} onClick={() => setPromptExpand(false)}>收起</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {renderLightbox()}
      {/* 图片级流转（0810）：把选中的这张图送出去。只出一层（团队库 / 广场），不出保存方式段。 */}
      {sendImg && (
        <AssetSaveModal
          source={{ kind: 'libraryImage', assetId: asset.id, url: sendImg.url, category: asset.category, defaultName: asset.name, prompt: asset.prompt, voice: asset.voice }}
          projectId={asset.scopeId ?? ''}
          projectName={refProject?.name ?? '当前项目'}
          allowedScopes={[sendImg.scope] as Scope[]}
          projectAssets={[]}
          characters={[]}
          allAssets={world.assets}
          currentUser={user}
          currentTeamId={user.teamId}
          onConfirm={confirmSend}
          onClose={() => setSendImg(null)}
        />
      )}
    </div>
  )
}

/** 一排项目按钮，供"选目标项目"用。 */
function ProjectChips({
  projects,
  onPick,
}: {
  projects: { id: string; name: string; cover?: string; tag?: string }[]
  onPick: (projectId: string) => void
}) {
  if (projects.length === 0) return <p className={styles.note}>当前账号没有可用的项目。</p>
  return (
    <div className={styles.projList}>
      {projects.map((p) => (
        <button key={p.id} className={styles.projItem} onClick={() => onPick(p.id)}>
          <img className={styles.projCover} src={p.cover} alt="" aria-hidden />
          <span className={styles.projMeta}>
            <span className={styles.projName}>{p.name}</span>
            {p.tag && <span className={styles.projTag}>{p.tag}</span>}
          </span>
          <span className={styles.projGo}>›</span>
        </button>
      ))}
    </div>
  )
}
