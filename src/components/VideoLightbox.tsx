/**
 * 【组件】VideoLightbox —— 「其他」视频全屏预览播放器
 *
 * 「其他」类目里的视频片段点开即全屏播放（不再走整套详情动作）。
 * 自定义控件条（对齐产品作品播放页）：播放/暂停 · 时间 · 进度 · 音量 · 倍速 · 下载 · 扩大显示。
 * demo 暂无真实视频源（fields.videoUrl 空）时，<video> 只铺 poster、控件在位但无实际可播内容——
 * 这是有意为之：接入视频源后同一套控件自动生效。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './VideoLightbox.module.css'

const SPEEDS = [0.5, 1, 1.5, 2] as const

/** 秒 → m:ss。无效值兜底成 0:00。 */
function fmt(t: number): string {
  const sec = Number.isFinite(t) && t > 0 ? t : 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** 播放 / 暂停 图标。 */
function PlayGlyph() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>
}
function PauseGlyph() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
}
/** 音量（有声）/ 静音 图标。 */
function VolumeGlyph({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M17 9l4 4m0-4l-4 4" />
      ) : (
        <><path d="M16 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a8 8 0 0 1 0 12" /></>
      )}
    </svg>
  )
}
/** 删除（垃圾桶） 图标。 */
function TrashGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
}
/** 下载 图标。 */
function DownloadGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
}
/** 扩大显示（全屏） 图标。 */
function ExpandGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" /></svg>
}

export function VideoLightbox({
  src,
  poster,
  name,
  onClose,
  onDownload,
  onUse,
  onDelete,
}: {
  /** 可播放视频源；demo 可空（只铺 poster）。 */
  src?: string
  /** 首帧海报。 */
  poster?: string
  name: string
  onClose: () => void
  /** 下载：由调用方决定下什么（有源下源、无源下海报）。 */
  onDownload?: () => void
  /** 「使用」：把这段视频落到画布（视频节点）。给了才出按钮（画布面板用；资产库不传）。 */
  onUse?: () => void
  /** 删除：✕ 左侧的小垃圾桶（二次确认由调用方负责）。给了才出（资产库用；画布不传）。 */
  onDelete?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [speedOpen, setSpeedOpen] = useState(false)

  // Esc 关闭（与详情弹窗 / 图片灯箱一致）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 进来即尝试自动播放（无源 / 浏览器拦截则静默停在首帧）。
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [src])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {})
    else { v.pause(); setPlaying(false) }
  }, [])

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current
    const t = Number(e.target.value)
    setCur(t)
    if (v && Number.isFinite(v.duration)) v.currentTime = t
  }

  function onVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current
    const val = Number(e.target.value)
    setVolume(val)
    setMuted(val === 0)
    if (v) { v.volume = val; v.muted = val === 0 }
  }

  function toggleMute() {
    const v = videoRef.current
    const next = !muted
    setMuted(next)
    if (v) v.muted = next
  }

  function pickSpeed(s: number) {
    const v = videoRef.current
    setSpeed(s)
    setSpeedOpen(false)
    if (v) v.playbackRate = s
  }

  function toggleFullscreen() {
    const el = cardRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0

  return (
    <div className={styles.root} onClick={onClose}>
      <div className={styles.card} ref={cardRef} onClick={(e) => e.stopPropagation()}>
      <div className={styles.head}>
        <span className={styles.title}>{name}</span>
        <div className={styles.headRight}>
          {onUse && (
            <button className={styles.useBtn} onClick={onUse}>添加到画布</button>
          )}
          {onDelete && (
            <button className={styles.headTrash} title="删除资产" onClick={onDelete}><TrashGlyph /></button>
          )}
          <button className={styles.close} title="关闭" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className={styles.stage}>
        <video
          ref={videoRef}
          className={styles.video}
          src={src || undefined}
          poster={poster}
          playsInline
          onClick={togglePlay}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>

      {/* 控件条：卡片底部独立一条（播放/暂停 · 时间 · 进度 · 音量 · 倍速 · 下载 · 扩大显示）。 */}
      <div className={styles.bar}>
          <button className={styles.ctrl} title={playing ? '暂停' : '播放'} onClick={togglePlay}>
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <span className={styles.time}>{fmt(cur)} / {fmt(dur)}</span>
          <input
            className={styles.seek}
            type="range"
            min={0}
            max={dur || 0}
            step={0.1}
            value={cur}
            onChange={onSeek}
            style={{ ['--pct' as string]: `${pct}%` }}
          />

          <div className={styles.volWrap}>
            <button className={styles.ctrl} title={muted ? '取消静音' : '静音'} onClick={toggleMute}>
              <VolumeGlyph muted={muted || volume === 0} />
            </button>
            <input
              className={styles.vol}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={onVolume}
              style={{ ['--pct' as string]: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>

          <div className={styles.speedWrap}>
            <button className={styles.speedBtn} title="倍速" onClick={() => setSpeedOpen((v) => !v)}>
              {speed}x
            </button>
            {speedOpen && (
              <div className={styles.speedPop} onClick={(e) => e.stopPropagation()}>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    className={`${styles.speedItem} ${s === speed ? styles.speedItemOn : ''}`}
                    onClick={() => pickSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className={styles.ctrl} title="下载" onClick={() => onDownload?.()}>
            <DownloadGlyph />
          </button>
          <button className={styles.ctrl} title="扩大显示" onClick={toggleFullscreen}>
            <ExpandGlyph />
          </button>
        </div>
      </div>
    </div>
  )
}
