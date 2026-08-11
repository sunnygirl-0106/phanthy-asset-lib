/**
 * 【测试】sort.test.ts —— 资产库排序口径（0814 · PRD #2 / #31）
 *
 * 排序枚举收成四项后，最容易出分歧的是"名称 A→Z 到底怎么排中文"。
 * 这里把口径钉死：中文按拼音、数字按自然序、优先级 数字 → 英文 → 中文。
 * 两个库共用 compareBySort，所以钉住它就等于钉住两个页面。
 */

import { describe, it, expect } from 'vitest'
import { compareBySort, SORT_OPTIONS } from '../components/SortMenu'

const at = (name: string, createdAt: number) => ({ name, createdAt })
const sortBy = (list: { name: string; createdAt: number }[], key: Parameters<typeof compareBySort>[2]) =>
  [...list].sort((a, b) => compareBySort(a, b, key)).map((x) => x.name)

describe('排序枚举只有四项（智能排序已下线）', () => {
  it('枚举与文案固定', () => {
    expect(SORT_OPTIONS.map((o) => o.key)).toEqual(['timeDesc', 'timeAsc', 'nameAsc', 'nameDesc'])
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['时间倒序', '时间正序', '名称 A→Z', '名称 Z→A'])
  })
})

describe('时间排序', () => {
  const list = [at('早', 1), at('晚', 3), at('中', 2)]
  it('时间倒序 = 新的在前', () => expect(sortBy(list, 'timeDesc')).toEqual(['晚', '中', '早']))
  it('时间正序 = 老的在前', () => expect(sortBy(list, 'timeAsc')).toEqual(['早', '中', '晚']))
})

describe('名称排序', () => {
  it('中文按拼音，不是按 Unicode 码位', () => {
    // 码位序会是 阿(963f) < 苏(82cf)? 实际 苏(82cf) < 阿(963f)，拼音序才是 阿 < 苏 < 周
    expect(sortBy([at('周', 1), at('苏可', 1), at('阿杰', 1)], 'nameAsc')).toEqual(['阿杰', '苏可', '周'])
  })

  it('数字按自然序（10 排在 2 后面，而不是前面）', () => {
    expect(sortBy([at('镜头10', 1), at('镜头2', 1), at('镜头1', 1)], 'nameAsc'))
      .toEqual(['镜头1', '镜头2', '镜头10'])
  })

  it('优先级：数字 → 英文 → 中文', () => {
    expect(sortBy([at('阿杰', 1), at('Ajay', 1), at('1号机', 1)], 'nameAsc'))
      .toEqual(['1号机', 'Ajay', '阿杰'])
  })

  it('Z→A 就是 A→Z 的反序', () => {
    const list = [at('周', 1), at('苏可', 1), at('阿杰', 1)]
    expect(sortBy(list, 'nameDesc')).toEqual([...sortBy(list, 'nameAsc')].reverse())
  })
})
