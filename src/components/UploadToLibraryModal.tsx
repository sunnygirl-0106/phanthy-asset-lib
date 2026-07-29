/**
 * 【画布 · 入口一】UploadToLibraryModal —— 上传到项目资产库的弹窗
 *
 * 按媒介给类目（技术规划 §2.1）：
 *   · 图片 → 让用户选 角色 / 服装 / 场景 / 道具
 *   · 音频 → 直接落"音频"类目
 * 图片落"角色"的特殊分叉：作为素模（v5：一律新建角色）或作为造型（追加到已有角色）。
 * 其它四类都是单份直接成一份资产。
 *
 * 本组件只负责"收集用户填的规格 spec"，真正提交（runSaveToProject）交给上层。
 */

import { useState } from 'react'
import type { Category, Asset } from '../data/types'
import { categoriesForMedia, type CanvasNode, type SaveSpec } from '../services/canvasService'
import { Modal } from './Modal'
import styles from './UploadToLibraryModal.module.css'

const CAT_LABEL: Record<Category, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  audio: '音频',
}

export function UploadToLibraryModal({
  node,
  projectCharacters,
  onConfirm,
  onClose,
}: {
  node: CanvasNode
  projectCharacters: Asset[] // 本项目已有的角色（供"追加造型"选目标角色用）
  onConfirm: (spec: SaveSpec) => void
  onClose: () => void
}) {
  const allowed = categoriesForMedia(node.media)
  const [category, setCategory] = useState<Category>(allowed[0])
  const [name, setName] = useState(node.name)

  // 角色分叉的局部状态（v5：素模一律新建角色，取消"替换已有素模"）
  const [charAs, setCharAs] = useState<'baseModel' | 'look'>('baseModel')
  const [targetCharId, setTargetCharId] = useState<string>(projectCharacters[0]?.id ?? '')
  const [lookName, setLookName] = useState(node.name)

  function confirm() {
    const spec = buildSpec()
    if (spec) onConfirm(spec)
  }

  /** 按当前选择拼出 SaveSpec；不合法（如要追加造型却没有可选角色）返回 null。 */
  function buildSpec(): SaveSpec | null {
    if (category !== 'character') {
      return { category, name: name.trim() || node.name }
    }
    if (charAs === 'baseModel') {
      // v5：素模一律新建角色。
      return { category: 'character', as: 'baseModel-new', name: name.trim() || node.name }
    }
    // 作为造型
    if (!targetCharId) return null
    return { category: 'character', as: 'look', targetCharId, lookName: lookName.trim() || node.name }
  }

  const needsTarget = category === 'character' && charAs === 'look'
  const noCharToTarget = needsTarget && projectCharacters.length === 0

  return (
    <Modal onClose={onClose}>
      <div className={styles.body}>
        <h2 className={styles.title}>上传到项目资产库</h2>
        <p className={styles.sub}>
          媒介：{node.media === 'image' ? '图片' : '音频'}（自动带上）· 类目由你选
        </p>

        {/* 类目选择 */}
        <div className={styles.field}>
          <label className={styles.label}>类目</label>
          <div className={styles.chips}>
            {allowed.map((c) => (
              <button
                key={c}
                className={`${styles.chip} ${category === c ? styles.chipOn : ''}`}
                onClick={() => setCategory(c)}
                disabled={allowed.length === 1}
              >
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {/* 角色分叉 */}
        {category === 'character' ? (
          <>
            <div className={styles.field}>
              <label className={styles.label}>作为</label>
              <div className={styles.chips}>
                <button className={`${styles.chip} ${charAs === 'baseModel' ? styles.chipOn : ''}`} onClick={() => setCharAs('baseModel')}>素模</button>
                <button className={`${styles.chip} ${charAs === 'look' ? styles.chipOn : ''}`} onClick={() => setCharAs('look')}>造型</button>
              </div>
            </div>

            {/* 新建角色：填名字（v5：画布上传素模一律新建角色）*/}
            {charAs === 'baseModel' && (
              <div className={styles.field}>
                <label className={styles.label}>新角色名</label>
                <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}

            {/* 追加造型：选目标角色 */}
            {needsTarget && (
              <div className={styles.field}>
                <label className={styles.label}>目标角色</label>
                {noCharToTarget ? (
                  <div className={styles.note}>本项目还没有角色，先"新建角色"吧。</div>
                ) : (
                  <select className={styles.input} value={targetCharId} onChange={(e) => setTargetCharId(e.target.value)}>
                    {projectCharacters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* 追加造型：造型名 */}
            {charAs === 'look' && !noCharToTarget && (
              <div className={styles.field}>
                <label className={styles.label}>造型名</label>
                <input className={styles.input} value={lookName} onChange={(e) => setLookName(e.target.value)} />
              </div>
            )}
          </>
        ) : (
          <div className={styles.field}>
            <label className={styles.label}>名称</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>取消</button>
          <button className={styles.btn} onClick={confirm} disabled={noCharToTarget}>确认上传</button>
        </div>
      </div>
    </Modal>
  )
}
