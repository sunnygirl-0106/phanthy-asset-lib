/**
 * 【页面】HomePage —— 创作中心
 *
 * 两张创作入口卡（工作流 / 无限画布）→ 点卡弹"选项目" → 进对应模式。
 * （技术规划 §3、§4.1：去掉全自动 AI 生成卡、去掉平台作品展示，只留两个真入口。）
 */

import { useState } from 'react'
import type { Route } from '../hooks/useHashRoute'
import { HomeEntryCard } from '../components/HomeEntryCard'
import { CreationModeModal } from '../components/CreationModeModal'
import { assetUrl } from '../utils/assets'
import page from './page.module.css'
import styles from './HomePage.module.css'

export function HomePage({ navigate }: { navigate: (to: Route | string) => void }) {
  // 点了哪张入口卡（决定弹窗进入哪种模式）；null = 弹窗关闭。
  const [pickMode, setPickMode] = useState<'workflow' | 'canvas' | null>(null)

  return (
    <div className={page.page}>
      <div className={page.header}>
        <h1 className={page.title}>创作中心</h1>
        <p className={page.subtitle}>选一种创作方式，进入你的项目开始创作</p>
      </div>

      <div className={styles.cards}>
        <HomeEntryCard
          icon={assetUrl('assets/home/home-workflow.svg')}
          title="工作流"
          desc="剧本拆解 → 分镜 → 逐镜生成的流水线式创作，适合成片导向。"
          onClick={() => setPickMode('workflow')}
        />
        <HomeEntryCard
          icon={assetUrl('assets/home/home-canvas.svg')}
          title="无限画布"
          desc="自由摆放文本/图片/视频/音频节点的草稿台，边比划边沉淀项目资产。"
          onClick={() => setPickMode('canvas')}
        />
      </div>

      {pickMode && (
        <CreationModeModal mode={pickMode} onClose={() => setPickMode(null)} navigate={navigate} />
      )}
    </div>
  )
}
