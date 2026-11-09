/**
 * 线稿图标，取自 Figma 社区的 Lets Icons「Free Icon Pack 1800+」（personal & commercial use）。
 *
 * 那套图标的规矩，这里一并照搬 —— 混着两套画法，小尺寸下就会有一枚显得比邻居胖：
 * 24 的格子、笔画走 3–21 的范围、线宽 2、圆头圆角；
 * 该实的地方给一小块实心（镜头、瞳孔、笔尖），其余全是描边。
 *
 * 颜色统一走 currentColor：描边和那一小块实心都读同一个 currentColor，
 * 不是「描边给 color、实心写死 currentColor」—— 那样调色时描边变了、实心还留在继承来的旧色上。
 * 所以 `color` 是落到 svg 的 style 上的，而且**只在真给了的时候才落**：
 * 无条件写一个 `color: currentColor` 是个空转的内联样式，却会盖掉 class 里的颜色
 * （`.model-check` 那类「这一项是选中的，给它涂上主题色」当场失效）。
 */
import type { CSSProperties } from 'react'

interface P { size?: number; color?: string; sw?: number; style?: CSSProperties; className?: string }

const Svg = ({ size = 16, color, sw = 2, style, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    style={color ? { color, ...style } : style} className={className}>
    {children}
  </svg>
)

/** 实心图标（整枚都是面，没有描边）用这个壳，免得继承到 stroke 又胖一圈 */
const SvgF = ({ size = 16, color, style, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"
    style={color ? { color, ...style } : style} className={className}>
    {children}
  </svg>
)

/** 描边图标里那一小块实心：显式关掉 stroke，不然会被壳上的 stroke 又描粗一圈 */
const solid = { fill: 'currentColor', stroke: 'none' } as const


export const IcQuality = ({ lv = 3, ...p }: P & { lv?: number }) => <Svg {...p}>
  <rect x="3" y="5" width="18" height="14" rx="2.6" />
  <path d="M8 15.4v-2.2" />
  <path d="M12 15.4v-4.4" opacity={lv >= 2 ? 1 : .32} />
  <path d="M16 15.4v-6.6" opacity={lv >= 3 ? 1 : .32} />
</Svg>

export const IcImage = (p: P) => <Svg {...p}>
  <path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7Z" />
  <path d="M3 15l2.806-2.806c.882-.882 2.348-.75 3.058.276l1.902 2.748c.665.96 2.007 1.149 2.911.41l2.422-1.982c.795-.65 1.954-.593 2.68.134L21 16" />
  <circle cx="16" cy="8" r="2" {...solid} />
</Svg>

export const IcCheck = (p: P) => <Svg {...p}><path d="M5 14l4 3 9-11" /></Svg>

export const IcChev = (p: P) => <Svg {...p}><path d="M18 9l-6 6-6-6" /></Svg>

export const IcGem = ({ size = 16, style, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className}>
    <path d="M12 2l2.9 7.1L22 12l-7.1 2.9L12 22l-2.9-7.1L2 12l7.1-2.9z" fill="#a8beec" />
    <path d="M12 2l2.9 7.1L12 12zM2 12l7.1-2.9L12 12z" fill="#fff" fillOpacity=".6" />
    <path d="M12 22l-2.9-7.1L12 12zM22 12l-7.1 2.9L12 12z" fill="#3c4f97" fillOpacity=".45" />
    <circle cx="19.5" cy="4.5" r="1.3" fill="#d8e5ff" />
  </svg>
)

export const IcSeedanceS = (p: P) => <SvgF {...p}>
  <path d="M4 7.4 10.79 3.5Q12 2.8 13.21 3.5L18.79 6.7Q20 7.4 20 8.8V16.6Z" />
  <path opacity=".45" d="M4 7.4 20 16.6 13.21 20.5Q12 21.2 10.79 20.5L5.21 17.3Q4 16.6 4 15.2Z" />
</SvgF>

export const IcPhanS = (p: P) => <SvgF {...p}><path d="M12 2l2.9 7.1L22 12l-7.1 2.9L12 22l-2.9-7.1L2 12l7.1-2.9z" /></SvgF>
