/**
 * 【组件】OtherVideoPlayer —— 「其他」视频大屏播放器
 *
 * 「其他」类目里的视频片段（分镜 / 视频留存物）点开后不进资产详情弹窗，直接大屏播放。
 * 用户口径：视频就直接大屏播放就行了，不用走那一整套详情。
 *
 * 有真实视频源（fields.videoUrl）时用原生 <video controls autoPlay> 播放；
 * demo 暂无视频源，就把首帧海报（cover）铺满 16:9 舞台 + 中央播放钮占位，
 * 视觉沿用作品播放页（WorkPlayerModal）的舞台语言。遮罩 / Esc 关闭与详情弹窗一致。
 */

import { useEffect } from 'react'
import type { Asset } from '../data/types'
import { coverOf } from '../services/assetService'
import styles from './OtherVideoPlayer.module.css'

export function OtherVideoPlayer({ asset, onClose }: { asset: Asset; onClose?: () => void }) {
  // Esc 关闭（与 AssetDetail / WorkPlayerModal 一致的键盘习惯）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const videoUrl = (asset.fields.videoUrl as string | undefined) ?? ''
  const poster = coverOf(asset)
  const duration = asset.fields.duration as string | undefined

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.player}>
        <button className={styles.close} title="关闭" onClick={onClose}>✕</button>

        <div className={styles.stage}>
          {videoUrl ? (
            <video className={styles.video} src={videoUrl} poster={poster} controls autoPlay />
          ) : (
            // demo 无真实视频源：铺满海报 + 中央播放钮占位（接入视频后自动切成真实播放）。
            <>
              <img className={styles.poster} src={poster} alt={asset.name} />
              <div className={styles.bigplay} aria-hidden>
                <svg viewBox="0 0 16 16"><path d="M5.2 3.3v9.4L12 8 5.2 3.3Z" fill="currentColor" /></svg>
              </div>
              <div className={styles.pbar}><div className={styles.track} /></div>
            </>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.title}>{asset.name}</div>
          <div className={styles.meta}>
            <span className={styles.tag}>视频</span>
            {duration && <span className={styles.dur}>⏱ {duration}</span>}
            {!videoUrl && <span className={styles.hint}>播放器占位 · 接入视频源后自动生效</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
