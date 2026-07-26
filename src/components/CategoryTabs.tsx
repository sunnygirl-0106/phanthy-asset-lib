/**
 * 【组件】CategoryTabs —— 类目筛选（角色/服装/场景/道具/音频 + 全部）
 *
 * 这是"找得到"设计里最基础的一层（L0）：类目 Tab。
 * 它是一个"受控组件"——自己不存状态，选中值和切换回调都由父组件传进来。
 * 这样父组件才是唯一真相，避免状态散落各处（新手常见的坑）。
 */

import type { Category } from '../data/types'
import styles from './CategoryTabs.module.css'

/** 'all' 表示不筛选；其余就是五个类目。 */
export type CategoryFilter = 'all' | Category

const OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'character', label: '角色' },
  { value: 'costume', label: '服装' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'audio', label: '音频' },
]

export function CategoryTabs({
  value,
  onChange,
}: {
  value: CategoryFilter
  onChange: (v: CategoryFilter) => void
}) {
  return (
    <div className={styles.tabs}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.tab} ${value === opt.value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
