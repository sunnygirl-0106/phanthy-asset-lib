import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './GenSettingsBar.module.css'

interface Props {
  children: ReactNode; onClose: () => void; label: string
  anchor?: RefObject<HTMLElement>; className?: string; passive?: boolean
  tail?: boolean
  align?: 'start' | 'end'
  /** 锚点换了就重新定位；useTip 的同一个气泡会跟随不同控件。 */
  track?: unknown
}

/** 所有浮层按视窗避让；交互浮层支持 Escape、焦点圈定及关闭后焦点恢复。 */
export default function Overlay({ children, onClose, label, anchor, className = '', passive = false, tail = false, align = 'start', track }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  const replace = useRef<() => void>()
  const [pos, setPos] = useState({ left: 12, top: 12, above: false, arrow: 18 })
  useLayoutEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    const box = ref.current!
    const place = () => {
      if (!anchor?.current) return
      const a = anchor.current.getBoundingClientRect()
      /*
       * 量自己的尺寸用 offsetWidth/Height，不用 getBoundingClientRect ——
       * 入场动画里带着 scale(.88)，rect 量到的是缩小后的那一下，浮层就贴着锚点摆得太低；
       * 动画一结束它长回原大小，正好压住锚点的上沿，鼠标一碰就被挡出来，
       * 悬浮卡于是开了又关地闪。offset 系列是布局尺寸，不受 transform 影响。
       */
      const r = { width: box.offsetWidth, height: box.offsetHeight }
      const gap = tail ? 11 : 8
      const above = a.top - r.height - gap >= 12
      const top = above ? a.top - r.height - gap : Math.min(a.bottom + gap, window.innerHeight - r.height - 12)
      const want = tail ? a.left + a.width / 2 - r.width / 2 : align === 'end' ? a.right - r.width : a.left
      const left = Math.max(12, Math.min(want, window.innerWidth - r.width - 12))
      setPos({ left, top: Math.max(12, top), above, arrow: Math.max(18, Math.min(a.left + a.width / 2 - left, r.width - 18)) })
    }
    place()
    replace.current = place
    const observer = new ResizeObserver(place); observer.observe(box)
    const selector = 'button:not(:disabled):not([aria-disabled="true"]),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]:not([aria-disabled="true"])'
    // 跳过置灰的那些：它们不是能用的入口，把焦点搁上去，挂着的「为什么点不了」还会开场就弹出来
    if (!passive) (box.querySelector<HTMLElement>(selector) ?? box).focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current() }
      if (e.key !== 'Tab' || passive) return
      const focus = [...box.querySelectorAll<HTMLElement>(selector)].filter((el) => el.getClientRects().length)
      const first = focus[0], last = focus[focus.length - 1]
      if (!first) { e.preventDefault(); box.focus() }
      else if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    const outside = (e: PointerEvent) => { if (!box.contains(e.target as Node) && !anchor?.current?.contains(e.target as Node)) close.current() }
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => {
      replace.current = undefined
      observer.disconnect(); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true)
      if (!passive && restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [anchor, passive, tail, align])
  useLayoutEffect(() => { replace.current?.() }, [track])
  return createPortal(<div ref={ref} role={passive ? undefined : 'dialog'} aria-label={label} tabIndex={-1}
    data-above={pos.above || undefined} className={`${styles.overlay} ${className}`} style={{ position: 'fixed', left: pos.left, top: pos.top }}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    {children}
    {tail && <span className={styles.overlayTail} data-side={pos.above ? 'down' : 'up'} style={{ left: pos.arrow }} aria-hidden />}
  </div>, document.body)
}
