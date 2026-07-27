/**
 * 【组件】HomeEntryCard —— 创作中心的一张创作入口卡
 *
 * 纯展示 + 点击回调（受控）。创作中心用它摆两张卡：工作流 / 无限画布。
 * （技术规划 §3：去掉全自动 AI 生成卡、去掉平台作品展示，只留这两个真入口。）
 */

import styles from './HomeEntryCard.module.css'

export function HomeEntryCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button className={styles.card} onClick={onClick}>
      <div className={styles.iconWrap}>
        <img className={styles.icon} src={icon} alt="" aria-hidden="true" />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <p className={styles.desc}>{desc}</p>
      </div>
      <span className={styles.arrow} aria-hidden="true">→</span>
    </button>
  )
}
