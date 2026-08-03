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
  })

  it('权限不足被拦：子账号不能收藏', () => {
    store.getState().setCurrentUser('u_lin')
    const r = store.getState().runFavorite('a_cyber_police')
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

  it('改名只改本地名字，不影响血缘', () => {
    store.getState().runReuse('a_suwan', 'proj_neon') // 复用出一份独立副本
    const copy = store.getState().world.assets.at(-1)
    store.getState().renameAsset(copy.id, '苏晚·北京版')
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === copy.id)
    expect(after.name).toBe('苏晚·北京版')
    expect(after.masterId).toBe('a_suwan') // 血缘还在
  })

  it('设封面：把角色封面换成它某个造型的图，只改 cover、别的不动', () => {
    const suwan = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_suwan')
    // 挑一个不是当前封面的造型（苏晚的赛博造型）
    const target = suwan.looks.find((l: { cover: string }) => l.cover !== suwan.cover)
    expect(target).toBeTruthy()
    store.getState().setCover('a_suwan', target.cover)
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_suwan')
    expect(after.cover).toBe(target.cover) // 封面换了
    expect(after.name).toBe(suwan.name) // 名字没动
    expect(after.baseModel).toBe(suwan.baseModel) // 素模没动
    expect(after.looks.length).toBe(suwan.looks.length) // 造型没动
  })
})

describe('重新生成 / 新增造型（v6 占位动作，只落提示词 + 反馈）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('regenerateBaseModel：只改素模 prompt，不动任何造型', () => {
    const before = byId('a_suwan') // Sunny(主账号) 团队库角色，可重新生成
    const looksBefore = before.looks.map((l: { id: string; prompt?: string }) => ({ id: l.id, prompt: l.prompt }))
    const r = store.getState().regenerateBaseModel('a_suwan', '新素模提示词')
    expect(r.ok).toBe(true)
    const after = byId('a_suwan')
    expect(after.prompt).toBe('新素模提示词') // 素模提示词改了
    expect(after.looks.map((l: { id: string; prompt?: string }) => ({ id: l.id, prompt: l.prompt }))).toEqual(looksBefore) // 造型一个没动
  })

  it('regenerateLook：只改目标造型，不动 baseModel 与其它造型', () => {
    const before = byId('a_suwan')
    const baseModelBefore = before.baseModel
    const otherBefore = before.looks.find((l: { id: string }) => l.id === 'a_suwan_casual').prompt
    const r = store.getState().regenerateLook('a_suwan', 'a_suwan_guofeng', '新国风造型提示词')
    expect(r.ok).toBe(true)
    const after = byId('a_suwan')
    expect(after.looks.find((l: { id: string }) => l.id === 'a_suwan_guofeng').prompt).toBe('新国风造型提示词') // 目标造型改了
    expect(after.baseModel).toBe(baseModelBefore) // 素模没动
    expect(after.looks.find((l: { id: string }) => l.id === 'a_suwan_casual').prompt).toBe(otherBefore) // 别的造型没动
  })

  it('addLook：looks 长度 +1，新造型带上 prompt', () => {
    const before = byId('a_suwan').looks.length
    const r = store.getState().addLook('a_suwan', '一套夜行造型提示词', '夜行造型')
    expect(r.ok).toBe(true)
    const looks = byId('a_suwan').looks
    expect(looks.length).toBe(before + 1)
    const added = looks.at(-1)
    expect(added.name).toBe('夜行造型')
    expect(added.prompt).toBe('一套夜行造型提示词')
  })

  it('权限：子账号对团队库角色不能重新生成 / 新增造型（广场恒挡）', () => {
    store.getState().setCurrentUser('u_lin') // 子账号
    expect(store.getState().regenerateBaseModel('a_suwan', 'x').ok).toBe(false) // 团队库，子账号不行
    expect(store.getState().addLook('a_suwan', 'x').ok).toBe(false)
    store.getState().setCurrentUser('u_admin')
    expect(store.getState().regenerateBaseModel('a_cyber_police', 'x').ok).toBe(false) // 广场恒挡
  })
})

describe('音色（听觉身份锚点，随角色走 · 恒 1 个）', () => {
  it('setVoice 后资产 .voice 更新；clearVoice 后为 undefined', () => {
    const voice = { id: 'preset_voice_m01', type: 'preset' as const, name: '沉稳男声', gender: '男', previewUrl: '/assets/voices/preset_voice_male.mp3' }
    store.getState().setVoice('a_ajie', voice)
    expect(store.getState().world.assets.find((a: { id: string }) => a.id === 'a_ajie').voice.name).toBe('沉稳男声')
    store.getState().clearVoice('a_ajie')
    expect(store.getState().world.assets.find((a: { id: string }) => a.id === 'a_ajie').voice).toBeUndefined()
  })

  it('带音色的角色流转 → 副本带着音色，且是深拷贝（独立引用）', () => {
    const suwan = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_suwan')
    expect(suwan.voice).toBeTruthy() // 种子里苏晚已配音色

    // 四条流转线都走 cloneForCopy，都应带上音色且不共享引用
    store.getState().runReuse('a_suwan', 'proj_neon')            // 团队→项目
    store.getState().runDirectReuse('a_cyber_police', 'proj_neon') // 广场→项目（赛博女警也有音色）
    store.getState().runFavorite('a_cyber_police')               // 广场→团队库
    store.getState().runDeposit('a_ajie')                        // 项目→团队（阿杰无音色，验不炸）

    const reuseCopy = store.getState().world.assets.filter((a: { masterId?: string }) => a.masterId === 'a_suwan').at(-1)
    expect(reuseCopy.voice).toBeTruthy()
    expect(reuseCopy.voice.name).toBe(suwan.voice.name)
    expect(reuseCopy.voice).not.toBe(suwan.voice) // 深拷贝：不是同一个对象引用
  })
})

describe('库内顶层资产名唯一（v5：改名 / 复用 / 直接复用去重）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)
  const projCount = (pid: string) =>
    store.getState().world.assets.filter((a: { scope: string; scopeId?: string }) => a.scope === 'project' && a.scopeId === pid).length

  it('改名撞同库已有顶层名 → 被挡、提示改名', () => {
    // 霓虹东京里已有「霓虹舞者」，把「阿杰」改成「霓虹舞者」应被挡
    const r = store.getState().renameAsset('a_ajie', '霓虹舞者')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
    expect(byId('a_ajie').name).toBe('阿杰') // 没改成
  })

  it('改成不冲突的名字 → 成功', () => {
    const r = store.getState().renameAsset('a_ajie', '阿杰·改')
    expect(r.ok).toBe(true)
    expect(byId('a_ajie').name).toBe('阿杰·改')
  })

  it('跨库同名允许：改成另一个项目已有的名字 → 成功', () => {
    // 山鬼在山海志（proj_shanhai），把霓虹东京的阿杰改成「山鬼」应成功（不同项目各论各的）
    const r = store.getState().renameAsset('a_ajie', '山鬼')
    expect(r.ok).toBe(true)
    expect(byId('a_ajie').name).toBe('山鬼')
  })

  it('复用进已有同名顶层资产的项目 → 被挡；换个项目 → 成功', () => {
    // 先把团队库「苏晚」复用进霓虹东京（此前没有苏晚）→ 成功
    expect(store.getState().runReuse('a_suwan', 'proj_neon').ok).toBe(true)
    const before = projCount('proj_neon')
    // 再复用一次同名进同项目 → 被挡
    const r = store.getState().runReuse('a_suwan', 'proj_neon')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
    expect(projCount('proj_neon')).toBe(before) // 没落库
    // 复用进没有苏晚的另一个项目（山海志）→ 成功
    expect(store.getState().runReuse('a_suwan', 'proj_shanhai').ok).toBe(true)
  })

  it('直接复用进已有同名的项目 → 被挡', () => {
    // 广场「赛博女警」先直接复用进霓虹东京 → 成功
    expect(store.getState().runDirectReuse('a_cyber_police', 'proj_neon').ok).toBe(true)
    // 再直接复用同名进同项目 → 被挡
    const r = store.getState().runDirectReuse('a_cyber_police', 'proj_neon')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
  })
})

describe('收藏去重（广场 → 团队库，v5 改动1）', () => {
  const teamCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length

  it('收藏一份与团队库现有母版同名的广场资产 → 被挡下、提示改名', () => {
    // Sunny(主账号) 先把广场「东方剑客」收藏进团队A团队库 → 团队库 +1
    const before = teamCount()
    expect(store.getState().runFavorite('a_swordsman').ok).toBe(true)
    expect(teamCount()).toBe(before + 1)
    // 再收藏同一份广场资产 → 团队库已有同名，挡下、提示改名
    const r = store.getState().runFavorite('a_swordsman')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
    expect(teamCount()).toBe(before + 1) // 没有再落库
  })

  it('对不冲突的名字（不同广场资产）→ 收藏成功、团队库 +1', () => {
    const before = teamCount()
    const r = store.getState().runFavorite('a_mech_butler') // 机械管家，团队库没有同名
    expect(r.ok).toBe(true)
    expect(teamCount()).toBe(before + 1)
  })
})

describe('审批中心（子账号沉淀 → 主账号审批）', () => {
  const teamCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length

  // 让小林（子账号，分配了霓虹东京）提交一条沉淀申请，返回申请 id
  function subApplies() {
    store.getState().setCurrentUser('u_lin')
    store.getState().runDeposit('a_ajie') // 阿杰在霓虹东京
    const appl = store.getState().applications.at(-1)
    return appl.id as string
  }

  it('通过：团队库 +1、申请变 approved、申请人收到通知', () => {
    const id = subApplies()
    const before = teamCount()
    store.getState().setCurrentUser('u_sunny') // 切回主账号审批
    const r = store.getState().approveApplication(id)
    expect(r.ok).toBe(true)
    expect(teamCount()).toBe(before + 1) // 真的写进团队库了
    const appl = store.getState().applications.find((a: { id: string }) => a.id === id)
    expect(appl.status).toBe('approved')
    const notis = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin')
    expect(notis.length).toBe(1) // 申请人收到回执
  })

  it('驳回：团队库不变、申请变 rejected、申请人收到通知', () => {
    const id = subApplies()
    const before = teamCount()
    store.getState().setCurrentUser('u_sunny')
    const r = store.getState().rejectApplication(id)
    expect(r.ok).toBe(true)
    expect(teamCount()).toBe(before) // 团队库没动
    const appl = store.getState().applications.find((a: { id: string }) => a.id === id)
    expect(appl.status).toBe('rejected')
    expect(store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length).toBe(1)
  })

  it('别团队的主账号无权审批这条申请', () => {
    const id = subApplies()
    store.getState().setCurrentUser('u_ze') // 阿泽是团队B主账号，管不着小林
    const r = store.getState().approveApplication(id)
    expect(r.ok).toBe(false)
    const appl = store.getState().applications.find((a: { id: string }) => a.id === id)
    expect(appl.status).toBe('pending') // 仍是待处理
  })

  it('同一条申请不能重复通过', () => {
    const id = subApplies()
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(id).ok).toBe(true)
    const r2 = store.getState().approveApplication(id) // 再点一次
    expect(r2.ok).toBe(false)
  })
})

describe('广场投稿（主/子账号发起 → admin 审核）', () => {
  const plazaCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'plaza').length

  it('主账号能把团队库资产投稿到广场，生成待审投稿、广场不立即增加', () => {
    const before = plazaCount()
    const r = store.getState().runContribute('a_suwan') // 苏晚在团队A团队库
    expect(r.ok).toBe(true)
    expect(store.getState().plazaSubmissions.length).toBe(1)
    expect(store.getState().plazaSubmissions[0].status).toBe('pending')
    expect(plazaCount()).toBe(before) // 还没上架
  })

  it('子账号也能发起广场投稿（被分配项目里的资产）', () => {
    store.getState().setCurrentUser('u_lin') // 小林，分配了霓虹东京
    const r = store.getState().runContribute('a_ajie') // 阿杰在霓虹东京
    expect(r.ok).toBe(true)
    expect(store.getState().plazaSubmissions[0].submitterId).toBe('u_lin')
  })

  it('admin 通过投稿 → 广场 +1、投稿变 approved、投稿人收到通知', () => {
    store.getState().setCurrentUser('u_lin')
    store.getState().runContribute('a_ajie')
    const sid = store.getState().plazaSubmissions.at(-1).id
    const before = plazaCount()
    store.getState().setCurrentUser('u_admin') // 切到 admin 审核
    const r = store.getState().approvePlazaSubmission(sid)
    expect(r.ok).toBe(true)
    expect(plazaCount()).toBe(before + 1) // 真的上架了
    expect(store.getState().plazaSubmissions.find((x: { id: string }) => x.id === sid).status).toBe('approved')
    expect(store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length).toBe(1)
  })

  it('主账号无权审核广场投稿（只有 admin 能）', () => {
    store.getState().runContribute('a_suwan') // Sunny 投稿
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_ze') // 另一个主账号
    const r = store.getState().approvePlazaSubmission(sid)
    expect(r.ok).toBe(false)
    expect(store.getState().plazaSubmissions.find((x: { id: string }) => x.id === sid).status).toBe('pending')
  })

  it('admin 驳回投稿 → 广场不变、投稿变 rejected、投稿人收到通知', () => {
    store.getState().runContribute('a_suwan')
    const sid = store.getState().plazaSubmissions.at(-1).id
    const before = plazaCount()
    store.getState().setCurrentUser('u_admin')
    const r = store.getState().rejectPlazaSubmission(sid)
    expect(r.ok).toBe(true)
    expect(plazaCount()).toBe(before)
    expect(store.getState().plazaSubmissions.find((x: { id: string }) => x.id === sid).status).toBe('rejected')
    expect(store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_sunny').length).toBe(1)
  })

  it('广场资产不能再投稿到广场（只有团队库/项目资产能投）', () => {
    const r = store.getState().runContribute('a_cyber_police') // 这本来就在广场
    expect(r.ok).toBe(false)
  })
})

describe('广场素材下架 / 删除（admin 下架 · 作者删除；不影响已复用副本）', () => {
  const plazaCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'plaza').length
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  // 小林投稿 a_ajie → admin 通过上架，返回这份广场素材的 id（contributedBy = 小林）
  function contributeAndPublish() {
    store.getState().setCurrentUser('u_lin')
    store.getState().runContribute('a_ajie')
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)
    return store.getState().world.assets.find(
      (a: { scope: string; contributedBy?: string }) => a.scope === 'plaza' && a.contributedBy === 'u_lin',
    ).id as string
  }

  it('admin 下架官方素材 → 广场 -1；已直接复用出去的副本仍在', () => {
    store.getState().runDirectReuse('a_cyber_police', 'proj_neon') // Sunny 先复用一份出去
    const copyId = store.getState().world.assets.at(-1).id
    const before = plazaCount()
    store.getState().setCurrentUser('u_admin')
    const r = store.getState().runRemovePlaza('a_cyber_police')
    expect(r.ok).toBe(true)
    expect(plazaCount()).toBe(before - 1) // 母版下架了
    expect(byId('a_cyber_police')).toBeUndefined()
    expect(byId(copyId)).toBeTruthy() // 副本不受影响
  })

  it('非 admin、非投稿人不能下架官方素材', () => {
    const r = store.getState().runRemovePlaza('a_cyber_police') // 默认 Sunny，既非 admin 也非投稿人
    expect(r.ok).toBe(false)
    expect(byId('a_cyber_police')).toBeTruthy() // 还在
  })

  it('投稿作者能删自己投上去的那份', () => {
    const pid = contributeAndPublish()
    store.getState().setCurrentUser('u_lin') // 作者本人
    const r = store.getState().runRemovePlaza(pid)
    expect(r.ok).toBe(true)
    expect(byId(pid)).toBeUndefined()
  })

  it('别的子账号不能删不是自己投的广场素材', () => {
    const pid = contributeAndPublish()
    store.getState().setCurrentUser('u_may') // 同团队另一个子账号，不是投稿人
    const r = store.getState().runRemovePlaza(pid)
    expect(r.ok).toBe(false)
    expect(byId(pid)).toBeTruthy()
  })

  it('admin 下架作者投稿的素材 → 通知作者', () => {
    const pid = contributeAndPublish()
    const before = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length
    store.getState().setCurrentUser('u_admin')
    store.getState().runRemovePlaza(pid)
    const after = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length
    expect(after).toBe(before + 1)
  })
})

describe('广场投稿 · 可选造型（素模必带，穿衣服的可选）', () => {
  // Sunny(主账号) 贡献 sourceId、勾选 lookIds，admin 通过上架，返回刚上架的广场母版
  function publish(sourceId: string, lookIds: string[]) {
    store.getState().runContribute(sourceId, lookIds)
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)
    store.getState().setCurrentUser('u_sunny')
    return store.getState().world.assets.at(-1)
  }

  it('只贡献素模：上架的广场角色带素模、不带任何造型', () => {
    const p = publish('a_suwan', []) // 苏晚，一个造型都不勾
    expect(p.scope).toBe('plaza')
    expect(p.baseModel).toBeTruthy() // 素模（本体）在
    expect(p.looks ?? []).toHaveLength(0) // 没带造型
  })

  it('勾选部分造型：只带上被选中的那几套（不是一股脑全带）', () => {
    const p = publish('a_suwan', ['a_suwan_guofeng']) // 只勾国风造型
    expect(p.baseModel).toBeTruthy()
    expect(p.looks.length).toBe(1)
    expect(p.looks[0].id).toBe('a_suwan_guofeng')
  })

  it('勾选不属于该角色的造型 → 被拦下', () => {
    const r = store.getState().runContribute('a_suwan', ['a_ajie_look']) // 阿杰的造型，不是苏晚的
    expect(r.ok).toBe(false)
  })
})

describe('删除分层（R1：项目库归零 → 空壳；团队库归零 → 整删）', () => {
  const find = (id: string) => store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('clearAssetImages：清空图片、降级空壳，但保留 name / prompt / voice', () => {
    // 给阿杰（项目·霓虹东京）设一个音色，记下提示词与名字
    store.getState().setVoice('a_ajie', { id: 'v_test', type: 'preset', name: '测试音色', previewUrl: 'x' })
    const before = find('a_ajie')
    const { prompt, name } = before
    const r = store.getState().clearAssetImages('a_ajie')
    expect(r.ok).toBe(true)
    const after = find('a_ajie')
    expect(after.status).toBe('empty')
    expect(after.cover).toBe('')
    expect(after.baseModel).toBeUndefined()
    expect(after.looks).toBeUndefined()
    expect(after.name).toBe(name) // 名字保留
    expect(after.prompt).toBe(prompt) // 提示词保留
    expect(after.voice?.name).toBe('测试音色') // 音色保留
  })

  it('空壳不可流转：沉淀 / 贡献被 assertDone 红线挡下', () => {
    store.getState().clearAssetImages('a_ajie')
    expect(store.getState().runDeposit('a_ajie').ok).toBe(false)
    expect(store.getState().runContribute('a_ajie').ok).toBe(false)
  })

  it('空壳重新生成 → 恢复成品：status done + 落占位图 + 角色补回素模', () => {
    store.getState().clearAssetImages('a_ajie')
    const r = store.getState().regenerateBaseModel('a_ajie', '新的素模提示词')
    expect(r.ok).toBe(true)
    const after = find('a_ajie')
    expect(after.status).toBe('done')
    expect(after.cover).not.toBe('') // 落了占位图
    expect(after.baseModel).toBeTruthy() // 角色补回素模
    expect(after.prompt).toBe('新的素模提示词')
  })

  it('团队库归零 = 整份删除：runDeleteAsset 把团队母版从 world 拿掉', () => {
    const before = store.getState().world.assets.length
    const r = store.getState().runDeleteAsset('a_suwan') // 苏晚在团队A库，主账号 Sunny 可删
    expect(r.ok).toBe(true)
    expect(find('a_suwan')).toBeUndefined()
    expect(store.getState().world.assets.length).toBe(before - 1)
  })

  it('权限：admin 不能清空项目资产（canDeleteLibraryAsset 挡）', () => {
    store.getState().setCurrentUser('u_admin')
    expect(store.getState().clearAssetImages('a_ajie').ok).toBe(false)
  })
})
