/**
 * 【组件】WorkPlayerModal —— 作品播放页（素材广场作品卡点开后的弹窗）
 *
 * 视觉移植自「素材广场_设计稿_v4_2」的 player：16:9 舞台 + 大播放钮 + 进度条，
 * 下面标题 / 作者 / 收藏·分享 / 简介 / 统计。纯陈列占位（收藏、分享不落库），
 * 跟资产详情弹窗（AssetDetail）平级，走同一套遮罩 + 居中面板 + Esc 关闭习惯。
 */

import { useEffect } from 'react'
import type { PlazaWork } from '../data/plazaWorks'
import { fmtLike } from '../data/plazaWorks'
import styles from './WorkPlayerModal.module.css'

export function WorkPlayerModal({ work, onClose }: { work: PlazaWork; onClose?: () => void }) {
  // Esc 关闭（与 AssetDetail 一致的键盘习惯）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.player}>
        <button className={styles.close} title="关闭" onClick={onClose}>
          ✕
        </button>

        <div className={styles.stage}>
          <img src={work.cover} alt={work.title} />
          <div className={styles.bigplay}>
            <svg viewBox="0 0 16 16">
              <path d="M5.2 3.3v9.4L12 8 5.2 3.3Z" fill="currentColor" />
            </svg>
          </div>
          <div className={styles.pbar}>
            <div className={styles.track} />
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.pTitle}>{work.title}</div>

          <div className={styles.pRow}>
            <div className={styles.author}>
              <img src={work.avatar} alt="" />
              <div>
                <div className={styles.nm}>@{work.author}</div>
                <div className={styles.fo}>{work.date} 发布 · 审核通过</div>
              </div>
            </div>
            <div className={styles.pActs}>
              <button className={`${styles.iconBtn} ${styles.liked}`}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 20s-7.5-4.3-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.7 12 20 12 20Z"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                收藏 {fmtLike(work.likes)}
              </button>
              <button className={styles.iconBtn}>↗ 分享</button>
            </div>
          </div>

          <div className={styles.pDesc}>{work.desc}</div>

          <div className={styles.pStats}>
            <span>▶ {work.plays} 播放</span>
            <span>⏱ {work.dur}</span>
            <span>官方审核通过</span>
          </div>
        </div>
      </div>
    </div>
  )
}
