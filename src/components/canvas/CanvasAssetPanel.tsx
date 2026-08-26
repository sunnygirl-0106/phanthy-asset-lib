/**
 * 【画布 · 入口二】CanvasAssetPanel —— 左侧资产库面板（三层浏览 · 对齐资产库网格）
 *
 * 展示范围（技术规划 §2.2）：本项目的 项目库 + 团队库 + 素材广场，三层都可见。
 * 所有卡片统一进入详情，再选择素模 / 造型 / 音色放到画布。
 *
 * 结构与「资产库网格」（AssetGrid）保持一致——来源分段 + 搜索、类目筛选（CategoryTabs）、
 * 卡片网格（AssetCard）、点开详情（AssetDetail），详情内提供画布专属的「使用」。
 */

import { useState } from 'react'
import type { Scope, Asset } from '../../data/types'
import type { Media } from '../../services/canvasService'
import { useStore, useCurrentUser } from '../../store/useStore'
import { canSee, canViewPrompt } from '../../services/permission'
import { coverOf } from '../../services/assetService'
import { AssetCard } from '../AssetCard'
import { AssetDetail } from '../AssetDetail'
import { VideoLightbox } from '../VideoLightbox'
import { TextLightbox } from '../TextLightbox'
import { AudioList, audioSrcOf } from '../AudioList'
import type { CategoryFilter } from '../CategoryTabs'
import { assetUrl } from '../../utils/assets'
import styles from './CanvasAssetPanel.module.css'

/** 拖拽载荷：落到画布时用它造节点。 */
export interface DragPayload {
  scope: Scope
  assetId: string
  media: Media
  name: string
  cover?: string
  /** 音频 / 音色节点的可播放音源 url（复用 CanvasNode 的 content 字段）。 */
  content?: string
}

export const DRAG_MIME = 'application/x-phanty-asset'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'project', label: '项目库' },
  { key: 'team', label: '团队库' },
  { key: 'plaza', label: '广场' },
]

// 一律点进详情再用（不走卡片直接使用）的品类：
//   · character / scene / prop —— 有"造型/其他样式"能力，即使当前只有一张图，
//     也要能在详情里看到「造型/其他样式（0）」并放大 / 下载 / 新增。
//   · other —— 0814 口径统一（PRD #23/#24）：「其他」里的图片 / 视频 / 文本
//     点击行为与普通图片资产一致，hover 一律出「查看并使用」，进详情后
//     既能看提示词、也能把它带到画布，而不是图片直接用、视频另开播放器。
const STYLE_CATS = new Set(['character', 'scene', 'prop', 'other'])

/** 网格展示顺序：角色 → 服装 → 场景 → 道具 → 音频 →「其他」垫底（对齐类目 Tab；其余归到末尾）。 */
const CAT_RANK: Record<string, number> = { character: 0, costume: 1, scene: 2, prop: 3, audio: 4, other: 5 }
const catRank = (a: { category: string }) => CAT_RANK[a.category] ?? 9

// 类目下划线 Tab（对齐 Figma 面板头部）；与资产库网格的 CategoryTabs 同一套类目，
// 这里换成"青色下划线"观感，故在面板内本地渲染，不动共享组件。
const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'character', label: '角色' },
  { value: 'costume', label: '服装' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'audio', label: '音频' },
  { value: 'other', label: '其他' },
]

/** 资产 → 画布节点媒介。「其他」类目读 fields.media（图/视频/文本/音频），让存下的留存物按原媒介拖回画布。 */
function mediaOf(asset: Asset): Media {
  if (asset.category === 'audio') return 'audio'
  // 「其他」只承载图片 / 视频 / 文本三种媒介：音频有自己的类目，永远不会落到「其他」，
  // 所以这里不留 audio 分支（判断依据是"这个媒介有没有自己的类目"，见 PRD 全局规则）。
  if (asset.category === 'other') {
    const m = asset.fields.media
    return m === 'video' ? 'video' : m === 'text' ? 'text' : 'image'
  }
  return 'image'
}

/** 是否走音频条状列表（AudioList）：音频类目（「其他」不含音频）。其余走卡片网格。 */
function isAudioAsset(asset: Asset): boolean {
  return asset.category === 'audio'
}

/** 单图资产从卡片直接使用时的默认载荷。 */
function defaultPayload(asset: Asset): DragPayload {
  if (asset.category === 'character') {
    return { scope: asset.scope, assetId: asset.id, media: 'image', name: asset.name, cover: asset.cover }
  }
  // 「其他」文本：落文本节点（content 取 fields.text，无封面）；图片/视频：带封面落对应节点。
  if (asset.category === 'other' && mediaOf(asset) === 'text') {
    return { scope: asset.scope, assetId: asset.id, media: 'text', name: asset.name, content: (asset.fields.text as string) ?? '' }
  }
  return { scope: asset.scope, assetId: asset.id, media: mediaOf(asset), name: asset.name, cover: coverOf(asset) }
}

/** 选图模式（0804）下回调返回的一条被选资产。 */
export interface PickedRef {
  assetId: string
  cover: string
  name: string
}

export function CanvasAssetPanel({
  pid,
  projectName,
  onUse,
  onClose,
  mode = 'canvas',
  onPick,
  maxPick,
  alreadyPickedUrls,
}: {
  pid: string
  projectName: string
  onUse: (payload: DragPayload) => void
  /** 关闭整个资产浮层（详情二级页右上角 ✕ 用）。 */
  onClose?: () => void
  /** 选图模式（0804）：给"参考图选择器"复用。传 'pick' 就进多选模式，
   *  卡片右上角出勾选框、底部出「确定（N）」，点确定回调选中资产，
   *  不再走 onUse（画布落节点）那条路。默认 'canvas' 不破坏画布现有调用。 */
  mode?: 'canvas' | 'pick'
  onPick?: (picked: PickedRef[]) => void
  maxPick?: number
  /** 已经是当前资产参考图的定稿地址（去掉 ?g=N 后缀）：命中的卡片标记「已添加至参考图」、不可再选。 */
  alreadyPickedUrls?: string[]
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const [scope, setScope] = useState<Scope>('project')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null)
  const [openPromptDirectly, setOpenPromptDirectly] = useState(false)
  // 「其他」视频：点卡片即全屏播放（不走详情）——与资产库详情里的播放器同一套。
  const [videoPreview, setVideoPreview] = useState<{ asset: Asset; src?: string; poster?: string; name: string } | null>(null)
  // 「其他」文本：点卡片 / 点「查看」即弹窗看全文（不走详情二级页）。
  const [textPreview, setTextPreview] = useState<{ asset: Asset; text: string; name: string } | null>(null)
  // 选图模式：已勾选的资产（按 assetId 存全量载荷，确定时一次性回调）。
  const [picked, setPicked] = useState<Record<string, PickedRef>>({})
  const picking = mode === 'pick'
  const pickedList = Object.values(picked)

  function togglePick(a: Asset) {
    setPicked((prev) => {
      if (prev[a.id]) {
        const { [a.id]: _drop, ...rest } = prev
        return rest
      }
      // 到达上限则不再新增（已选的仍可取消）。
      if (maxPick && Object.keys(prev).length >= maxPick) return prev
      return { ...prev, [a.id]: { assetId: a.id, cover: coverOf(a), name: a.name } }
    })
  }

  // 单一数据源 + 派生视图：无搜索时按来源浏览；输入后跨三层搜，并保留当前项目的边界。
  // 只列成品：空壳 / 生成中 / 失败的资产不进画布资产网格。
  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const items = world.assets
    .filter((a) => canSee(world, user, a))
    .filter((a) => a.status === 'done')
    // 选图模式只挑图当参考（0805 · 5a）：音频、以及「其他」里的视频/文本一律不列，只留图片。
    .filter((a) => !picking || (a.category !== 'audio' && (a.category !== 'other' || a.fields.media === 'image')))
    .filter((a) => a.scope !== 'project' || a.scopeId === pid)
    .filter((a) => searching || a.scope === scope)
    .filter((a) => category === 'all' || a.category === category)
    .filter((a) => !searching || a.name.toLowerCase().includes(q))
    // 类目排序：角色 → 服装 → 场景 → 道具 → 音频 →「其他」垫底（同类目内保持原顺序，sort 稳定）。
    .sort((a, b) => catRank(a) - catRank(b))

  const groupedItems = SCOPES.map((s) => ({ ...s, items: items.filter((a) => a.scope === s.key) }))
  // 「全部」类目分区展示用：图片类走网格、音频类走条状列表（音频只在音频类目，不进「其他」）。
  const imageItems = items.filter((a) => !isAudioAsset(a))
  const audioItems = items.filter((a) => isAudioAsset(a))

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  /** 音频资产 → 音频节点的载荷：带上可播放音源（content）。 */
  function audioPayload(a: Asset): DragPayload {
    return { scope: a.scope, assetId: a.id, media: 'audio', name: a.name, content: audioSrcOf(a) }
  }

  /** 分区小标题（对齐 Figma）：灰字标签 + 数字角标。spaced=与上方内容拉开距离。 */
  function sectionHead(label: string, count: number, spaced = false) {
    return (
      <div className={`${styles.sectionHead} ${spaced ? styles.sectionHeadSpaced : ''}`}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.sectionRule} aria-hidden />
      </div>
    )
  }

  /** 图片类资产卡。选图模式 = 点击勾选（卡片右上角勾选框 + 选中高亮）；画布模式照旧。 */
  function renderCard(a: Asset) {
    if (picking) {
      // 已是当前资产参考图的定稿：不再是"可选项"，标一枚「已添加至参考图」并锁掉，避免重复添加。
      const already = !!alreadyPickedUrls && alreadyPickedUrls.includes(coverOf(a).split('?')[0])
      const on = !!picked[a.id]
      return (
        <div key={a.id} className={`${styles.pickWrap} ${on ? styles.pickWrapOn : ''} ${already ? styles.pickWrapDone : ''}`}>
          <AssetCard asset={a} hideSub compact hideCount onClick={already ? undefined : () => togglePick(a)} />
          {already ? (
            <span className={styles.pickDone}>✓ 已添加至参考图</span>
          ) : (
            <span className={`${styles.pickBox} ${on ? styles.pickBoxOn : ''}`}>{on ? '✓' : ''}</span>
          )}
        </div>
      )
    }
    // 候选池 ≤1 张且不属于"进详情选图"品类的，卡片上直接「使用」；否则进详情挑候选。
    const singleImage = (a.candidates?.length ?? 0) <= 1 && !STYLE_CATS.has(a.category)
    // 「其他」视频：点卡片即全屏播放（不走详情，直接预览）。
    const isOtherVideo = a.category === 'other' && a.fields.media === 'video'
    const openVideo = () => setVideoPreview({ asset: a, src: (a.fields.videoUrl as string | undefined) || undefined, poster: coverOf(a), name: a.name })
    // 「其他」文本：无「造型/候选」概念，不进详情二级页——点卡片 / 点「查看」即弹窗看全文，「使用」直接落文本节点。
    const isOtherText = a.category === 'other' && a.fields.media === 'text'
    const openText = () => setTextPreview({ asset: a, text: (a.fields.text as string) ?? '', name: a.name })
    // 「其他」文本：hover 出「查看 / 使用」——查看=弹窗看全文，使用=直接落文本节点；点卡片默认查看。
    if (isOtherText) {
      return (
        <AssetCard
          key={a.id}
          asset={a}
          hideSub
          compact
          onClick={openText}
          hoverActions={
            <>
              <button className={`${styles.actBtn} ${styles.actGhost}`} onClick={(e) => { e.stopPropagation(); openText() }}>
                查看
              </button>
              <button className={`${styles.actBtn} ${styles.actAccent}`} onClick={(e) => { e.stopPropagation(); onUse(defaultPayload(a)) }}>
                使用
              </button>
            </>
          }
        />
      )
    }
    // 「其他」视频：不出 hover 按钮——点卡片默认就是「查看」（打开播放页，复用项目库同款），
    // 看完在播放页里再引导「使用」（落视频节点到画布）。
    if (isOtherVideo) {
      return (
        <AssetCard
          key={a.id}
          asset={a}
          hideSub
          compact
          onClick={openVideo}
        />
      )
    }
    return (
      <AssetCard
        key={a.id}
        asset={a}
        hideSub
        compact
        onClick={singleImage ? undefined : () => { setOpenPromptDirectly(false); setDetailAssetId(a.id) }}
        hoverActions={singleImage ? (
          <>
            <button className={`${styles.actBtn} ${styles.actPrimary}`} onClick={(e) => { e.stopPropagation(); onUse(defaultPayload(a)) }}>
              使用
            </button>
            {/* 「其他」多数是存进来的成品、本来没有提示词；回存时带了提示词的才给入口 */}
            {(a.category !== 'other' || !!a.prompt?.trim()) && canViewPrompt(a) && (
              <button className={`${styles.actBtn} ${styles.actGhost}`} onClick={(e) => { e.stopPropagation(); setOpenPromptDirectly(true); setDetailAssetId(a.id) }}>
                提示词
              </button>
            )}
          </>
        ) : (
          <button className={`${styles.actBtn} ${styles.actGhost}`} onClick={(e) => { e.stopPropagation(); setOpenPromptDirectly(false); setDetailAssetId(a.id) }}>
            查看并使用
          </button>
        )}
      />
    )
  }

  /** 音频列表（对齐 Figma）：整行=试听按钮 + 名称 + 波形占位 + 时长 + 使用；整行可拖到画布。 */
  function renderAudioList(list: Asset[]) {
    return (
      <AudioList
        items={list}
        mode={{
          kind: 'canvas',
          onUse: (a) => onUse(audioPayload(a)),
          onDragStart: (e, a) => startDrag(e, audioPayload(a)),
        }}
      />
    )
  }

  // 「查看」= 就地进二级页：详情直接铺满浮层（替换列表），‹ 返回列表、✕ 关整扇浮层。
  // 详情复用现成 AssetDetail（onUse 触发画布专用布局）；素模 / 造型 = 图片节点，音色 = 音频节点。
  if (detailAssetId) {
    const detailAsset = world.assets.find((x) => x.id === detailAssetId)
    return (
      <AssetDetail
        key={`${detailAssetId}-${openPromptDirectly ? 'prompt' : 'detail'}`}
        assetId={detailAssetId}
        openBasePromptOnMount={openPromptDirectly}
        onBack={() => { setDetailAssetId(null); setOpenPromptDirectly(false) }}
        onClose={() => { setDetailAssetId(null); setOpenPromptDirectly(false); onClose?.() }}
        // 音色框可拖：落一个音频节点，带上可播放音源（previewUrl）
        onVoiceDragStart={(e) => {
          if (!detailAsset?.voice) return
          startDrag(e, {
            scope: detailAsset.scope,
            assetId: detailAsset.id,
            media: 'audio',
            name: `${detailAsset.name}·音色`,
            content: detailAsset.voice.previewUrl,
          })
        }}
        onUse={(u) => {
          const a = world.assets.find((x) => x.id === detailAssetId)
          if (!a) return
          if (u.text) {
            // 提示词 → 文本节点（v6）；文本不入库（categoriesForMedia('text')===[]），只当画布草稿。
            onUse({ scope: a.scope, assetId: a.id, media: 'text', name: u.text.name, content: u.text.content })
            setDetailAssetId(null)
            return
          }
          if (u.voice) {
            // 音色 → 音频节点（接台词那步才生成配音）
            onUse({ scope: a.scope, assetId: a.id, media: 'audio', name: u.voice.name, content: u.voice.url })
          } else {
            // 素模 / 造型 → 图片节点（media 按资产类型推导，不写死）
            onUse({
              scope: a.scope,
              assetId: a.id,
              media: mediaOf(a),
              name: u.lookName ? `${a.name}·${u.lookName}` : a.name,
              cover: u.cover,
            })
          }
          setDetailAssetId(null)
        }}
      />
    )
  }

  return (
    <div className={styles.panel}>
      {/* 滚动体：标题 / 分段 / 类目 / 搜索 / 网格都在这里滚；底部固定条（选图模式）是它的兄弟节点，
          不随内容滚动，也不会被内容穿透（旧版 sticky footer 在内容不足时会浮到中间、内容多时又漏出底边）。 */}
      <div className={styles.scrollBody}>
      {/* 标题行：「资产」（左） + 小字说明（右上角）。小字放右上是为了让标题行高恒定，
          切换 tab 时小字显隐不会把下面的分段/类目顶得上下跳。
          项目库=当前项目名；团队库=当前团队库；广场/搜索不显示。 */}
      <div className={styles.titleRow}>
        <h2 className={styles.title}>资产</h2>
        {!searching && scope !== 'plaza' && (
          <p className={styles.subtitle}>
            {scope === 'project' ? (
              <>当前项目<span className={styles.subtitleChip}>{projectName}</span>的资产</>
            ) : (
              '当前团队库的资产'
            )}
          </p>
        )}
      </div>

      {/* 来源分段 项目库/团队库/广场（在标题下、类目上，左对齐独立一行） */}
      <div className={`${styles.scopes} ${searching ? styles.scopesSearching : ''}`}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            className={`${styles.scopeBtn} ${scope === s.key ? styles.scopeOn : ''}`}
            disabled={searching}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 类目筛选：青色下划线 Tab（对齐 Figma 头部）。选图模式隐藏「音频」「其他」（只挑图片作参考 · 5a）。 */}
      <div className={styles.catTabs} role="tablist">
        {CATEGORY_TABS.filter((t) => !picking || (t.value !== 'audio' && t.value !== 'other')).map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={category === t.value}
            className={`${styles.catTab} ${category === t.value ? styles.catTabOn : ''}`}
            onClick={() => setCategory(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索框：Figma 半透明 pill */}
      <div className={styles.search}>
        <img className={styles.searchIcon} src={assetUrl('assets/icons/search.svg')} alt="" aria-hidden />
        <input
          className={styles.searchInput}
          placeholder="您可以在这里搜索资产名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 图片走卡片网格（照旧），音频走条状列表；「全部」类目下按「图片资产 N / 音频 N」分区（对齐 Figma）。 */}
      {items.length === 0 ? (
        <div className={styles.empty}>{searching ? '没有匹配的资产' : '这一层暂无可见资产'}</div>
      ) : searching ? (
        <div className={styles.searchGroups}>
          {groupedItems.map((group) => {
            if (group.items.length === 0) return null
            const imgs = group.items.filter((a) => !isAudioAsset(a))
            const auds = group.items.filter((a) => isAudioAsset(a))
            return (
              <section key={group.key} className={styles.searchGroup}>
                <h3 className={styles.groupTitle}>{group.label}</h3>
                {imgs.length > 0 && <div className={styles.grid}>{imgs.map(renderCard)}</div>}
                {auds.length > 0 && renderAudioList(auds)}
              </section>
            )
          })}
        </div>
      ) : category === 'audio' ? (
        renderAudioList(items)
      ) : category === 'all' ? (
        <>
          {imageItems.length > 0 && (
            <>
              {sectionHead('图片资产', imageItems.length)}
              <div className={styles.grid}>{imageItems.map(renderCard)}</div>
            </>
          )}
          {audioItems.length > 0 && (
            <>
              {sectionHead('音频', audioItems.length, imageItems.length > 0)}
              {renderAudioList(audioItems)}
            </>
          )}
        </>
      ) : category === 'other' ? (
        // 「其他」按媒介分区（与项目资产库一致）：图片 → 视频 → 文本，从上到下（不含音频）。
        <>
          {[
            { key: 'image', label: '图片', items: items.filter((a) => (a.fields.media ?? 'image') === 'image') },
            { key: 'video', label: '视频', items: items.filter((a) => a.fields.media === 'video') },
            { key: 'text', label: '文本', items: items.filter((a) => a.fields.media === 'text') },
          ]
            .filter((g) => g.items.length > 0)
            .map((g, i) => (
              <div key={g.key}>
                {sectionHead(g.label, g.items.length, i > 0)}
                <div className={styles.grid}>{g.items.map(renderCard)}</div>
              </div>
            ))}
        </>
      ) : (
        // 前五类单类目：无音频，直接卡片网格。
        <div className={styles.grid}>{items.map(renderCard)}</div>
      )}
      </div>

      {/* 选图模式底部固定条：已选 N 张 · 取消 / 确定 */}
      {picking && (
        <div className={styles.pickBar}>
          <span className={styles.pickCount}>
            已选 <b>{pickedList.length}</b> 张{maxPick ? ` / 上限 ${maxPick}` : ''}
          </span>
          <div className={styles.pickBarBtns}>
            <button className={styles.pickCancel} onClick={() => onClose?.()}>取消</button>
            <button
              className={styles.pickConfirm}
              disabled={pickedList.length === 0}
              onClick={() => onPick?.(pickedList)}
            >
              确定（{pickedList.length}）
            </button>
          </div>
        </div>
      )}

      {/* 「其他」视频全屏播放器：点视频卡片即预览（音量 / 倍速 / 下载 / 扩大显示）。 */}
      {videoPreview && (
        <VideoLightbox
          src={videoPreview.src}
          poster={videoPreview.poster}
          name={videoPreview.name}
          onUse={() => { onUse(defaultPayload(videoPreview.asset)); setVideoPreview(null) }}
          onClose={() => setVideoPreview(null)}
          onDownload={() => {
            const url = videoPreview.src || videoPreview.poster
            if (!url) return
            const el = document.createElement('a')
            el.href = url
            el.download = videoPreview.name || 'video'
            document.body.appendChild(el)
            el.click()
            el.remove()
          }}
        />
      )}

      {/* 「其他」文本全文弹窗：点文本卡片 / 点「查看」即看全文，底部可「复制 / 使用」。 */}
      {textPreview && (
        <TextLightbox
          name={textPreview.name}
          text={textPreview.text}
          onClose={() => setTextPreview(null)}
          onUse={() => { onUse(defaultPayload(textPreview.asset)); setTextPreview(null) }}
        />
      )}
    </div>
  )
}
