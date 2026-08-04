/**
 * ═══════════════════════════════════════════════════════════════════════
 * 0807 · 资产状态机不变式（技术文档 §1.2）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 遍历种子里"带候选池"的资产（项目层、非「其他」、非音频），逐条校验三条互斥且穷尽的组合：
 *
 *   候选池 | cover              | status  | 含义
 *   空     | ''                | empty   | 空壳
 *   非空   | ''                | pending | 待定稿
 *   非空   | 等于池中某一张 url | done    | 成品
 *
 * 永远不允许：cover 非空但不等于池中任何一张（脏指针）、候选池空但 cover 非空。
 *
 * 团队库 / 广场（只带定稿、无候选池）与「其他」/ 音频类目豁免——它们没有候选池。
 */

import { describe, it, expect } from 'vitest'
import { createSeedWorld } from '../data/seed'

describe('资产状态机不变式（0807 · §1.2）', () => {
  const world = createSeedWorld()
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
      } else if (a.status === 'pending') {
        expect(pool.length).toBeGreaterThan(0)
        expect(a.cover).toBe('')
      } else if (a.status === 'done') {
        expect(pool.length).toBeGreaterThan(0)
        expect(pool.some((c) => c.url === a.cover)).toBe(true)
      }
      // 永不允许的组合（不依赖 status，兜底再验一遍）：
      //   · 候选池空但 cover 非空
      expect(pool.length === 0 && a.cover !== '').toBe(false)
      //   · cover 非空但不在池中（脏指针）
      if (a.cover && pool.length) {
        expect(pool.some((c) => c.url === a.cover)).toBe(true)
      }
    })
  }
})
