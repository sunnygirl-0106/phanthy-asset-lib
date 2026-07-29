/**
 * 【组件】WorkCard —— 一张作品卡（素材广场顶部作品墙的基本单元）
 *
 * 视觉移植自「素材广场_设计稿_v4_2」的 vcard：16:9 封面 + 底部左下角播放钮 /
 * 右下角红心点赞数，封面下一条信息区（标题两行截断 + 作者头像/昵称 + 发布时间）。
 * 纯陈列，点一下开播放页（WorkPlayerModal）。数据来自 data/plazaWorks，不碰资产逻辑。
 */

import type { PlazaWork } from '../data/plazaWorks'
import { fmtLike } from '../data/plazaWorks'
import styles from './WorkCard.module.css'

export function WorkCard({ work, onClick }: { work: PlazaWork; onClick?: () => void }) {
  return (
    <button className={styles.card} onClick={onClick}>
      <div className={styles.cover}>
        <img src={work.cover} alt={work.title} loading="lazy" />
        <span className={styles.play}>
          <svg viewBox="0 0 16 16">
            <path d="M5.2 3.3v9.4L12 8 5.2 3.3Z" fill="currentColor" />
          </svg>
        </span>
        <span className={styles.likes}>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 20s-7.5-4.3-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.7 12 20 12 20Z"
              stroke="#fff"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {fmtLike(work.likes)}
        </span>
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{work.title}</h3>
        <div className={styles.meta}>
          <span className={styles.user}>
            <img src={work.avatar} alt="" />
            <span>@{work.author}</span>
          </span>
          <time className={styles.time}>{work.date}</time>
        </div>
      </div>
    </button>
  )
}
