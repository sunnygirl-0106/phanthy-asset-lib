/**
 * 【统一上传弹窗（0810）】AssetSaveModal —— 层 → 类目 → 名称 →（仅项目库）保存方式
 *
 * 三处调用共用同一个弹窗，靠 SaveSource 区分来源、靠 allowedScopes 决定能存到哪几层：
 *   · 画布右键保存（canvasNode）：allowedScopes = scopesForNode(node)
 *   · 项目库工具条「上传素材」（localFile）：allowedScopes = ['project','team','plaza']
 *   · 详情页单图送出（libraryImage）：allowedScopes = ['team'] 或 ['plaza']（不出层选择段）
 *
 * 弹窗只收集选择、拼出 SaveIntent 交给上层分派：
 *   · project → runSaveToProject / setVoice
 *   · flat    → runSendImage（存入团队库 / 贡献广场，最小单位是图）
 */

import { useMemo, useState } from 'react'
import type { Asset, AssetFields, Category, Scope, User, Voice, FlatImagePayload } from '../data/types'
import {
  destinationsForScope,
  libraryHasSameName,
  plazaHasSameNameBySubmitter,
  type CanvasNode,
  type Destination,
  type Media,
  type SaveSpec,
} from '../services/canvasService'
import { Modal } from './Modal'
import styles from './AssetSaveModal.module.css'

/** 上传来源：画布节点 / 本地文件 / 库内单图。 */
export type SaveSource =
  | { kind: 'canvasNode'; node: CanvasNode }
  | { kind: 'localFile'; url: string; media: Media; defaultName?: string }
  | { kind: 'libraryImage'; assetId: string; url: string; category: Category; defaultName: string; prompt?: string; voice?: Voice }

/** 上层要处理的三种意图。 */
export type SaveIntent =
  | { kind: 'project'; spec: SaveSpec }                       // 落项目库，沿用 canvasService.SaveSpec
  | { kind: 'flat'; target: 'team' | 'plaza'; payload: FlatImagePayload; sourceAssetId?: string }
  | { kind: 'voice'; roleId: string; voice: Voice }

export interface AssetSaveModalProps {
  source: SaveSource
  projectId: string
  projectName: string
  /** 可选的目标层。库内单图送出时由调用方传 ['team'] 或 ['plaza']，弹窗就不出层选择段。 */
  allowedScopes: Scope[]
  defaultScope?: Scope
  projectAssets: Asset[]
  characters: Asset[]
  /** 用于实时重名校验：整个 world.assets + 当前账号。 */
  allAssets: Asset[]
  currentUser: User
  currentTeamId?: string
  onConfirm: (intent: SaveIntent) => void
  onClose: () => void
}

const SCOPE_LABEL: Record<Scope, string> = { project: '项目资产库', team: '团队资产库', plaza: '素材广场' }
const DEST_LABEL: Record<Destination, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具',
  audio: '音频素材', other: '其他', voice: '角色音色',
}

/** 四个视觉类目支持「新建 / 加入已有」二级选择。 */
function supportsLink(d: Destination): boolean {
  return d === 'character' || d === 'costume' || d === 'scene' || d === 'prop'
}

/**
 * 分类段永远展示的完整货架（按媒介取），不可选的置灰（0811 §5.3 / §5.4）。
 * 这是**渲染真相**：段里始终出现这些格子，用户看得到系统边界；
 * 可选性由 destinationsForScope（逻辑真相）判定，不可选的置灰 + 一句原因。
 * 视频 / 文本本无视觉类目，这里补出四个视觉占位格恒置灰，避免"分类段整段消失"。
 */
const CAT_SHELF: Record<Media, Destination[]> = {
  image: ['character', 'prop', 'costume', 'scene', 'other'],
  video: ['character', 'prop', 'costume', 'scene', 'other'], // 前四个恒置灰
  text: ['character', 'prop', 'costume', 'scene', 'other'], // 前四个恒置灰
  audio: ['audio', 'voice'],
}

/** 层选择段永远展示的完整货架，不可选的置灰（0811 §5.6）。 */
const SCOPE_SHELF: Scope[] = ['project', 'team', 'plaza']

export function AssetSaveModal({
  source,
  projectId,
  projectName,
  allowedScopes,
  defaultScope,
  projectAssets,
  characters,
  allAssets,
  currentUser,
  currentTeamId,
  onConfirm,
  onClose,
}: AssetSaveModalProps) {
  // ── 从来源派生出的不变量 ──
  const media: Media =
    source.kind === 'canvasNode' ? source.node.media : source.kind === 'localFile' ? source.media : 'image'
  const url = source.kind === 'canvasNode' ? source.node.cover ?? '' : source.url
  const sourceAssetId = source.kind === 'libraryImage' ? source.assetId : undefined
  const initName =
    source.kind === 'canvasNode' ? source.node.name : source.kind === 'libraryImage' ? source.defaultName : source.defaultName ?? ''

  // ── 本地态 ──
  const [scope, setScope] = useState<Scope>(defaultScope ?? allowedScopes[0])
  // 分类段：全集货架恒展示（allDests），可选性看 enabledDests（逻辑真相）。
  const allDests = CAT_SHELF[media]
  const enabledDests = destinationsForScope(media, scope)
  const isDestEnabled = (d: Destination) => enabledDests.includes(d)
  const soleDest: Destination | null = enabledDests.length === 1 ? enabledDests[0] : null
  const initDest: Destination | null =
    source.kind === 'libraryImage' && enabledDests.includes(source.category) ? source.category : soleDest
  const [name, setName] = useState(initName)
  const [dest, setDest] = useState<Destination | null>(initDest)
  const [mode, setMode] = useState<'new' | 'link' | null>(initDest && supportsLink(initDest) && scope === 'project' ? 'new' : initDest ? 'new' : null)
  const [targetId, setTargetId] = useState<string | null>(null)

  // ① 层选择段：库内单图送出（固定单层）不出；视频 / 文本只能落项目、层概念退化也不出；
  //    其余（图片 / 音频）恒展示三层货架，不可选的置灰（§5.6：allowedScopes 从"渲染哪几个"降级成"哪几个可点"）。
  const showScopeSeg = source.kind !== 'libraryImage' && media !== 'video' && media !== 'text'
  const isScopeEnabled = (s: Scope) => allowedScopes.includes(s)
  // ④ 保存方式段：仅项目库 + 四个视觉类目出现（团队库 / 广场概念不适用，整段消失）。
  const showModeSeg = scope === 'project' && !!dest && supportsLink(dest)

  /** 分类置灰原因（§5.3 表）。 */
  function destDisabledReason(d: Destination): string {
    if ((media === 'video' || media === 'text') && d !== 'other') {
      return media === 'video' ? '视频只能存进「其他」' : '文本只能存进「其他」'
    }
    if (d === 'other') return '「其他」只留在项目里'
    if (d === 'voice') return '音色只在项目里设置'
    return ''
  }

  /** 层置灰原因（§5.6）。 */
  function scopeDisabledReason(s: Scope): string {
    if (media === 'audio' && s !== 'project') return '音频暂时只能存在项目里'
    if (s === 'project') return '这个素材已经在项目库里了'
    return ''
  }

  // 分类段下方常驻说明（仅视频 / 文本：解释"为什么只有其他可选"）。
  const catNote =
    media === 'video' ? '视频跟着这个项目走，不进团队资产库和素材广场。'
    : media === 'text' ? '文本跟着这个项目走，不进团队资产库和素材广场。'
    : null
  // 层段下方常驻说明（仅音频）。
  const scopeNote = media === 'audio' ? '音频暂时只能存在项目里，团队资产库和素材广场的音频形态还在设计。' : null

  /** 切层：可选项全变了，重置类目 / 保存方式 / 目标。 */
  function pickScope(s: Scope) {
    setScope(s)
    const nextDests = destinationsForScope(media, s)
    const nd = nextDests.length === 1 ? nextDests[0] : null
    setDest(nd)
    setMode(nd ? 'new' : null)
    setTargetId(null)
  }

  function pickDest(d: Destination) {
    setDest(d)
    setTargetId(null)
    // 角色音色：走 voice 意图，无 new/link。
    setMode(d === 'voice' ? null : 'new')
  }

  // 「加入已有」的挑选目标（项目库同类顶层资产）；角色音色挑目标角色。
  const pickList: Asset[] =
    dest === 'voice' ? characters : scope === 'project' && dest && mode === 'link' ? projectAssets.filter((a) => a.category === dest) : []
  const targetAsset = pickList.find((a) => a.id === targetId) ?? null

  // 角色音色防呆：这段音频的血缘正指向所选角色。
  const isSelfSource =
    dest === 'voice' && source.kind === 'canvasNode' && !!source.node.source && source.node.source.assetId === targetId

  // ── ③ 名称实时重名校验（§5.3.4）──
  const nameError = useMemo(() => {
    const nm = name.trim()
    if (!nm) return null // 空不报错，只是按钮 disabled
    // 「加入已有资产的图片列表」加进去的是图，不是新顶层资产，不做重名校验。
    if (scope === 'project' && mode === 'link') return null
    if (dest === 'voice') return null
    if (scope === 'project')
      return libraryHasSameName(allAssets, 'project', projectId, nm) ? '该项目已有同名素材，请换个名字' : null
    if (scope === 'team')
      return currentTeamId && libraryHasSameName(allAssets, 'team', currentTeamId, nm) ? '团队资产库已有同名素材，请换个名字' : null
    return plazaHasSameNameBySubmitter(allAssets, currentUser.id, nm) ? '你已经投过同名的素材，请换个名字' : null
  }, [name, scope, mode, dest, projectId, currentTeamId, allAssets, currentUser.id])

  /** 「其他」落库时随手带上的媒介信息。 */
  function otherExtraFields(): AssetFields | undefined {
    if (dest !== 'other') return undefined
    const m = media as 'image' | 'video' | 'text'
    const f: AssetFields = { media: m }
    if (source.kind === 'canvasNode') {
      if (m === 'text') f.text = source.node.content ?? ''
      if (m === 'video') f.videoUrl = source.node.content ?? ''
    }
    return f
  }

  /** 按当前选择拼出 SaveIntent；不合法返回 null。 */
  function buildIntent(): SaveIntent | null {
    const finalName = name.trim()
    if (!finalName || !dest) return null

    // 角色音色（仅项目层）：构造一个 cloned Voice 交给 setVoice。
    if (dest === 'voice') {
      if (!targetId || isSelfSource || source.kind !== 'canvasNode') return null
      const voice: Voice = {
        id: `cloned_${Date.now()}`,
        type: 'cloned',
        name: finalName,
        previewUrl: source.node.content ?? '',
        sampleUrl: source.node.content ?? '',
        providerVoiceId: undefined,
      }
      return { kind: 'voice', roleId: targetId, voice }
    }

    const category = dest as Category

    if (scope === 'project') {
      const extraFields = otherExtraFields()
      if (mode === 'new') return { kind: 'project', spec: { category, mode: 'new', name: finalName, extraFields } }
      if (mode === 'link' && targetId) return { kind: 'project', spec: { category, mode: 'link', targetId, name: finalName, extraFields } }
      return null
    }

    // 团队库 / 广场：扁平化送一张图出去。
    if (!url) return null
    const payload: FlatImagePayload = {
      url,
      name: finalName,
      category,
      prompt: source.kind === 'libraryImage' ? source.prompt : undefined,
      voice: category === 'character' && source.kind === 'libraryImage' ? source.voice : undefined,
    }
    return { kind: 'flat', target: scope, payload, sourceAssetId }
  }

  const intent = buildIntent()

  // ── ⑤ 结果预期文案（0811 §5.2）：只在会发生用户没预料到的事时才出现，否则闭嘴。──
  const outcome = (() => {
    if (scope === 'team' && currentUser.role === 'sub') return '提交后由主账号确认'
    if (scope === 'plaza') return '提交后由平台审核'
    return null // 其余情况不说话
  })()

  const namePlaceholder = dest === 'voice' ? '如：男主 · 磁性低音' : '输入素材名称'

  return (
    <Modal onClose={onClose} hideClose panelClassName={styles.panel}>
      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>保存素材</h2>
          <button className={styles.close} onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className={`${styles.content} ${showScopeSeg ? styles.contentTall : ''}`}>
          {/* ① 存到哪一层（三层货架恒展示，不可选的置灰 + 原因） */}
          {showScopeSeg && (
            <div className={styles.field}>
              <label className={styles.label}>存到哪一层</label>
              <div className={styles.scopeRow}>
                {SCOPE_SHELF.map((s) => {
                  const on = isScopeEnabled(s)
                  return (
                    <button
                      key={s}
                      className={`${styles.scopeTile} ${scope === s ? styles.scopeTileOn : ''} ${on ? '' : styles.scopeTileOff}`}
                      disabled={!on}
                      title={on ? undefined : scopeDisabledReason(s)}
                      onClick={() => on && pickScope(s)}
                    >
                      {SCOPE_LABEL[s]}
                      {s === 'project' && <span className={styles.scopeSub}>{projectName}</span>}
                    </button>
                  )
                })}
              </div>
              {scopeNote && <div className={styles.segNote}>{scopeNote}</div>}
            </div>
          )}

          {/* ② 分类（全集货架恒展示，不可选的置灰 + 原因；不再整段消失） */}
          <div className={styles.field}>
            <label className={styles.label}>分类</label>
            <div className={styles.catRow}>
              {allDests.map((d) => {
                const on = isDestEnabled(d)
                return (
                  <button
                    key={d}
                    className={`${styles.catChip} ${dest === d ? styles.catChipOn : ''} ${on ? '' : styles.catChipOff}`}
                    disabled={!on}
                    title={on ? undefined : destDisabledReason(d)}
                    onClick={() => on && pickDest(d)}
                  >
                    {DEST_LABEL[d]}
                  </button>
                )
              })}
            </div>
            {catNote && <div className={styles.segNote}>{catNote}</div>}
            {/* 角色音色：挑目标角色 + 防呆提示 */}
            {dest === 'voice' && (
              <div className={styles.pickList}>
                <div className={styles.popTitle}>选择目标角色</div>
                {characters.length === 0 ? (
                  <div className={styles.popEmpty}>本项目还没有角色</div>
                ) : (
                  characters.map((a) => (
                    <button
                      key={a.id}
                      className={`${styles.matchItem} ${targetId === a.id ? styles.matchItemOn : ''}`}
                      onClick={() => setTargetId(a.id)}
                    >
                      <span className={styles.avatar}>{a.name.slice(0, 1)}</span>
                      <span className={styles.matchName}>{a.name}</span>
                    </button>
                  ))
                )}
                {isSelfSource && <p className={styles.warn}>这段音频由该角色的音色生成，无需再设为音色。</p>}
              </div>
            )}
          </div>

          {/* ③ 名称 */}
          {dest !== 'voice' && (
            <div className={styles.field}>
              <label className={styles.label}>名称 <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder}
                autoFocus
              />
              {nameError && <div className={styles.nameError}>{nameError}</div>}
            </div>
          )}
          {dest === 'voice' && (
            <div className={styles.field}>
              <label className={styles.label}>音色名称 <span className={styles.req}>*</span></label>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} />
            </div>
          )}

          {/* ④ 保存方式（仅项目库 + 四视觉类目） */}
          {showModeSeg && (
            <div className={styles.field}>
              <label className={styles.label}>保存方式</label>
              <div className={styles.modeRow}>
                <button
                  className={`${styles.modeTile} ${mode === 'new' ? styles.modeTileOn : ''}`}
                  onClick={() => { setMode('new'); setTargetId(null) }}
                >
                  新建
                </button>
                <button
                  className={`${styles.modeTile} ${mode === 'link' ? styles.modeTileOn : ''}`}
                  onClick={() => setMode('link')}
                >
                  关联到已有素材
                  {targetAsset && <span className={styles.modeSub}>→ {targetAsset.name}</span>}
                </button>
              </div>
              {mode === 'link' && (
                <div className={styles.pickList}>
                  <div className={styles.popTitle}>加到哪一份</div>
                  {pickList.length === 0 ? (
                    <div className={styles.popEmpty}>这个项目里还没有可加入的素材</div>
                  ) : (
                    pickList.map((a) => (
                      <button
                        key={a.id}
                        className={`${styles.matchItem} ${targetId === a.id ? styles.matchItemOn : ''}`}
                        onClick={() => setTargetId(a.id)}
                      >
                        <span className={styles.avatar}>{a.name.slice(0, 1)}</span>
                        <span className={styles.matchName}>{a.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ⑤ 结果预期：槽位常驻（高度不变），只有会发生意外时才填内容 */}
        <div className={styles.outcomeSlot}>
          {outcome && <div className={styles.outcomeHint}>{outcome}</div>}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>取消</button>
          <button className={styles.btn} onClick={() => intent && onConfirm(intent)} disabled={!intent || !!nameError}>
            保存
          </button>
        </div>
      </div>
    </Modal>
  )
}
