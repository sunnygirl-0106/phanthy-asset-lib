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
import { PRESET_VOICES } from '../data/presetVoices'
import { assetUrl } from '../utils/assets'
import styles from './AssetDetail.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频', other: '其他',
}
const SCOPE_LABEL = { plaza: '素材广场', team: '团队资产库', project: '项目资产库' }
/** 「其他」媒介文案（详情大图 cap / 徽章共用）。 */
const OTHER_MEDIA_LABEL: Record<'image' | 'video' | 'text', string> = { image: '图片', video: '视频', text: '文本' }
/** Demo 无生图后端：生成 / 恢复空壳时先落这张占位图，接模型后换真图。 */
const IMG_PLACEHOLDER = assetUrl('assets/canvas/image-placeholder.svg')

/** 去掉 ?g=N 后缀，拿到图片本体地址。 */
function baseUrl(u: string): string { return u.split('?')[0] }
/** 生成图来源：定稿 → 参考图第一张 → 通用占位图。 */
function genSourceOf(a: { cover: string; referenceImages?: string[] }): string {
  return baseUrl(a.cover || a.referenceImages?.[0] || IMG_PLACEHOLDER)
}

/** 「本次生成」暂存图的本地自增 id（仅用于勾选/预览，不入库）。 */
let _batchSeq = 1

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
  const appendCandidates = useStore((s) => s.appendCandidates)
  const setPrompt = useStore((s) => s.setPrompt)
  const removeReferenceImage = useStore((s) => s.removeReferenceImage)
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
  // 「本次生成」暂存区：还没被「保留」进候选池的图，纯本地态（资产 status 不变，见 3.4-1）。
  // url = 这份资产自己的图（定稿 / 参考图）+ ?g=N 去重后缀；id 仅本地区分与勾选用。
  const [batch, setBatch] = useState<{ id: string; url: string; sel: boolean }[]>([])
  // 中栏大图当前显示哪张：null=定稿；否则指向右栏某张（本次生成 / 已保留）。
  const [centerSel, setCenterSel] = useState<{ zone: 'batch' | 'kept'; id: string } | null>(null)
  // 「本次生成」还有未处理候选时再点生成 → 先确认替换（避免手滑丢掉挑好的）。
  const [genConfirm, setGenConfirm] = useState(false)
  // 生成参数（纯展示，仅「生成数量」驱动本次生成的张数）。
  const [genCount, setGenCount] = useState(4)

  // Esc：先收子面板 / 改名，再关整扇弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (preview) setPreview(null)
      else if (genConfirm) setGenConfirm(false)
      else if (promptOpen) setPromptOpen(false)
      else if (picker) setPicker(null)
      else if (renaming) setRenaming(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, genConfirm, promptOpen, picker, renaming, onClose])

  // 切换到另一份资产时，清掉三栏面板的本地态（本次生成 / 中栏选中 / 提示词草稿）。
  useEffect(() => {
    setBatch([])
    setCenterSel(null)
    setGenConfirm(false)
    setPromptDraft(asset?.prompt ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

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
    // 团队/项目库：删定稿图。
    const finalCand = candidates.find((c) => c.url === asset!.cover)
    if (finalCand && candidates.length > 1) {
      // 池中还有别的图：删这张，服务层顶一张上来当新定稿。
      return setResult(runRemoveCandidate(asset!.id, finalCand.id))
    }
    // 池空 / 最后一张 → 归零分流：团队删整份资产，项目仅清空图片。
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

  // ─── 三栏生成面板：派生值 ─────────────────────────────────────────
  // 有生成能力（canRegen）且非「其他」→ 出左栏（提示词 + 参考图 + 参数 + 生成）与「本次生成」暂存区。
  const hasGenPanel = canRegen && !isOther
  // 中栏当前展示的候选（来自「已保留」）或暂存图（来自「本次生成」）；都为空则展示定稿。
  const centerCand = centerSel?.zone === 'kept' ? candidates.find((c) => c.id === centerSel.id) : undefined
  const centerBatch = centerSel?.zone === 'batch' ? batch.find((b) => b.id === centerSel.id) : undefined
  // 定稿是按 url 认的候选（候选 url 带 ?g=N 去重后缀，保证只有一张命中）。
  const finalCandId = candidates.find((c) => c.url === asset.cover)?.id
  // 中栏大图 url：优先当前选中项，否则定稿（空壳时为空 → 占位）。
  const centerUrl = centerBatch ? centerBatch.url : centerCand ? centerCand.url : coverImg
  // 当前展示的是不是定稿（定稿星角标 / 「设为定稿」禁用判断）——按候选 id 比。
  const centerIsFinal = !centerSel && !isEmpty ? true : centerCand ? centerCand.id === finalCandId : false
  const centerCaption = centerBatch ? '本次候选 · 未保留' : centerCand ? '已保留' : '定稿'
  // 「设为定稿」：仅当选中「已保留」里一张、且它还不是定稿时可用。
  const canSetCenterFinal = canRegen && !!centerCand && centerCand.id !== finalCandId
  const selCount = batch.filter((b) => b.sel).length
  const allSelected = batch.length > 0 && selCount === batch.length
  // 中栏「删除」何时可点：删暂存图 / 删候选 / 广场下架 / 团队·项目删定稿。空壳无图 → 不可删。
  const centerDeletable =
    !!centerBatch ||
    !!centerCand ||
    (!centerSel && (canRemovePlaza || (canDeleteLib && !!coverImg)))

  /** 生成（占位）：往「本次生成」暂存区放 genCount 张本资产自己的图，默认全勾；资产 status 不变。
   *  取图 = 定稿 → 参考图第一张（空壳）→ 通用占位图；每张带 ?g=N 后缀保证 url 唯一。 */
  function doGenerate() {
    if (promptDraft !== (asset!.prompt ?? '')) setPrompt(asset!.id, promptDraft)
    const src = genSourceOf(asset!)
    const items = Array.from({ length: genCount }, () => {
      const seq = _batchSeq++
      return { id: `b${seq}`, url: `${src}?g=${seq}`, sel: true } // 后缀保证每张 url 唯一
    })
    setBatch(items)
    setCenterSel({ zone: 'batch', id: items[0].id })
    setResult({ ok: true, message: `已生成 ${genCount} 张候选 · 默认全选，取消勾选即不保留` })
  }

  /** 点「生成」：暂存区还有未处理候选时先确认替换，否则直接生成。 */
  function onGenerateClick() {
    if (!canRegen) return
    if (batch.length) {
      setGenConfirm(true)
      return
    }
    doGenerate()
  }

  /** 保留选中：把勾中的暂存图并入候选池（空壳保留后 → 成品、第一张成定稿），清空暂存区。 */
  function keepSelected() {
    const picked = batch.filter((b) => b.sel)
    if (!picked.length) return
    const wasEmpty = asset!.status === 'empty'
    const dropped = batch.length - picked.length
    const r = appendCandidates(asset!.id, picked.map((b) => b.url))
    if (r.ok) {
      // 说清楚没勾的去哪了；空壳第一次出图再补一句"第 1 张已设为定稿"。
      let message = wasEmpty ? `已保留 ${picked.length} 张，第 1 张已设为定稿` : `已保留 ${picked.length} 张`
      if (dropped > 0) message += `，其余 ${dropped} 张已丢弃`
      else if (wasEmpty) message += '，可在右栏更换'
      setResult({ ok: true, message })
    } else {
      setResult(r)
    }
    setBatch([])
    setCenterSel(null) // 回到定稿（空壳保留后即为第一张）
  }

  /** 都不要：清空「本次生成」，什么都不保留。 */
  function dropBatch() {
    const n = batch.length
    setBatch([])
    setCenterSel((prev) => (prev?.zone === 'batch' ? null : prev))
    setResult({ ok: true, message: `已丢弃本次生成的 ${n} 张` })
  }

  /** 勾选 / 取消暂存图。 */
  function toggleBatchPick(id: string) {
    setBatch((prev) => prev.map((b) => (b.id === id ? { ...b, sel: !b.sel } : b)))
  }

  /** 中栏「删除」：删暂存图只回到本批 / 定稿；删定稿或候选走 3.5 归零判定。 */
  function deleteCenter() {
    if (centerBatch) {
      const idx = batch.findIndex((b) => b.id === centerBatch.id)
      const next = batch.filter((b) => b.id !== centerBatch.id)
      setBatch(next)
      setCenterSel(next.length ? { zone: 'batch', id: next[Math.min(idx, next.length - 1)].id } : null)
      return
    }
    if (centerCand) {
      deleteCandidate(centerCand.id)
      setCenterSel(null)
      return
    }
    deleteCoverImage() // 定稿
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

  /** 「本次生成」还有未处理候选时再点生成的替换确认。 */
  function renderGenConfirm() {
    if (!genConfirm) return null
    return (
      <div className={styles.msubroot}>
        <div className={styles.sscrim} onClick={() => setGenConfirm(false)} />
        <div className={styles.confirmCard}>
          <div className={`${styles.confirmIcon} ${styles.confirmIconAccent}`}><RegenIcon /></div>
          <h4 className={styles.confirmTitle}>替换本次候选？</h4>
          <p className={styles.confirmBody}>
            「本次生成」里还有未处理的候选，重新生成会替换掉它们。想留下的请先点「保留选中」。
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.btnGhost} onClick={() => setGenConfirm(false)}>取消</button>
            <button className={`${styles.btn} ${styles.btnPri}`} onClick={() => { setGenConfirm(false); doGenerate() }}>替换并重新生成</button>
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

          {/* 候选池：挑一张用到画布 */}
          <div className={styles.looksHead}>
            <div className={styles.looksHeadT}>候选池（{candidates.length}）</div>
          </div>
          {candidates.length > 0 && (
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
                    {c.id === finalCandId && <span className={styles.finalStar} title="定稿">★</span>}
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
      <div className={`${styles.modal} ${hasGenPanel ? styles.modal3 : ''}`}>
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
                  {referencedFrom && (
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

        {/* ── 主体三栏：左（提示词 + 参考图 + 参数 + 生成）｜中（定稿大图 + 动作 + 音色）｜右（本次生成 + 已保留）── */}
        <div className={`${styles.mbody} ${hasGenPanel ? styles.mbody3 : ''}`}>

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
                <div className={styles.flabel}>参考图 <span className={styles.fhint}>（仅展示，不参与生成）</span></div>
                <div className={styles.refRow}>
                  {referenceImages.map((src, i) => (
                    <div key={i} className={styles.refSlot}>
                      <img src={src} alt="参考图" loading="lazy" />
                      <button className={styles.refZoom} title="放大查看" onClick={() => setPreview({ src, name: '参考图' })}><ZoomIcon /></button>
                      <button className={styles.refRemove} title="移除参考图" onClick={() => setResult(removeReferenceImage(asset.id, i))}>✕</button>
                    </div>
                  ))}
                  <button className={styles.refAdd} disabled title="下一版支持从资产库选择">
                    <span className={styles.refPlus}>＋</span>
                    <span>从资产库选</span>
                  </button>
                </div>
                {referencedFrom && <div className={styles.refFrom}>参考自 <b>{referencedFrom.name}</b> 的定稿图</div>}
              </div>

              {/* 生成参数：4 个下拉压成紧凑 2×2 一组，给上方提示词让出空间。 */}
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

              <button className={`${styles.genBtn} ${isEmpty ? styles.genBtnPulse : ''}`} onClick={onGenerateClick}>生成</button>
            </div>
          )}

          {/* ═══ 中栏：定稿大图 + 动作 + 音色 ═══ */}
          <div className={styles.genCenter}>
            <div className={styles.stageTitle}>{isOther ? OTHER_MEDIA_LABEL[otherMedia!] : '定稿大图'}</div>
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
              ) : isEmpty && !centerBatch ? (
                <div className={styles.emptyBig}>
                  <PlaceholderIcon />
                  <span>待生成{canRegen ? ' · 点左侧「生成」' : ''}</span>
                </div>
              ) : (
                <div className={styles.bigImgWrap}>
                  <img src={centerUrl} alt={asset.name} />
                  {centerIsFinal && <span className={styles.centerStar}>★ 定稿</span>}
                  <div className={styles.thumbIcons}>
                    <button className={styles.thumbBtn} title="放大查看" onClick={() => setPreview({ src: centerUrl, name: centerCaption })}><ZoomIcon /></button>
                    <button className={styles.thumbBtn} title="下载原图" onClick={() => downloadImage(centerUrl, `${asset.name}·${centerCaption}`)}><DownloadIcon /></button>
                  </div>
                  <span className={styles.centerCap}>{centerCaption}</span>
                </div>
              )}
              {/* 只读态（2 栏）才在大图上给提示词入口；3 栏时提示词已在左栏常驻。 */}
              {!hasGenPanel && !isEmpty && !isOther && canViewPrompt(asset) && (
                <button className={styles.promptBadge} title="查看提示词" onClick={openPrompt}>
                  <PromptIcon />
                </button>
              )}
            </div>

            {/* 中栏动作 */}
            {isOther ? (
              showCoverTrash && (
                <div className={styles.centerActs}>
                  <button className={`${styles.btn} ${styles.btnDangerGhost}`} onClick={deleteCoverImage}>删除该留存物</button>
                </div>
              )
            ) : (
              <div className={styles.centerActs}>
                {hasGenPanel && (
                  <button
                    className={`${styles.btn} ${styles.btnPri}`}
                    disabled={!canSetCenterFinal}
                    onClick={() => { if (centerCand) setResult(runSetFinal(asset.id, centerCand.id)) }}
                  >
                    ★ 设为定稿
                  </button>
                )}
                <button
                  className={styles.btn}
                  disabled={isEmpty && !centerBatch}
                  onClick={() => { if (centerUrl) downloadImage(centerUrl, `${asset.name}·${centerCaption}`) }}
                >
                  下载
                </button>
                {centerDeletable && (
                  <button className={`${styles.btn} ${styles.btnDangerGhost}`} onClick={deleteCenter}>删除</button>
                )}
              </div>
            )}

            {/* 音色（角色专用，两种布局都展示） */}
            {isCharacter && renderVoice()}
          </div>

          {/* ═══ 右栏：本次生成 + 已保留 ═══ */}
          <div className={styles.genRight}>
            {isOther ? (
              <p className={styles.secD}>
                「其他」是创作过程的留存物（分镜 / 视频片段 / 台词）：仅存在于本项目、可随时拖回画布，
                不沉淀到团队库、不贡献到广场。
              </p>
            ) : (
              <>
                {/* 本次生成（暂存区）——仅有生成能力时出现 */}
                {hasGenPanel && (
                  <>
                    <div className={styles.rsecHead}>
                      <div className={styles.rsecT}>本次生成 <b>（{batch.length}）</b></div>
                      {batch.length > 0 && (
                        <span
                          className={styles.selall}
                          onClick={() => { const on = allSelected; setBatch((prev) => prev.map((b) => ({ ...b, sel: !on }))) }}
                        >
                          {allSelected ? '取消全选' : '全选'}
                        </span>
                      )}
                    </div>
                    {batch.length > 0 ? (
                      <>
                        <div className={styles.thumbsGrid}>
                          {batch.map((b, i) => {
                            const isCur = centerSel?.zone === 'batch' && centerSel.id === b.id
                            return (
                              <div
                                key={b.id}
                                className={`${styles.pickThumb} ${b.sel ? styles.pickOn : ''} ${isCur ? styles.thumbCurrent : ''}`}
                                onClick={() => setCenterSel({ zone: 'batch', id: b.id })}
                              >
                                <img src={b.url} alt="本次候选" />
                                <button className={styles.pickCheck} onClick={(e) => { e.stopPropagation(); toggleBatchPick(b.id) }}>{b.sel ? '✓' : ''}</button>
                                <span className={styles.pickNum}>{i + 1}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div className={styles.batchActs}>
                          <button className={`${styles.btn} ${styles.btnPri} ${styles.keepBtn}`} disabled={selCount === 0} onClick={keepSelected}>
                            保留选中（{selCount}）
                          </button>
                          <button className={styles.btn} onClick={dropBatch}>都不要</button>
                        </div>
                      </>
                    ) : (
                      <div className={styles.rempty}>尚未生成 · 点「生成」出图</div>
                    )}
                    <div className={styles.rdivider} />
                  </>
                )}

                {/* 已保留（候选池） */}
                <div className={styles.rsecHead}>
                  <div className={styles.rsecT}>已保留 <b>（{candidates.length}）</b></div>
                </div>
                {candidates.length > 0 ? (
                  <div className={styles.thumbsGrid}>
                    {candidates.map((c) => {
                      const isFinal = c.id === finalCandId
                      const isCur = centerSel?.zone === 'kept' && centerSel.id === c.id
                      return (
                        <div
                          key={c.id}
                          className={`${styles.look} ${isCur ? styles.thumbCurrent : ''}`}
                          onClick={() => setCenterSel({ zone: 'kept', id: c.id })}
                        >
                          <img src={c.url} alt={asset.name} loading="lazy" />
                          <div className={`${styles.thumbIcons} ${canDeleteLib ? styles.thumbIconsShifted : ''}`}>
                            <button className={styles.thumbBtn} title="放大查看" onClick={(e) => { e.stopPropagation(); setPreview({ src: c.url, name: '候选图' }) }}><ZoomIcon /></button>
                            <button className={styles.thumbBtn} title="下载原图" onClick={(e) => { e.stopPropagation(); downloadImage(c.url, `${asset.name}·候选`) }}><DownloadIcon /></button>
                          </div>
                          {canDeleteLib && (
                            <button type="button" className={styles.cardDelete} title="删除这张图片" onClick={(e) => { e.stopPropagation(); deleteCandidate(c.id) }}>
                              <TrashIcon />
                            </button>
                          )}
                          <div className={styles.lkNm}>{isFinal ? '★ 定稿' : '候选'}</div>
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
                  <div className={styles.rempty}>{isEmpty ? '待生成资产：还没有图，点左侧「生成」' : '保留满意的候选后会显示在这里'}</div>
                )}
              </>
            )}

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

        {renderPicker()}
        {renderPromptPanel()}
        {renderDeleteConfirm()}
        {renderGenConfirm()}
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
