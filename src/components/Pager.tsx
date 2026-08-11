/**
 * 【组件】Pager —— 资产列表分页条（项目资产库 / 团队资产库共用）
 *
 * PRD #2：整体列表分页，每页 24 项，左侧标"第 a–b 项，共 N 项"。
 * 分页而不是无限滚动，是为了让「全选」有一个明确的作用域——
 * 全选 = 选当前页，这句话只有在有"页"的概念时才成立。
 *
 * 页码超过 7 页时用省略号收口，始终保留首页 / 末页 / 当前页 ±1。
 */

import styles from './Pager.module.css'

/** 每页条数：两个库共用，改这里就够。 */
export const PAGE_SIZE = 24

/** 生成要渲染的页码序列，'…' 表示折叠。 */
function pageItems(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pageCount - 1, page + 1)
  if (from > 2) out.push('…')
  for (let i = from; i <= to; i++) out.push(i)
  if (to < pageCount - 1) out.push('…')
  out.push(pageCount)
  return out
}

export function Pager({
  page,
  total,
  pageSize = PAGE_SIZE,
  onChange,
}: {
  /** 当前页码，1 基。 */
  page: number
  /** 记录总数（当前类目 + 搜索过滤之后的）。 */
  total: number
  pageSize?: number
  onChange: (nextPage: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // 只有一页就整条不显示（demo：不再显示「第 a–b 项，共 N 项」计数）。
  if (pageCount <= 1) return null

  return (
    <div className={styles.bar}>
      {pageCount > 1 && (
        <div className={styles.pages}>
          <button
            className={styles.step}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            ‹ 上一页
          </button>
          {pageItems(page, pageCount).map((it, i) =>
            it === '…' ? (
              <span key={`gap-${i}`} className={styles.gap}>…</span>
            ) : (
              <button
                key={it}
                className={`${styles.num} ${it === page ? styles.numOn : ''}`}
                onClick={() => onChange(it)}
              >
                {it}
              </button>
            ),
          )}
          <button
            className={styles.step}
            disabled={page >= pageCount}
            onClick={() => onChange(page + 1)}
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  )
}
