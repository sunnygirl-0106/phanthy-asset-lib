/**
 * ═══════════════════════════════════════════════════════════════════════
 * 0810 · 资产状态机不变式（技术文档 §1.1）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 遍历种子里"带候选池"的资产（项目层、非「其他」、非音频），逐条校验两条互斥且穷尽的组合：
 *
 *   图片列表 | cover              | status  | 含义
 *   空       | ''                | empty   | 空壳
 *   非空     | 等于池中某一张 url | done    | 成品
 *
 * ★核心不变量：图片列表非空 ⇔ cover 非空且 ∈ 图片列表。有图必有且仅有一张定稿，不存在待定稿中间态。
 * 永远不允许：候选池空但 cover 非空、候选池非空但 cover 为空。
 *
 * 团队库 / 广场（只带定稿、无候选池）与「其他」/ 音频类目豁免——它们没有候选池。
 */

import { describe, it, expect } from 'vitest'
import { createSeedWorld } from '../data/seed'
import { DEMO_ASSETS } from '../data/demoProject'

describe('资产状态机不变式（0807 · §1.2）', () => {
  const world = createSeedWorld()
  // 项目层的生成类资产不在种子里（演示时才灌入），这里补进来才有东西可校验。
  world.assets.push(...DEMO_ASSETS)
  // 只校验"应当有候选池"的资产：项目层、非「其他」、非音频。
  const pooled = world.assets.filter(
    (a) => a.scope === 'project' && a.category !== 'other' && a.category !== 'audio',
  )

  it('种子里存在带候选池的项目资产可供校验', () => {
    expect(pooled.length).toBeGreaterThan(0)
  })

  for (const a of pooled) {
    it(`「${a.name}」(${a.status}) 满足状态机不变式`, () => {
      const pool = a.candidates ?? []
      if (a.status === 'empty') {
        expect(pool.length).toBe(0)
        expect(a.cover).toBe('')
      } else if (a.status === 'done') {
        expect(pool.length).toBeGreaterThan(0)
        expect(pool.some((c) => c.url === a.cover)).toBe(true)
      }
      // 永不允许：池空但 cover 非空 / 池非空但 cover 为空（★0810 新增后半条）
      expect(pool.length === 0 && a.cover !== '').toBe(false)
      expect(pool.length > 0 && a.cover === '').toBe(false)
    })
  }
})
