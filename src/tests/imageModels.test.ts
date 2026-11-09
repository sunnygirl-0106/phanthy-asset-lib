import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_PARAMS, IMAGE_MODELS, fitParams, lockedReason, specLine, switchMessage } from '../data/imageModels'

afterEach(() => vi.restoreAllMocks())

describe('fitParams', () => {
  it('保留合法值，不修改输入', () => {
    const p = Object.freeze({ ...DEFAULT_IMAGE_PARAMS })
    expect(fitParams(DEFAULT_IMAGE_MODEL, p)).toEqual({ params: p, changed: [] })
    expect(fitParams('nano-2-pro', p)).toEqual({ params: p, changed: [] })
  })
  it('4K / 3:4 / 6 张切到固定比例模型时，按参数顺序报告收敛', () => {
    expect(fitParams('seedream-3', { resolution: '4K', ratio: '3:4', count: 6 })).toEqual({
      params: { resolution: '2K', ratio: '1:1', count: 4 },
      changed: [
        { key: 'resolution', from: '4K', to: '2K' },
        { key: 'ratio', from: '3:4', to: '1:1' },
        { key: 'count', from: 6, to: 4 },
      ],
    })
  })
  it('不支持的比例优先取 1:1，切回模型仍保留合法比例', () => {
    expect(fitParams('nano-2-pro', { ...DEFAULT_IMAGE_PARAMS, ratio: '2:3' }).params.ratio).toBe('1:1')
    expect(fitParams('nano-3-pro', { ...DEFAULT_IMAGE_PARAMS, ratio: '1:1' }).params.ratio).toBe('1:1')
  })
  it('数量向下取最近档，没有更低档时取最小值', () => {
    expect(fitParams('nano-2-pro', { ...DEFAULT_IMAGE_PARAMS, count: 3 }).params.count).toBe(2)
    expect(fitParams('nano-2-pro', { ...DEFAULT_IMAGE_PARAMS, count: 0 }).params.count).toBe(1)
  })
  it('能力表没有更低清晰度或 1:1 比例时取首档', () => {
    const cap = IMAGE_MODELS['nano-2-pro']
    vi.spyOn(IMAGE_MODELS, 'nano-2-pro', 'get').mockReturnValue({ ...cap, resolutions: ['2K', '4K'], ratios: ['9:16', '16:9'] })
    expect(fitParams('nano-2-pro', { ...DEFAULT_IMAGE_PARAMS, resolution: '1K' }).params).toEqual({ resolution: '2K', ratio: '9:16', count: 4 })
  })
})

describe('模型说明', () => {
  it('仅固定值给出置灰原因', () => {
    expect(lockedReason('seedream-3', 'ratio')).toBe('Seedream 3.0 固定输出 1:1')
    for (const key of ['resolution', 'ratio', 'count'] as const) expect(lockedReason('nano-3-pro', key)).toBe('')
    const cap = IMAGE_MODELS['nano-2-pro']
    vi.spyOn(IMAGE_MODELS, 'nano-2-pro', 'get').mockReturnValue({ ...cap, resolutions: ['2K'], counts: [2] })
    expect(lockedReason('nano-2-pro', 'resolution')).toBe('Phan nano Image 2 Pro 仅支持 2K')
    expect(lockedReason('nano-2-pro', 'count')).toBe('Phan nano Image 2 Pro 每次生成 2 张')
  })
  it('说明列出多比例和固定比例模型的规格与价格', () => {
    expect(specLine(IMAGE_MODELS['nano-3-pro'])).toBe('1K/2K/4K · 4 种比例 · 单次最多 6 张 · 30 星钻/张')
    expect(specLine(IMAGE_MODELS['seedream-3'])).toBe('1K/2K · 固定 1:1 · 单次最多 4 张 · 12 星钻/张')
  })
  it('没有改动时不提示，多项改动用中文逗号连接', () => {
    expect(switchMessage('nano-2-pro', [])).toBe('')
    const { changed } = fitParams('seedream-3', { resolution: '4K', ratio: '3:4', count: 6 })
    expect(switchMessage('seedream-3', changed)).toBe('已切换至 Seedream 3.0：清晰度调整为 2K，比例调整为 1:1，数量调整为 4 张')
  })
})
