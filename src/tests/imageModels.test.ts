import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GenSettingsBar from '../components/gen/GenSettingsBar'
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_PARAMS, IMAGE_MODELS, IMAGE_MODEL_IDS, PARAM_ORDER, fitParams, lockedReason, switchMessage, type ImageModelId } from '../data/imageModels'

afterEach(() => vi.restoreAllMocks())

describe('模型配置', () => {
  it('按指定顺序列出七个模型，统一计价，默认一张 30 星钻', () => {
    expect(IMAGE_MODEL_IDS).toEqual(['nano-3-pro', 'nano-3.1-flash', 'seedream-4', 'seedream-4.5', 'seedream-5-lite', 'phan-image2', 'mj-t2i'])
    expect(IMAGE_MODEL_IDS.every((id) => IMAGE_MODELS[id].costPerImage === 30)).toBe(true)
    expect(DEFAULT_IMAGE_PARAMS).toEqual({ resolution: '1K', ratio: '1:1', version: 'v7', speed: 'Fast', count: 1 })
    expect(DEFAULT_IMAGE_PARAMS.count * IMAGE_MODELS[DEFAULT_IMAGE_MODEL].costPerImage).toBe(30)
  })
})

describe('fitParams', () => {
  it('保留合法值，不修改输入', () => {
    const p = Object.freeze({ ...DEFAULT_IMAGE_PARAMS })
    expect(fitParams(DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODEL, p)).toEqual({ params: p, changed: [] })
  })
  it('3 Pro 切到 Flash 只调整清晰度，隐藏的比例保留，切回不提示', () => {
    const p = Object.freeze({ ...DEFAULT_IMAGE_PARAMS, resolution: '4K', ratio: '3:4' })
    const flash = fitParams('nano-3-pro', 'nano-3.1-flash', p)
    expect(flash).toEqual({ params: { ...p, resolution: '2K' }, changed: [{ key: 'resolution', from: '4K', to: '2K' }] })
    expect(fitParams('nano-3.1-flash', 'nano-3-pro', flash.params)).toEqual({ params: flash.params, changed: [] })
  })
  it('切到 MJ 初始化无效版本和速度档，不将新增参数列入 changed', () => {
    const p = { ...DEFAULT_IMAGE_PARAMS, resolution: '4K', ratio: '3:4', version: 'v5', speed: 'Slow' }
    expect(fitParams('nano-3-pro', 'mj-t2i', p)).toEqual({ params: { ...p, version: 'v7', speed: 'Fast' }, changed: [] })
  })
  it('切出 MJ 后保留版本和速度档，切回仍沿用合法值', () => {
    const p = { ...DEFAULT_IMAGE_PARAMS, version: 'niji 6', speed: 'Turbo' }
    const pro = fitParams('mj-t2i', 'nano-3-pro', p)
    expect(pro).toEqual({ params: p, changed: [] })
    expect(fitParams('nano-3-pro', 'mj-t2i', pro.params)).toEqual({ params: p, changed: [] })
  })
  it('比例优先回退 1:1，仅报告两个模型共有的比例变化', () => {
    const p = { ...DEFAULT_IMAGE_PARAMS, ratio: '21:9' }
    expect(fitParams('mj-t2i', 'nano-3-pro', p)).toEqual({ params: { ...p, ratio: '1:1' }, changed: [{ key: 'ratio', from: '21:9', to: '1:1' }] })
    expect(fitParams('nano-3.1-flash', 'nano-3-pro', p)).toEqual({ params: { ...p, ratio: '1:1' }, changed: [] })
  })
  it('清晰度和数量向下取最近档，无更低档时取最小值', () => {
    expect(fitParams('nano-3-pro', 'nano-3.1-flash', { ...DEFAULT_IMAGE_PARAMS, resolution: '4K', count: 6 }).params).toEqual({ ...DEFAULT_IMAGE_PARAMS, resolution: '2K', count: 4 })
    expect(fitParams('nano-3-pro', 'nano-3.1-flash', { ...DEFAULT_IMAGE_PARAMS, count: 2.5 }).params.count).toBe(2)
    expect(fitParams('nano-3-pro', 'nano-3.1-flash', { ...DEFAULT_IMAGE_PARAMS, count: 0 }).params.count).toBe(1)
    const cap = IMAGE_MODELS['nano-3-pro']
    vi.spyOn(IMAGE_MODELS, 'nano-3-pro', 'get').mockReturnValue({ ...cap, options: { ...cap.options, resolution: ['2K', '4K'], ratio: ['9:16', '16:9'] } })
    expect(fitParams('nano-3.1-flash', 'nano-3-pro', DEFAULT_IMAGE_PARAMS).params).toEqual({ ...DEFAULT_IMAGE_PARAMS, resolution: '2K', ratio: '9:16' })
  })
  it('共有的版本和速度档发生变化时，按参数顺序报告', () => {
    const p = { ...DEFAULT_IMAGE_PARAMS, version: 'v5', speed: 'Slow' }
    expect(fitParams('mj-t2i', 'mj-t2i', p).changed).toEqual([
      { key: 'version', from: 'v5', to: 'v7' }, { key: 'speed', from: 'Slow', to: 'Fast' },
    ])
  })
})

describe('模型说明', () => {
  it('不存在或有多个选项时没有锁定原因', () => {
    for (const model of IMAGE_MODEL_IDS) {
      for (const key of PARAM_ORDER) expect(lockedReason(model, key)).toBe('')
    }
  })
  it('五种参数都支持单选值锁定原因', () => {
    const cap = IMAGE_MODELS['mj-t2i']
    vi.spyOn(IMAGE_MODELS, 'mj-t2i', 'get').mockReturnValue({ ...cap, options: { resolution: ['2K'], ratio: ['1:1'], version: ['v7'], speed: ['Fast'], count: [2] } })
    expect(lockedReason('mj-t2i', 'resolution')).toBe('Midjourney-t2i 仅支持 2K')
    expect(lockedReason('mj-t2i', 'ratio')).toBe('Midjourney-t2i 固定输出 1:1')
    expect(lockedReason('mj-t2i', 'version')).toBe('Midjourney-t2i 仅支持版本 v7')
    expect(lockedReason('mj-t2i', 'speed')).toBe('Midjourney-t2i 仅支持速度档 Fast')
    expect(lockedReason('mj-t2i', 'count')).toBe('Midjourney-t2i 每次生成 2 张')
  })
  it('没有变化不提示，五种参数名称及数量单位正确', () => {
    expect(switchMessage('mj-t2i', [])).toBe('')
    expect(switchMessage('mj-t2i', [
      { key: 'resolution', from: '4K', to: '2K' },
      { key: 'ratio', from: '21:9', to: '1:1' },
      { key: 'version', from: 'v5', to: 'v7' },
      { key: 'speed', from: 'Slow', to: 'Fast' },
      { key: 'count', from: 6, to: 4 },
    ])).toBe('已切换至 Midjourney-t2i：清晰度调整为 2K，比例调整为 1:1，版本调整为 v7，速度档调整为 Fast，数量调整为 4 张')
  })
})

describe('底栏参数渲染', () => {
  const labels = (model: ImageModelId) => {
    const html = renderToStaticMarkup(createElement(GenSettingsBar, {
      model, params: DEFAULT_IMAGE_PARAMS, onModelChange: () => {}, onParamsChange: () => {},
    }))
    return [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
  }
  it('3 Pro 默认显示清晰度、比例、数量', () => {
    expect(labels('nano-3-pro')).toEqual(['模型：Phan nano Image 3 Pro', '清晰度：1K', '比例：1:1', '数量：1 张'])
  })
  it('seedream 4.0 直接省略不存在的参数', () => {
    expect(labels('seedream-4')).toEqual(['模型：seedream 4.0', '清晰度：1K', '数量：1 张'])
  })
  it('Midjourney 按顺序显示四格，不渲染清晰度', () => {
    expect(labels('mj-t2i')).toEqual(['模型：Midjourney-t2i', '比例：1:1', '版本：v7', '速度档：Fast', '数量：1 张'])
  })
})
