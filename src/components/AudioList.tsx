/**
 * 【组件】AudioList —— 音频资产的条状行列表（画布面板 / 团队库 / 项目库共用）
 *
 * 音频是一等展示类目（R3）：不进封面卡网格，而是一排「试听 ▶ + 名称 + 波形占位 + 时长」的条状行。
 * 视觉源自画布资产面板，抽到这里共享，保证画布与两个库页三处观感一致。
 *
 * 两种用法（mode 区分，行主体完全一致、只差行尾动作与是否可拖）：
 *   · canvas ：整行可拖到画布 + 行尾「使用」按钮（把这段音频落成音频节点）。
 *   · library：行尾 hover 浮出「改名（铅笔→行内 input，Enter 提交）+ 删除（垃圾桶）」。
 *
 * 试听：组件内一个共享的 <audio>，同一时刻只播一段；playingId 驱动行高亮 / 按钮态。
 */

import { useRef, useState } from 'react'
import type { Asset } from '../data/types'
import type { ActionResult } from '../store/useStore'
import styles from './AudioList.module.css'

/** 音频资产的可播放音源 / 时长（都存在 fields 里，占位）。 */
export const audioSrcOf = (a: Asset): string => (a.fields.audioUrl as string) || ''
export const audioDurationOf = (a: Asset): string => (a.fields.duration as string) || ''

/** 波形占位：一排固定高度的竖条（0–1），不接真实音频分析，纯装饰。 */
const WAVE_BARS = [
  0.3, 0.5, 0.7, 0.45, 0.85, 0.6, 0.35, 0.9, 0.55, 0.4, 0.75, 0.5, 0.65, 0.3, 0.8,
  0.5, 0.35, 0.7, 0.95, 0.45, 0.6, 0.4, 0.85, 0.55, 0.3, 0.7, 0.5, 0.4, 0.6, 0.35,
]

export type AudioListMode =
  | {
      kind: 'canvas'
      /** 点「使用」：把这段音频放到画布（落音频节点）。 */
      onUse: (a: Asset) => void
      /** 整行拖起时的载荷设置（落一个音频节点）。 */
      onDragStart: (e: React.DragEvent, a: Asset) => void
    }
  | {
      kind: 'library'
      /** 改名：走 store.renameAsset（自带库内同名去重）；返回结果供行内提示。 */
      onRename: (a: Asset, newName: string) => ActionResult
      /** 删除：走 store.runDeleteAsset。 */
      onDelete: (a: Asset) => void
    }

export function AudioList({
  items,
  mode,
}: { items: Asset[]; mode: AudioListMode }) {
  // 试听：共享一个 <audio>，同一时刻只播一段。
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  // 库页改名：行内编辑态（哪一行在编辑、草稿、上一次的错误提示）。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editErr, setEditErr] = useState<string | null>(null)

  function togglePlay(a: Asset) {
    if (playingId === a.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (!audioRef.current) audioRef.current = new Audio()
    const el = audioRef.current
    el.src = audioSrcOf(a)
    el.onended = () => setPlayingId(null)
    el.play().catch(() => setPlayingId(null))
    setPlayingId(a.id)
  }

  function startEdit(a: Asset) {
    setEditingId(a.id)
    setDraft(a.name)
    setEditErr(null)
  }

  function commitEdit(a: Asset) {
    if (mode.kind !== 'library') return
    const r = mode.onRename(a, draft)
    if (r.ok) {
      setEditingId(null)
      setEditErr(null)
    } else {
      setEditErr(r.message)
    }
  }

  return (
    <div className={styles.audioList}>
      {items.map((a) => {
        const playing = playingId === a.id
        const editing = editingId === a.id
        return (
          <div
            key={a.id}
            className={`${styles.audioRow} ${playing ? styles.audioRowOn : ''}`}
            draggable={mode.kind === 'canvas' && !editing}
            onDragStart={mode.kind === 'canvas' ? (e) => mode.onDragStart(e, a) : undefined}
          >
            <button
              className={styles.audioPlay}
              onClick={() => togglePlay(a)}
              aria-label={playing ? '暂停' : '试听'}
            >
              {playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>

            {editing ? (
              <input
                className={styles.audioEdit}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(a)
                  else if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => setEditingId(null)}
              />
            ) : mode.kind === 'library' ? (
              // 双击标题即可改名（符合直觉；不再用 hover 铅笔）。
              <span
                className={`${styles.audioName} ${styles.audioNameEditable}`}
                title="双击可改名"
                onDoubleClick={() => startEdit(a)}
              >
                {a.name}
              </span>
            ) : (
              <span className={styles.audioName}>{a.name}</span>
            )}

            <span className={styles.audioWave} aria-hidden>
              {WAVE_BARS.map((h, i) => (
                <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
              ))}
            </span>
            <span className={styles.audioDur}>{audioDurationOf(a)}</span>

            {mode.kind === 'canvas' ? (
              <button className={styles.audioUse} onClick={() => mode.onUse(a)}>
                使用
              </button>
            ) : (
              !editing && (
                <span className={styles.audioActions}>
                  <button
                    className={styles.audioIconBtn}
                    title="删除"
                    onClick={() => mode.onDelete(a)}
                  >
                    <TrashGlyph />
                  </button>
                </span>
              )
            )}

            {editing && editErr && <span className={styles.audioEditErr}>{editErr}</span>}
          </div>
        )
      })}
    </div>
  )
}

/* ── 内联图标 ── */

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
