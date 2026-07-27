/**
 * 【组件】AssetCard —— 一张资产卡片（视觉网格的基本单元）
 *
 * 只负责"把一份资产画出来"：大图 + 名字 + 类目，
 * 外加一个小徽章演示血缘（副本），让你在界面上就能看到数据层里 masterId 的效果。
 * 它不含任何权限判断——能不能出现在网格里，是上层用 canSee 决定的。
 * （v4：跟随已砍，原"跟随中"徽章删除。）
 */

import type { Asset, Category } from '../data/types'
import styles from './AssetCard.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  audio: '音频',
}

export function AssetCard({ asset, onClick }: { asset: Asset; onClick?: () => void }) {
  return (
    <div className={styles.card} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={styles.coverWrap}>
        <img className={styles.cover} src={asset.cover} alt={asset.name} loading="lazy" />
        <div className={styles.badges}>
          {asset.masterId && <span className={`${styles.badge} ${styles.badgeCopy}`}>副本</span>}
          {asset.status !== 'done' && <span className={styles.badge}>{statusLabel(asset.status)}</span>}
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.name}>{asset.name}</div>
        <div className={styles.cat}>{CATEGORY_LABEL[asset.category]}</div>
      </div>
    </div>
  )
}

function statusLabel(status: Asset['status']): string {
  return status === 'empty' ? '空壳' : status === 'generating' ? '生成中' : status === 'failed' ? '失败' : '成品'
}
