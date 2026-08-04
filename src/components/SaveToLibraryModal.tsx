/**
 * 【画布 · 入口一 · 统一保存弹窗（方案二）】SaveToLibraryModal
 *
 * 把此前按媒介分叉的三种保存形态（图片类目瓷砖 / 音频二选一 / 视频文本简版命名），
 * 收敛成一个统一的心智模型：填名字 → 选去处 →（如果这个去处需要）挑一个挂载目标。
 *
 * 三段式结构（永远这三段，第三段按需出现）：
 *   ① 名称 *
 *   ② 存到哪里（去处瓷砖，来自 destinationsForMedia）
 *   ③ 选中的去处需要挂载目标时，浮层里挑一个已有资产 / 角色
 *
 * 关键洞察：「关联已有」和「角色音色」是同一个形状——都是"把这个东西挂到一个已存在的资产身上"。
 *   · 图片 + 关联已有 → 挂到某个角色/场景下，成为它的一张造型/样式（→ runSaveToProject link）
 *   · 音频 + 角色音色 → 挂到某个角色上，成为它的音色（→ setVoice，不产生资产）
 * 所以两者长得一样，只是产出意图不同——用可辨识联合 SaveIntent 交给上层分派。
 *
 * 本组件只收集用户选择、拼出 intent，不直接调 store（与旧两个弹窗一致的职责边界）。
 */

import { useState } from 'react'
import type { Asset, AssetFields, Category, Voice } from '../data/types'
import { destinationsForMedia, type CanvasNode, type Destination, type SaveSpec } from '../services/canvasService'
import { Modal } from './Modal'
import styles from './SaveToLibraryModal.module.css'

/**
 * 上层要处理的两种意图：
 *   · asset → runSaveToProject（图片/视频/文本/音频素材，落项目库）
 *   · voice → setVoice（角色音色，挂到角色身上，不产生 audio 资产）
 */
export type SaveIntent =
  | { kind: 'asset'; spec: SaveSpec }
  | { kind: 'voice'; roleId: string; voice: Voice }

const DEST_LABEL: Record<Destination, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  audio: '音频素材',
  other: '其他',
  voice: '角色音色',
}

type SaveMode = 'new' | 'link'
type OpenMenu = 'mode' | 'pick' | null

/** 「其他」是"另一层东西"（创作留存物），视觉上与前面的项拉开（分隔线 + 独立成行）。 */
function isSpecialDest(d: Destination): boolean {
  return d === 'other'
}

/** 四个视觉类目支持「新建 / 关联已有」二级选择；其它去处直接新建或另有形状。 */
function supportsLink(d: Destination): boolean {
  return d === 'character' || d === 'costume' || d === 'scene' || d === 'prop'
}

export function SaveToLibraryModal({
  node,
  projectAssets,
  characters,
  onConfirm,
  onClose,
}: {
  node: CanvasNode
  projectAssets: Asset[] // 「关联已有」按类目挑目标
  characters: Asset[] // 「角色音色」挑目标角色
  onConfirm: (intent: SaveIntent) => void
  onClose: () => void
}) {
  const dests = destinationsForMedia(node.media)

  /**
   * 「去处唯一就不问」（务必保留的规则）：
   * 视频 / 文本只有「其他」一个去处，此时不渲染瓷砖区，标题写「保存到资产库 · 其他」，直接填名字。
   */
  const soleDest: Destination | null = dests.length === 1 ? dests[0] : null

  // 预填规则：去处唯一时预填 node.name，否则留空。
  const [name, setName] = useState(soleDest ? node.name : '')
  const [dest, setDest] = useState<Destination | null>(soleDest)
  const [mode, setMode] = useState<SaveMode | null>(soleDest ? 'new' : null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [menu, setMenu] = useState<OpenMenu>(null)

  // 需要挑挂载目标的两种情形：类目的「关联已有」（同类顶层资产）、或「角色音色」（本项目角色）。
  const pickList: Asset[] =
    dest === 'voice'
      ? characters
      : dest && mode === 'link'
        ? projectAssets.filter((a) => a.category === dest)
        : []
  const targetAsset = pickList.find((a) => a.id === targetId) ?? null

  // 角色音色专属：目标角色 + 两条提示（防呆 / 替换），从 SaveAudioModal 原样搬来。
  const voiceRole = dest === 'voice' ? characters.find((c) => c.id === targetId) : undefined
  // 防呆：这段音频的血缘正指向所选角色（多半就是该角色音色生成的），设为自己的音色没意义。
  const isSelfSource = dest === 'voice' && !!node.source && node.source.assetId === targetId

  /** 点某个去处瓷砖：选中它，并按去处类型决定要不要展开二级浮层。 */
  function pickDest(d: Destination) {
    if (!dests.includes(d)) return
    // 「其他」/「音频素材」：直接新建，没有子资产概念，不展开浮层。
    if (d === 'other' || d === 'audio') {
      setDest(d)
      setMode('new')
      setTargetId(null)
      setMenu(null)
      return
    }
    // 「角色音色」：形状同「关联已有」——选中即展开挑角色浮层（mode 不参与，走 voice 意图）。
    if (d === 'voice') {
      setDest(d)
      setMode(null)
      setTargetId(null)
      setMenu('pick')
      return
    }
    // 四个视觉类目：可「新建 / 关联已有」。
    if (dest === d) {
      // 再点已选中的类目 = 收/放「保存方式」浮层。
      setMenu((m) => (m ? null : 'mode'))
      return
    }
    setDest(d)
    setMode(null)
    setTargetId(null)
    setMenu('mode')
  }

  /** 「保存方式」里选 新建 / 关联已有。 */
  function pickMode(m: SaveMode) {
    setMode(m)
    setTargetId(null)
    setMenu(m === 'link' ? 'pick' : null) // 关联已有还要挑目标，新建到此为止
  }

  /** 「选择已有…」/「选择目标角色」里挑一个目标。 */
  function pickTarget(id: string) {
    setTargetId(id)
    setMenu(null)
  }

  /**
   * 「其他」类目落库时随手带上的媒介信息（原样搬自 UploadToLibraryModal）：
   *   media 取自 node.media；文本存 fields.text；视频把视频/音源地址存 fields.videoUrl（demo 可空占位）。
   */
  function otherExtraFields(): AssetFields | undefined {
    if (dest !== 'other') return undefined
    const media = node.media as 'image' | 'video' | 'text'
    const f: AssetFields = { media }
    if (media === 'text') f.text = node.content ?? ''
    if (media === 'video') f.videoUrl = node.content ?? ''
    return f
  }

  /** 按当前选择拼出 SaveIntent；不合法返回 null。 */
  function buildIntent(): SaveIntent | null {
    const finalName = name.trim()
    if (!finalName || !dest) return null

    // 角色音色：构造一个 cloned Voice（原样搬自 SaveAudioModal），交给 setVoice。
    if (dest === 'voice') {
      if (!targetId || isSelfSource) return null
      const voice: Voice = {
        id: `cloned_${Date.now()}`,
        type: 'cloned',
        name: finalName,
        previewUrl: node.content ?? '', // 占位：回放这段音频节点的音源
        sampleUrl: node.content ?? '',
        providerVoiceId: undefined, // 待接入语音模型
      }
      return { kind: 'voice', roleId: targetId, voice }
    }

    // 资产类去处（角色/服装/场景/道具/其他/音频素材）。
    const category = dest as Category
    const extraFields = otherExtraFields()
    if (mode === 'new') return { kind: 'asset', spec: { category, mode: 'new', name: finalName, extraFields } }
    if (mode === 'link' && targetId)
      return { kind: 'asset', spec: { category, mode: 'link', targetId, name: finalName, extraFields } }
    return null
  }

  const intent = buildIntent()

  // 名称字段的语义随去处变（2.4）。
  const nameLabel = dest === 'voice' ? '音色名称' : '资产名称'
  const namePlaceholder =
    dest === 'voice'
      ? '如：男主 · 磁性低音'
      : dest === 'other'
        ? '请输入名称，例如：第一幕分镜 / 追逐戏片段 / 开场台词'
        : '请输入资产名称，例如：主角运动背心/跑步鞋/场景长椅'

  /** 某个去处瓷砖上的小胶囊文案（选定后出现）。 */
  function pillText(d: Destination): string | null {
    if (d === 'voice') return targetAsset ? `设为 · ${targetAsset.name}` : null
    if (!mode) return null
    if (mode === 'new') return '新建'
    return targetAsset ? `关联 · ${targetAsset.name}` : '关联已有'
  }

  return (
    <Modal onClose={onClose} hideClose panelClassName={styles.panel}>
      <div className={styles.body}>
        {/* 头部 */}
        <div className={styles.header}>
          <h2 className={styles.title}>保存到资产库{soleDest ? ` · ${DEST_LABEL[soleDest]}` : ''}</h2>
          <button className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* ① 名称 */}
          <div className={styles.field}>
            <label className={styles.label}>
              {nameLabel} <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              autoFocus
            />
          </div>

          {/* ② 存到哪里：去处唯一（视频 / 文本 → 其他）时整块不渲染，只给一行说明 */}
          {soleDest ? (
            <div className={styles.field}>
              <div className={styles.otherHint}>
                创作留存物（分镜 / 视频片段 / 台词）仅归档于本项目，不存入团队库
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>资产分类</label>
              <div className={styles.grid}>
                {dests.map((d) => {
                  const on = dest === d
                  const special = isSpecialDest(d)
                  const hasMode = supportsLink(d)
                  return (
                    <div key={d} className={`${styles.tileWrap} ${special ? styles.tileWrapOther : ''}`}>
                      {/* 「其他」/「角色音色」与前面的项之间的分隔小字，暗示"这不是同一层的东西" */}
                      {d === 'other' && (
                        <div className={styles.otherHint}>
                          创作留存物（分镜 / 视频片段 / 台词）仅归档于本项目，不存入团队库
                        </div>
                      )}
                      <button
                        className={`${styles.tile} ${on ? styles.tileOn : ''}`}
                        onClick={() => pickDest(d)}
                      >
                        <span className={styles.tileTop}>
                          {DEST_LABEL[d]}
                          {/* 只有带「新建/关联已有」二级的类目才显示展开箭头 */}
                          {on && hasMode && <span className={styles.caret}>{menu ? '︿' : '﹀'}</span>}
                        </span>
                        {/* 选定后的小胶囊 */}
                        {on && pillText(d) && <span className={styles.subPill}>{pillText(d)}</span>}
                      </button>

                      {/* 「保存方式」浮层（仅四个视觉类目） */}
                      {on && hasMode && menu === 'mode' && (
                        <div className={styles.pop}>
                          <div className={styles.popTitle}>保存方式</div>
                          <button className={styles.popItem} onClick={() => pickMode('new')}>
                            新建
                          </button>
                          <button className={styles.popItem} onClick={() => pickMode('link')}>
                            关联已有
                          </button>
                        </div>
                      )}

                      {/* 挑挂载目标浮层：类目的「关联已有」/「角色音色」共用同一形状 */}
                      {on && menu === 'pick' && (
                        <div className={`${styles.pop} ${styles.popMatch}`}>
                          <div className={styles.popTitle}>
                            {d === 'voice' ? '选择目标角色' : `选择已有${DEST_LABEL[d]}`}
                          </div>
                          {pickList.length === 0 ? (
                            <div className={styles.popEmpty}>
                              {d === 'voice' ? '本项目还没有角色' : `本项目还没有${DEST_LABEL[d]}`}
                            </div>
                          ) : (
                            pickList.map((a) => (
                              <button
                                key={a.id}
                                className={`${styles.matchItem} ${targetId === a.id ? styles.matchItemOn : ''}`}
                                onClick={() => pickTarget(a.id)}
                              >
                                <span className={styles.avatar}>{a.name.slice(0, 1)}</span>
                                <span className={styles.matchName}>{a.name}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 角色音色的两条提示（防呆 / 替换）：选了目标角色后出现 */}
              {dest === 'voice' && targetId && (
                <>
                  {isSelfSource && (
                    <p className={styles.warn}>这段音频由该角色的音色生成，无需再设为音色。</p>
                  )}
                  {voiceRole?.voice && !isSelfSource && (
                    <p className={styles.warn}>将替换现有音色「{voiceRole.voice.name}」。</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 底部动作 */}
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            取消
          </button>
          <button className={styles.btn} onClick={() => intent && onConfirm(intent)} disabled={!intent}>
            确认添加
          </button>
        </div>
      </div>
    </Modal>
  )
}
