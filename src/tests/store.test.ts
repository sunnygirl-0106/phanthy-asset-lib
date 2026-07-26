/**
 * 【测试】store.test.ts —— 证明"服务算、store 存"这条链成立
 *
 * logic-core.test.ts 验的是纯函数规则；这里验的是"点按钮之后 world 真的变了"：
 * store 动作调用 assetService 算出副本，再不可变地提交进 world。
 *
 * 小技巧：store 用了 localStorage 持久化，而 Node 测试环境没有 localStorage，
 * 所以先塞一个内存版的 localStorage，再动态 import store（保证 import 时它已存在）。
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any
beforeAll(async () => {
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = memStorage()
  const mod = await import('../store/useStore')
  store = mod.useStore
})

beforeEach(() => store.getState().resetDemo()) // 每个用例从干净的种子出发

describe('store 流转动作', () => {
  it('直接复用：把独立快照加入 world（默认账号 Sunny 是主账号）', () => {
    const before = store.getState().world.assets.length
    const r = store.getState().runDirectReuse('a_cyber_police', 'proj_neon')
    expect(r.ok).toBe(true)
    const assets = store.getState().world.assets
    expect(assets.length).toBe(before + 1)
    const copy = assets[assets.length - 1]
    expect(copy.scope).toBe('project')
    expect(copy.scopeId).toBe('proj_neon')
    expect(copy.masterId).toBe('a_cyber_police')
    expect(copy.following).toBe(false)
  })

  it('权限不足被拦：子账号不能收藏', () => {
    store.getState().setCurrentUser('u_lin')
    const r = store.getState().runFavorite('a_cyber_police', false)
    expect(r.ok).toBe(false)
  })

  it('子账号沉淀 → 生成待审批申请，团队库不增加', () => {
    store.getState().setCurrentUser('u_lin')
    const teamBefore = store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length
    const r = store.getState().runDeposit('a_ajie') // 阿杰在霓虹东京，小林被分配
    expect(r.ok).toBe(true)
    expect(store.getState().applications.length).toBe(1)
    expect(store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length).toBe(teamBefore)
  })

  it('主账号沉淀 → 团队库多一份母版', () => {
    const teamBefore = store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length
    const r = store.getState().runDeposit('a_ajie')
    expect(r.ok).toBe(true)
    expect(store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length).toBe(teamBefore + 1)
  })

  it('改名只改本地名字，不影响血缘、不断链', () => {
    store.getState().runReuse('a_suwan', 'proj_neon', true) // 复用出一个跟随中的副本
    const copy = store.getState().world.assets.at(-1)
    store.getState().renameAsset(copy.id, '苏晚·北京版')
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === copy.id)
    expect(after.name).toBe('苏晚·北京版')
    expect(after.masterId).toBe('a_suwan') // 血缘还在
    expect(after.following).toBe(true) // 改名不断链
  })
})
