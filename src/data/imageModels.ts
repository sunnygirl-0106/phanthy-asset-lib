import { COST_PER_IMAGE } from './pricing'

export type ImageModelId = 'nano-3-pro' | 'nano-2-pro' | 'seedream-3'
export type Tier = 'free' | 'vip'
export type Resolution = '1K' | '2K' | '4K'
export type ParamKey = 'resolution' | 'ratio' | 'count'
export interface ImageParams { resolution: Resolution; ratio: string; count: number }
export interface ImageModelCap {
  label: string
  vendor: 'phan' | 'seedream'
  tier: Tier
  isNew?: boolean
  resolutions: Resolution[]
  ratios: string[]
  counts: number[]
  costPerImage: number
}

/** 演示数据。真实能力和价格接后端后从接口获取；数字可以由产品随时调整。 */
export const IMAGE_MODELS: Record<ImageModelId, ImageModelCap> = {
  'nano-3-pro': { label: 'Phan nano Image 3 Pro', vendor: 'phan', tier: 'vip', isNew: true,
    resolutions: ['1K', '2K', '4K'], ratios: ['3:4', '1:1', '9:16', '16:9'], counts: [1, 2, 4, 6], costPerImage: COST_PER_IMAGE },
  'nano-2-pro': { label: 'Phan nano Image 2 Pro', vendor: 'phan', tier: 'free',
    resolutions: ['1K', '2K'], ratios: ['3:4', '1:1', '9:16', '16:9'], counts: [1, 2, 4], costPerImage: 20 },
  'seedream-3': { label: 'Seedream 3.0', vendor: 'seedream', tier: 'free',
    resolutions: ['1K', '2K'], ratios: ['1:1'], counts: [1, 2, 4], costPerImage: 12 },
}
export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as ImageModelId[]
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'nano-3-pro'
export const DEFAULT_IMAGE_PARAMS: ImageParams = { resolution: '2K', ratio: '3:4', count: 4 }
export interface ParamChange { key: ParamKey; from: string | number; to: string | number }

/** 保留合法值，否则向下取最近一档；比例优先回退到 1:1。能力表各档位按升序排列。 */
export function fitParams(model: ImageModelId, p: ImageParams): { params: ImageParams; changed: ParamChange[] } {
  const cap = IMAGE_MODELS[model]
  const resolutions = cap.resolutions.filter((r) => parseInt(r) <= parseInt(p.resolution))
  const counts = cap.counts.filter((n) => n <= p.count)
  const params: ImageParams = {
    resolution: cap.resolutions.includes(p.resolution) ? p.resolution : resolutions[resolutions.length - 1] ?? cap.resolutions[0],
    ratio: cap.ratios.includes(p.ratio) ? p.ratio : cap.ratios.includes('1:1') ? '1:1' : cap.ratios[0],
    count: cap.counts.includes(p.count) ? p.count : counts[counts.length - 1] ?? cap.counts[0],
  }
  const keys: ParamKey[] = ['resolution', 'ratio', 'count']
  return { params, changed: keys.filter((key) => p[key] !== params[key]).map((key) => ({ key, from: p[key], to: params[key] })) }
}

export function specLine(cap: ImageModelCap): string {
  return `${cap.resolutions.join('/')} · ${cap.ratios.length === 1 ? `固定 ${cap.ratios[0]}` : `${cap.ratios.length} 种比例`} · 单次最多 ${Math.max(...cap.counts)} 张 · ${cap.costPerImage} 星钻/张`
}

export function lockedReason(model: ImageModelId, key: ParamKey): string {
  const c = IMAGE_MODELS[model]
  if (key === 'resolution' && c.resolutions.length === 1) return `${c.label} 仅支持 ${c.resolutions[0]}`
  if (key === 'ratio' && c.ratios.length === 1) return `${c.label} 固定输出 ${c.ratios[0]}`
  if (key === 'count' && c.counts.length === 1) return `${c.label} 每次生成 ${c.counts[0]} 张`
  return ''
}

export function switchMessage(model: ImageModelId, changed: ParamChange[]): string {
  const names: Record<ParamKey, string> = { resolution: '清晰度', ratio: '比例', count: '数量' }
  return changed.length ? `已切换至 ${IMAGE_MODELS[model].label}：${changed.map((c) => `${names[c.key]}调整为 ${c.to}${c.key === 'count' ? ' 张' : ''}`).join('，')}` : ''
}
