/**
 * 【组件】SortMenu —— 资产库排序下拉（项目资产库 / 团队资产库共用）
 *
 * PRD #2 / #31：排序枚举收成固定四项，不再有"智能排序"这种没法实现的说法——
 *   时间倒序（默认） / 时间正序 / 名称 A→Z / 名称 Z→A
 *
 * 时间取资产最近一次成功保存或更新时间（demo 里用 createdAt 代表）。
 * 名称排序口径：中文按拼音、英文按字母、数字按自然序，优先级 数字 → 英文 → 中文。
 * 这条口径靠 Intl.Collator('zh-Hans-u-co-pinyin') 落地，而不是各端自己 localeCompare——
 * 否则同一份列表在不同浏览器 / 不同后端会排出不一样的顺序，测试一定会抓。
 */

import { useState } from 'react'
import styles from './SortMenu.module.css'

export type SortKey = 'timeDesc' | 'timeAsc' | 'nameAsc' | 'nameDesc'

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'timeDesc', label: '时间倒序' },
  { key: 'timeAsc', label: '时间正序' },
  { key: 'nameAsc', label: '名称 A→Z' },
  { key: 'nameDesc', label: '名称 Z→A' },
]

export const SORT_LABEL: Record<SortKey, string> = {
  timeDesc: '时间倒序',
  timeAsc: '时间正序',
  nameAsc: '名称 A→Z',
  nameDesc: '名称 Z→A',
}

/** 名称比较器：中文按拼音、数字按自然序，全局只造一次。 */
const nameCollator = new Intl.Collator('zh-Hans-u-co-pinyin', { numeric: true, sensitivity: 'base' })

/**
 * 首字符分桶：数字(0) → 英文(1) → 中文及其他(2)。
 *
 * 为什么不直接交给 collator：ICU 的拼音排序会把「阿杰」排在「Ajay」前面
 * （汉字与拉丁字母分属不同 script，跨 script 的次序由 ICU 自己决定，
 * 各引擎 / 各版本还不完全一致）。而 PRD 写死的口径是 数字 → 英文 → 中文，
 * 所以先按桶排、桶内再交给 collator——这样口径是我们说了算，不是 ICU 说了算。
 */
function nameBucket(name: string): number {
  const c = name.trim().charAt(0)
  if (/[0-9]/.test(c)) return 0
  if (/[A-Za-z]/.test(c)) return 1
  return 2
}

/** 名称升序：先分桶、桶内按拼音 + 数字自然序。 */
function compareName(a: string, b: string): number {
  const d = nameBucket(a) - nameBucket(b)
  return d !== 0 ? d : nameCollator.compare(a, b)
}

/** 统一的排序比较器：两个库共用同一套口径，避免两处各写一遍排出不同结果。 */
export function compareBySort<T extends { name: string; createdAt: number }>(
  a: T,
  b: T,
  key: SortKey,
): number {
  switch (key) {
    case 'timeAsc': return a.createdAt - b.createdAt
    case 'nameAsc': return compareName(a.name, b.name)
    case 'nameDesc': return compareName(b.name, a.name)
    case 'timeDesc':
    default: return b.createdAt - a.createdAt
  }
}

export function SortMenu({
  value,
  onChange,
  icon,
  caret,
  className,
}: {
  value: SortKey
  onChange: (next: SortKey) => void
  /** 复用调用方工具条的图标资源，保持两个库观感一致。 */
  icon?: string
  caret?: string
  /** 调用方的 .btn 类名（两个库的工具条按钮样式各自定义，这里不重复造）。 */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.wrap}>
      <button className={className} onClick={() => setOpen((v) => !v)}>
        {icon && <img className={styles.icon} src={icon} alt="" aria-hidden />}
        {SORT_LABEL[value]}
        {caret && <img className={styles.caret} src={caret} alt="" aria-hidden />}
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu} role="listbox">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                role="option"
                aria-selected={value === o.key}
                className={`${styles.item} ${value === o.key ? styles.itemOn : ''}`}
                onClick={() => { onChange(o.key); setOpen(false) }}
              >
                <span className={styles.itemTick}>{value === o.key ? '✓' : ''}</span>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
