/**
 * 【画布 · 入口一 · 音频专用】SaveAudioModal —— 右键音频节点「保存到资产库」的二选一弹窗（R4）
 *
 * 音频不走图片那套「类目瓷砖 + 新建/关联」弹窗，而是按【用途】二选一：
 *   ① 音频素材：台词 / BGM / 音效，存入项目资产库（可选：关联到某个角色）。
 *      → 走现有 runSaveToProject(node, pid, { category:'audio', mode:'new', name, roleId? })。
 *   ② 角色音色：用这段声音作为某个角色的音色（复刻样本）。
 *      → 构造一个 cloned Voice，调 setVoice 落到该角色；此路径不产生 audio 资产。
 *
 * 本组件只收集用户选择、拼出 spec / voice 交给上层提交（与 UploadToLibraryModal 一致的职责边界）。
 */

import { useState } from 'react'
import type { Asset, Voice } from '../data/types'
import type { CanvasNode, SaveSpec } from '../services/canvasService'
import { Modal } from './Modal'
import styles from './SaveAudioModal.module.css'

type Purpose = 'asset' | 'voice' | null

export function SaveAudioModal({
  node,
  characters,
  onSaveAsset,
  onSetVoice,
  onClose,
}: {
  node: CanvasNode
  /** 本项目的角色列表（scope=project & category=character），供「关联角色」/「设为音色」下拉。 */
  characters: Asset[]
  onSaveAsset: (spec: SaveSpec) => void
  onSetVoice: (roleId: string, voice: Voice) => void
  onClose: () => void
}) {
  const [purpose, setPurpose] = useState<Purpose>(null)
  // ① 音频素材：名称（必填，预填节点名）
  const [name, setName] = useState(node.name)
  // ② 角色音色：目标角色 + 音色命名（预填节点名）
  const [voiceRoleId, setVoiceRoleId] = useState('')
  const [voiceName, setVoiceName] = useState(node.name)

  const voiceRole = characters.find((c) => c.id === voiceRoleId)
  // 防呆：这段音频的血缘正指向所选角色（多半就是该角色音色生成的），设为自己的音色没意义。
  const isSelfSource = !!node.source && node.source.assetId === voiceRoleId

  function confirmAsset() {
    const finalName = name.trim()
    if (!finalName) return
    onSaveAsset({ category: 'audio', mode: 'new', name: finalName })
  }

  function confirmVoice() {
    if (!voiceRoleId || isSelfSource) return
    const voice: Voice = {
      id: `cloned_${Date.now()}`,
      type: 'cloned',
      name: voiceName.trim() || node.name,
      previewUrl: node.content ?? '', // 占位：回放这段音频节点的音源
      sampleUrl: node.content ?? '',
      providerVoiceId: undefined, // 待接入语音模型
    }
    onSetVoice(voiceRoleId, voice)
  }

  return (
    <Modal onClose={onClose} hideClose panelClassName={styles.panel}>
      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>把这段音频保存为——</h2>
          <button className={styles.close} onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className={styles.content}>
          {/* 两张大选项卡 */}
          <div className={styles.choices}>
            <button
              className={`${styles.choice} ${purpose === 'asset' ? styles.choiceOn : ''}`}
              onClick={() => setPurpose('asset')}
            >
              <span className={styles.choiceHead}>① 音频素材</span>
              <span className={styles.choiceDesc}>台词 / BGM / 音效，存入项目资产库</span>
            </button>
            <button
              className={`${styles.choice} ${purpose === 'voice' ? styles.choiceOn : ''}`}
              onClick={() => setPurpose('voice')}
            >
              <span className={styles.choiceHead}>② 角色音色</span>
              <span className={styles.choiceDesc}>用这段声音作为某个角色的音色（复刻样本，需 5–10s 清晰人声）</span>
            </button>
          </div>

          {/* ① 音频素材表单 */}
          {purpose === 'asset' && (
            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>音频名称 <span className={styles.req}>*</span></label>
                <input
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：主角独白 / 片头 BGM"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* ② 角色音色表单 */}
          {purpose === 'voice' && (
            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>目标角色 <span className={styles.req}>*</span></label>
                {characters.length === 0 ? (
                  <p className={styles.hint}>本项目还没有角色，先在画布造一个角色资产再来设音色。</p>
                ) : (
                  <select className={styles.select} value={voiceRoleId} onChange={(e) => setVoiceRoleId(e.target.value)}>
                    <option value="">请选择角色</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>音色命名</label>
                <input
                  className={styles.input}
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="如：男主 · 磁性低音"
                />
              </div>
              {isSelfSource && (
                <p className={styles.warn}>这段音频由该角色的音色生成，无需再设为音色。</p>
              )}
              {voiceRole?.voice && !isSelfSource && (
                <p className={styles.warn}>将替换现有音色「{voiceRole.voice.name}」。</p>
              )}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>取消</button>
          {purpose === 'voice' ? (
            <button className={styles.btn} onClick={confirmVoice} disabled={!voiceRoleId || isSelfSource}>
              设为角色音色
            </button>
          ) : (
            <button className={styles.btn} onClick={confirmAsset} disabled={purpose !== 'asset' || !name.trim()}>
              存为音频素材
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
