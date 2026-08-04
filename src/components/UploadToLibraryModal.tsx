/**
 * 【画布 · 入口一】UploadToLibraryModal —— 右键节点「保存到资产库」的弹窗
 *
 * 一个「资产名称 + 资产标签」两段式表单。
 *   · 资产名称：必填，单行输入。
 *   · 资产标签：五个类目大按钮（角色 / 道具 / 服装 / 场景 / 音频）二选一。
 *     选中任一类目后，按钮内联展开「保存方式」浮层（v7 概念调整）：
 *       - 新建：把这张图/这段音当成一份全新的顶层资产。
 *       - 关联已有：再在浮层里挑一个已有的同类资产，把它挂上去作为一张子资产（变体/造型）。
 *     旧版「素模 / 造型」是角色专属的，但场景/道具等同样可能有多张资产，
 *     所以统一成对所有类目通用的「新建 / 关联已有」。
 *     选定后按钮内出现小胶囊：「新建」或「关联 · 古镇街道」。
 *
 * 类目受节点媒介约束（categoriesForMedia）：不允许的类目按钮置灰。
 * 本组件只收集用户填的规格 spec，真正提交（runSaveToProject）交给上层。
 */

import { useState } from 'react'
import type { Category, Asset, AssetFields } from '../data/types'
import { categoriesForMedia, type CanvasNode, type SaveSpec } from '../services/canvasService'
import { Modal } from './Modal'
import styles from './UploadToLibraryModal.module.css'

const CAT_LABEL: Record<Category, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  audio: '音频',
  other: '其他',
}

// 标签网格的固定展示顺序（对齐设计稿）：角色 / 道具 / 服装 / 场景，末尾单独隔出「其他」。
// 音频不再走本弹窗（R4：音频右键保存改走 SaveAudioModal 二选一），故这里移除音频瓷砖。
// 「其他」是另一层东西（创作留存物），视觉上与前四类拉开——满幅一行、上方加分隔（见 tileWrapOther）。
const TILE_ORDER: Category[] = ['character', 'prop', 'costume', 'scene', 'other']

type SaveMode = 'new' | 'link'
type OpenMenu = 'mode' | 'pick' | null

export function UploadToLibraryModal({
  node,
  projectAssets,
  onConfirm,
  onClose,
}: {
  node: CanvasNode
  projectAssets: Asset[] // 本项目已有资产，供「关联已有」按类目挑关联目标
  onConfirm: (spec: SaveSpec) => void
  onClose: () => void
}) {
  const allowed = categoriesForMedia(node.media)

  /**
   * 「去处唯一就不问」（R4 延伸规则）：
   * 视频 / 文本节点只有「其他」一个去处，再让用户去点一个只有一个选项的类目选择器
   * 纯属白费一次点击 —— 此时跳过类目选择，直接填名字。
   * 音频节点永远不会走到本弹窗（由 CanvasShell.openSaveFor 分流到 SaveAudioModal）。
   */
  const soleCategory: Category | null = allowed.length === 1 ? allowed[0] : null

  const [name, setName] = useState(soleCategory ? node.name : '')
  const [category, setCategory] = useState<Category | null>(soleCategory)
  const [mode, setMode] = useState<SaveMode | null>(soleCategory ? 'new' : null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [menu, setMenu] = useState<OpenMenu>(null)

  // 当前类目下、本项目已有的同类顶层资产（供「关联已有」挑目标）。
  const linkTargets = category
    ? projectAssets.filter((a) => a.category === category)
    : []
  const targetAsset = linkTargets.find((a) => a.id === targetId) ?? null

  /** 点某个类目大按钮：选中它，并展开/收起「保存方式」浮层。 */
  function pickCategory(c: Category) {
    if (!allowed.includes(c)) return
    // 「其他」只支持「新建」（没有子资产概念，§4.2）：点中直接视为 mode:'new'，不展开保存方式浮层。
    if (c === 'other') {
      setCategory(c)
      setMode('new')
      setTargetId(null)
      setMenu(null)
      return
    }
    if (category === c) {
      // 再点已选中的类目 = 收/放「保存方式」浮层。
      setMenu((m) => (m ? null : 'mode'))
      return
    }
    // 切到新类目：清掉上一个类目的保存方式/目标，展开「保存方式」。
    setCategory(c)
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

  /** 「选择已有…」里挑一个关联目标。 */
  function pickTarget(id: string) {
    setTargetId(id)
    setMenu(null)
  }

  /**
   * 「其他」类目落库时随手带上的媒介信息（§4.2.3）：
   *   media 取自 node.media；文本存 fields.text；视频把视频/音源地址存 fields.videoUrl（demo 可空占位）。
   */
  function otherExtraFields(): AssetFields | undefined {
    if (category !== 'other') return undefined
    const media = node.media as 'image' | 'video' | 'text'
    const f: AssetFields = { media }
    if (media === 'text') f.text = node.content ?? ''
    if (media === 'video') f.videoUrl = node.content ?? ''
    return f
  }

  /** 按当前选择拼出 SaveSpec；不合法返回 null。 */
  function buildSpec(): SaveSpec | null {
    const finalName = name.trim()
    if (!finalName || !category || !mode) return null
    const extraFields = otherExtraFields()
    if (mode === 'new') return { category, mode: 'new', name: finalName, extraFields }
    if (mode === 'link' && targetId) return { category, mode: 'link', targetId, name: finalName, extraFields }
    return null
  }

  const spec = buildSpec()

  return (
    <Modal onClose={onClose} hideClose panelClassName={styles.panel}>
      <div className={styles.body}>
        {/* 头部 */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            保存到资产库{soleCategory ? ` · ${CAT_LABEL[soleCategory]}` : ''}
          </h2>
          <button className={styles.close} onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className={styles.content}>
          {/* 资产名称 */}
          <div className={styles.field}>
            <label className={styles.label}>
              资产名称 <span className={styles.req}>*</span>
            </label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                soleCategory === 'other'
                  ? '请输入名称，例如：第一幕分镜 / 追逐戏片段 / 开场台词'
                  : '请输入资产名称，例如：主角运动背心/跑步鞋/场景长椅'
              }
              autoFocus
            />
          </div>

          {/* 资产标签：去处唯一（视频 / 文本 → 其他）时整块不渲染，只给一行说明 */}
          {soleCategory ? (
            <div className={styles.field}>
              <div className={styles.otherHint}>
                创作留存物（分镜 / 视频片段 / 台词）仅归档于本项目，不存入团队库
              </div>
            </div>
          ) : (
          <div className={styles.field}>
            <label className={styles.label}>资产标签</label>
            <div className={styles.grid}>
              {TILE_ORDER.map((c) => {
                const on = category === c
                const disabled = !allowed.includes(c)
                const isOther = c === 'other'
                return (
                  <div key={c} className={`${styles.tileWrap} ${isOther ? styles.tileWrapOther : ''}`}>
                    {/* 「其他」与前四类之间的分隔：一行小字，暗示"这不是同一层的东西" */}
                    {isOther && <div className={styles.otherHint}>创作留存物（分镜 / 视频片段 / 台词）仅归档于本项目，不存入团队库</div>}
                    <button
                      className={`${styles.tile} ${on ? styles.tileOn : ''}`}
                      onClick={() => pickCategory(c)}
                      disabled={disabled}
                    >
                      <span className={styles.tileTop}>
                        {CAT_LABEL[c]}
                        {/* 「其他」直接新建、无保存方式浮层，故不显示展开箭头 */}
                        {on && !isOther && <span className={styles.caret}>{menu ? '︿' : '﹀'}</span>}
                      </span>
                      {/* 选定保存方式后的小胶囊（「其他」恒为「新建」） */}
                      {on && mode && (
                        <span className={styles.subPill}>
                          {mode === 'new'
                            ? '新建'
                            : targetAsset
                              ? `关联 · ${targetAsset.name}`
                              : '关联已有'}
                        </span>
                      )}
                    </button>

                    {/* 「保存方式」浮层（「其他」不展开） */}
                    {on && !isOther && menu === 'mode' && (
                      <div className={styles.pop}>
                        <div className={styles.popTitle}>保存方式</div>
                        <button className={styles.popItem} onClick={() => pickMode('new')}>新建</button>
                        <button className={styles.popItem} onClick={() => pickMode('link')}>关联已有</button>
                      </div>
                    )}

                    {/* 「选择已有…」浮层 */}
                    {on && menu === 'pick' && (
                      <div className={`${styles.pop} ${styles.popMatch}`}>
                        <div className={styles.popTitle}>选择已有{CAT_LABEL[c]}</div>
                        {linkTargets.length === 0 ? (
                          <div className={styles.popEmpty}>本项目还没有{CAT_LABEL[c]}</div>
                        ) : (
                          linkTargets.map((a) => (
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
          </div>
          )}
        </div>

        {/* 底部动作 */}
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>取消</button>
          <button className={styles.btn} onClick={() => spec && onConfirm(spec)} disabled={!spec}>
            确认添加
          </button>
        </div>
      </div>
    </Modal>
  )
}
