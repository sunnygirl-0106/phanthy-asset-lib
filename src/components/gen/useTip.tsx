import { useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import Overlay from './Overlay'
import styles from './GenSettingsBar.module.css'
/**
 * 置灰控件的统一说明气泡：悬浮或聚焦就说清楚为什么点不了，不让用户自己猜。
 *
 * 配套的规矩是「置灰一律用 aria-disabled，不用 disabled」：
 * disabled 的按钮不发鼠标事件、也拿不到焦点，挂上去的说明谁也看不到。
 * 点击由调用方自己挡（reason 非空就 return），键盘用户则靠 focus 看到同一句话。
 */
export function useTip() {
  const at = useRef<HTMLElement | null>(null)
  /**
   * 锚点和那句话一起进 state，而且每次都换一个新对象。
   *
   * 鼠标从一行扫到下一行时，这只气泡是同一只（mouseleave 和 mouseenter 在同一拍里结算，
   * 中间那个空字符串根本没落地，Overlay 不会卸了重挂）。而 Overlay 的定位挂在它自己的
   * effect 上，只换 label 不触发重贴 —— 锚点换了它却不知道，于是气泡留在上一行旁边。
   * 唯一还能救它的是 ResizeObserver，可模型列表里相邻两行那句话常常一样宽一样高
   * （都撑满 .tip 的 250px、都折同样的行数），连尺寸都没变，它也不响：
   * 鼠标已经走到最下面那一行，气泡还贴在上面某一行的腰上。
   *
   * 所以把锚点本身当成「动了」这件事报给 Overlay（track）：每次悬浮都是一个新对象，
   * 说的那句话一字不差也算变了，Overlay 收到就按新的那一行重新量一次。
   */
  const [cur, setCur] = useState<{ el: HTMLElement; text: string } | null>(null)
  const close = () => setCur(null)
  const open = (t: string | undefined, el: HTMLElement) => { if (t) { at.current = el; setCur({ el, text: t }) } }
  const tip = (t?: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => open(t, e.currentTarget),
    onMouseLeave: close,
    onFocus: (e: FocusEvent<HTMLElement>) => open(t, e.currentTarget),
    onBlur: close,
  })
  const node = cur
    ? <Overlay passive tail label={cur.text} anchor={at} track={cur}
        className={styles.tip} onClose={close}>{cur.text}</Overlay>
    : null
  return { tip, node }
}
