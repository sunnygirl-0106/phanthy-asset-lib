export type ImageModelId = 'nano-3-pro' | 'nano-3.1-flash' | 'seedream-4' | 'seedream-4.5' | 'seedream-5-lite' | 'phan-image2' | 'mj-t2i'
export type ParamKey = 'resolution' | 'ratio' | 'version' | 'speed' | 'count'
export const PARAM_ORDER: ParamKey[] = ['resolution', 'ratio', 'version', 'speed', 'count']
export interface ImageParams { resolution: string; ratio: string; version: string; speed: string; count: number }
export interface ImageModelCap {
  label: string
  desc: string
  vendor: 'phan' | 'seedream' | 'midjourney'
  recommended?: boolean
  isNew?: boolean
  costPerImage: number
  options: Partial<Record<ParamKey, (string | number)[]>>
}

/** 生产平台模型列表及参数配置；本轮统一按 30 星钻/张估算。 */
export const IMAGE_MODELS: Record<ImageModelId, ImageModelCap> = {
  'nano-3-pro': { label: 'Phan nano Image 3 Pro', desc: '图像生成预览版，支持对话式图像编辑', vendor: 'phan', recommended: true, costPerImage: 30,
    options: { resolution: ['1K', '2K', '4K'], ratio: ['1:1', '3:4', '4:3', '9:16', '16:9'], count: [1, 2, 3, 4] } },
  'nano-3.1-flash': { label: 'phan nano Image 3.1 Flash', desc: '图像生成，支持提示词创作', vendor: 'phan', costPerImage: 30,
    options: { resolution: ['1K', '2K'], count: [1, 2, 3, 4] } },
  'seedream-4': { label: 'seedream 4.0', desc: '图像生成，细节丰富，适合高质感画面创作', vendor: 'seedream', costPerImage: 30,
    options: { resolution: ['1K', '2K', '4K'], count: [1, 2, 3, 4] } },
  'seedream-4.5': { label: 'Doubao-seedream-4.5', desc: '图像生成，文字排版强，适合海报电商创作', vendor: 'seedream', costPerImage: 30,
    options: { resolution: ['1K', '2K', '4K'], count: [1, 2, 3, 4] } },
  'seedream-5-lite': { label: 'Doubao-seedream-5.0-lite', desc: '轻量化图像生成，指令遵循好，主体稳定', vendor: 'seedream', costPerImage: 30,
    options: { resolution: ['1K', '2K'], count: [1, 2, 3, 4] } },
  'phan-image2': { label: 'Phan image2', desc: '图生图局部编辑，文字渲染好，保留原图特征', vendor: 'phan', costPerImage: 30,
    options: { resolution: ['1K', '2K'], ratio: ['1:1', '3:4', '4:3', '9:16', '16:9'], count: [1, 2, 3, 4] } },
  'mj-t2i': { label: 'Midjourney-t2i', desc: '文生图，艺术风格表现力强，仅支持文字出图', vendor: 'midjourney', costPerImage: 30,
    options: { ratio: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], version: ['v7', 'v6.1', 'niji 6'], speed: ['Fast', 'Relax', 'Turbo'], count: [1, 2, 3, 4] } },
}
export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as ImageModelId[]
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'nano-3-pro'
export const DEFAULT_IMAGE_PARAMS: ImageParams = { resolution: '1K', ratio: '1:1', version: 'v7', speed: 'Fast', count: 1 }
export interface ParamChange { key: ParamKey; from: string | number; to: string | number }

/** 只收敛目标模型支持的参数，隐藏参数保留；仅提示前后模型共有参数的变化。 */
export function fitParams(from: ImageModelId, to: ImageModelId, p: ImageParams): { params: ImageParams; changed: ParamChange[] } {
  const params = { ...p }
  const changed: ParamChange[] = []
  for (const key of PARAM_ORDER) {
    const options = IMAGE_MODELS[to].options[key]
    if (!options?.length || options.includes(p[key])) continue
    let value = options[0]
    if (key === 'resolution' || key === 'count') {
      const rank = (v: string | number) => parseFloat(String(v))
      const lower = options.filter((v) => rank(v) <= rank(p[key]))
      value = lower.length
        ? lower.reduce((a, b) => rank(a) > rank(b) ? a : b)
        : options.reduce((a, b) => rank(a) < rank(b) ? a : b)
    } else if (key === 'ratio' && options.includes('1:1')) {
      value = '1:1'
    }
    if (key === 'count') params[key] = Number(value)
    else params[key] = String(value)
    if (IMAGE_MODELS[from].options[key] && p[key] !== params[key]) changed.push({ key, from: p[key], to: params[key] })
  }
  return { params, changed }
}

export function lockedReason(model: ImageModelId, key: ParamKey): string {
  const c = IMAGE_MODELS[model], options = c.options[key]
  if (options?.length !== 1) return ''
  const value = options[0]
  switch (key) {
    case 'resolution': return `${c.label} 仅支持 ${value}`
    case 'ratio': return `${c.label} 固定输出 ${value}`
    case 'version': return `${c.label} 仅支持版本 ${value}`
    case 'speed': return `${c.label} 仅支持速度档 ${value}`
    case 'count': return `${c.label} 每次生成 ${value} 张`
  }
}

export function switchMessage(model: ImageModelId, changed: ParamChange[]): string {
  const names: Record<ParamKey, string> = { resolution: '清晰度', ratio: '比例', version: '版本', speed: '速度档', count: '数量' }
  return changed.length ? `已切换至 ${IMAGE_MODELS[model].label}：${changed.map((c) => `${names[c.key]}调整为 ${c.to}${c.key === 'count' ? ' 张' : ''}`).join('，')}` : ''
}
