/**
 * 存入记录列表用的相对时间格式化（纯函数，无副作用外只依赖 now）。
 *
 * 规则贴着设计稿：
 *   · < 1 分钟           → 刚刚
 *   · < 60 分钟          → N 分钟前
 *   · 同一天             → N 小时前
 *   · 昨天               → 昨天 HH:mm
 *   · 更早、今年内        → M月D日
 *   · 跨年               → YYYY年M月D日
 *
 * now 显式传入（默认 Date.now()），方便测试与保持纯粹。
 */
export function fmtRelTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts
  const min = 60_000
  const hour = 60 * min

  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`

  const d = new Date(ts)
  const nd = new Date(now)
  const sameDay = d.toDateString() === nd.toDateString()
  if (sameDay) return `${Math.floor(diff / hour)} 小时前`

  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const yesterday = new Date(now)
  yesterday.setDate(nd.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`

  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === nd.getFullYear() ? md : `${d.getFullYear()}年${md}`
}

/**
 * 绝对时钟形态（已处理列表 / 大图审核「提交时间」用）：
 *   · 今天   → 今天 HH:mm
 *   · 昨天   → 昨天 HH:mm
 *   · 今年内 → M月D日 HH:mm（withTime=true）或 M月D日
 *   · 跨年   → YYYY年M月D日 (HH:mm)
 * withTime 默认 true。设计稿里更早的已处理项只留到「M月D日」，那种场景传 false。
 */
export function fmtClock(ts: number, now: number = Date.now(), withTime = true): string {
  const d = new Date(ts)
  const nd = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = new Date(now); y.setDate(nd.getDate() - 1)

  if (d.toDateString() === nd.toDateString()) return `今天 ${hm}`
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`

  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  const base = d.getFullYear() === nd.getFullYear() ? md : `${d.getFullYear()}年${md}`
  return withTime ? `${base} ${hm}` : base
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
