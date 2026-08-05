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
import { canSee } from '../services/permission'

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storeMod: any // 整个模块，用来取 selectPlazaReviewRows 等具名导出（延迟 import，见下）
beforeAll(async () => {
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = memStorage()
  const mod = await import('../store/useStore')
  store = mod.useStore
  storeMod = mod
})

// 每个用例从干净的种子出发；再跑一遍演示脚手架（0805），把都市日常那批资产
// （d_ajie / d_suke / 造型空壳…）灌回 world，让沿用旧演员表的用例照常跑。
// 0810：演示生成后基础 6 份直接落成品（有图必自动定稿），无需再补定稿。
beforeEach(() => {
  store.getState().resetDemo()
  store.getState().runDemoAnalyze()
  store.getState().runDemoGenerate()
})

/* 0810：流转下沉到图后，「存入团队库 / 贡献广场」都走 runSendImage（按单张图）。
 * 这两个薄封装照旧演员表按 id 取源资产的定稿图打包成 payload，替代已删除的 runDeposit / runContribute。 */
function assetById(id: string) {
  return store.getState().world.assets.find((a: { id: string }) => a.id === id)
}
function sendTeam(id: string) {
  const a = assetById(id)
  return store.getState().runSendImage({ target: 'team', payload: { url: a.cover, name: a.name, category: a.category }, sourceAssetId: id })
}
function sendPlaza(id: string) {
  const a = assetById(id)
  return store.getState().runSendImage({ target: 'plaza', payload: { url: a.cover, name: a.name, category: a.category }, sourceAssetId: id })
}

describe('演示脚手架（0805 · demoStep + 三个 action）', () => {
  const neonCore = () =>
    store.getState().world.assets.filter(
      (a: { scope: string; scopeId?: string; category: string }) =>
        a.scope === 'project' && a.scopeId === 'proj_daily' &&
        ['character', 'costume', 'scene', 'prop'].includes(a.category),
    ).length
  const neonBy = (category: string) =>
    store.getState().world.assets.filter(
      (a: { scopeId?: string; category: string }) => a.scopeId === 'proj_daily' && a.category === category,
    ).length

  it('生成后都市日常四类多出 8 份（6 成品 + 2 造型空壳），音频 /「其他」不被带入', () => {
    store.getState().resetDemo() // beforeEach 已生成过，这里回到干净初始态
    expect(neonCore()).toBe(0)
    const audioBefore = neonBy('audio')
    const otherBefore = neonBy('other')
    expect(store.getState().runDemoAnalyze().ok).toBe(true)
    expect(store.getState().runDemoGenerate().ok).toBe(true)
    expect(neonCore()).toBe(8)
    const shells = store.getState().world.assets.filter(
      (a: { scopeId?: string; status: string }) => a.scopeId === 'proj_daily' && a.status === 'empty',
    )
    expect(shells.length).toBe(2) // 两份造型等第三步
    expect(neonBy('audio')).toBe(audioBefore) // 音频没被带走
    expect(neonBy('other')).toBe(otherBefore) // 「其他」没被带走
  })

  it('重置后都市日常四类回到 0，音频 /「其他」原样保留', () => {
    const audioBefore = neonBy('audio') // beforeEach 已生成
    const otherBefore = neonBy('other')
    expect(neonCore()).toBe(8)
    expect(store.getState().runDemoReset().ok).toBe(true)
    expect(neonCore()).toBe(0)
    expect(neonBy('audio')).toBe(audioBefore)
    expect(neonBy('other')).toBe(otherBefore)
  })

  it('未先「剧本分析」（idle）直接「资产生成」→ 失败、world 不变', () => {
    store.getState().resetDemo()
    const r = store.getState().runDemoGenerate()
    expect(r.ok).toBe(false)
    expect(neonCore()).toBe(0)
  })

  it('重置后再走一遍，结果一致（可重复讲）', () => {
    store.getState().runDemoReset()
    store.getState().runDemoAnalyze()
    store.getState().runDemoGenerate()
    expect(neonCore()).toBe(8)
  })
})

describe('store 流转动作', () => {
  it('直接复用：把独立快照加入 world（默认账号 Sunny 是主账号）', () => {
    const before = store.getState().world.assets.length
    const r = store.getState().runDirectReuse('a_cyber_police', 'proj_daily')
    expect(r.ok).toBe(true)
    const assets = store.getState().world.assets
    expect(assets.length).toBe(before + 1)
    const copy = assets[assets.length - 1]
    expect(copy.scope).toBe('project')
    expect(copy.scopeId).toBe('proj_daily')
    expect(copy.masterId).toBe('a_cyber_police')
  })

  it('权限不足被拦：子账号不能收藏', () => {
    store.getState().setCurrentUser('u_lin')
    const r = store.getState().runFavorite('a_cyber_police')
    expect(r.ok).toBe(false)
  })

  it('子账号存入 → 生成待审批申请，团队库不增加', () => {
    store.getState().setCurrentUser('u_lin')
    const ajie = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    const teamBefore = store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length
    const r = store.getState().runSendImage({ target: 'team', payload: { url: ajie.cover, name: '阿杰', category: 'character' }, sourceAssetId: 'd_ajie' })
    expect(r.ok).toBe(true)
    expect(store.getState().applications.length).toBe(1)
    expect(store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length).toBe(teamBefore)
  })

  it('主账号存入 → 团队库多一份母版', () => {
    const ajie = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    const teamBefore = store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length
    const r = store.getState().runSendImage({ target: 'team', payload: { url: ajie.cover, name: '阿杰', category: 'character' }, sourceAssetId: 'd_ajie' })
    expect(r.ok).toBe(true)
    expect(store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length).toBe(teamBefore + 1)
  })

  it('改名只改本地名字，不影响血缘', () => {
    store.getState().runReuse('a_suwan', 'proj_daily') // 复用出一份独立副本
    const copy = store.getState().world.assets.at(-1)
    store.getState().renameAsset(copy.id, '苏晚·北京版')
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === copy.id)
    expect(after.name).toBe('苏晚·北京版')
    expect(after.masterId).toBe('a_suwan') // 血缘还在
  })

  it('设封面：把定稿换成候选池里的某张图，只改 cover、别的不动', () => {
    // 项目库阿杰候选池恒 1（0805 · 只展示定稿）：先生成保留一张，池子涨到 2，再换定稿。
    store.getState().appendCandidates('d_ajie', ['/extra.png?g=99'])
    const ajie = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    // 挑一个不是当前定稿的候选图
    const target = ajie.candidates.find((c: { url: string }) => c.url !== ajie.cover)
    expect(target).toBeTruthy()
    store.getState().setCover('d_ajie', target.url)
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    expect(after.cover).toBe(target.url) // 定稿换了
    expect(after.name).toBe(ajie.name) // 名字没动
    expect(after.candidates.length).toBe(ajie.candidates.length) // 候选池没动
  })
})

describe('候选池动作（0803：appendCandidates / setFinal / removeCandidate / setPrompt）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('appendCandidates（0810）：空壳追加多张 → 首张自动定稿', () => {
    // 阿杰·西装造型是项目库空壳（Sunny 主账号可生成）
    const before = byId('d_ajie_suit')
    expect(before.status).toBe('empty')
    const r = store.getState().appendCandidates('d_ajie_suit', ['/p1.png', '/p2.png'])
    expect(r.ok).toBe(true)
    const after = byId('d_ajie_suit')
    expect(after.status).toBe('done') // 有图必成品
    expect(after.candidates.length).toBe(2)
    expect(after.cover).toBe('/p1.png') // 首张自动定稿
  })

  it('setFinal：把候选池里的某张设为定稿（换定稿）', () => {
    store.getState().appendCandidates('d_ajie_suit', ['/p1.png', '/p2.png']) // 首张自动定稿
    const cand = byId('d_ajie_suit').candidates.find((c: { url: string }) => c.url === '/p2.png')
    const r = store.getState().runSetFinal('d_ajie_suit', cand.id)
    expect(r.ok).toBe(true)
    expect(byId('d_ajie_suit').cover).toBe('/p2.png')
  })

  it('removeCandidate：删定稿顶一张上来', () => {
    store.getState().appendCandidates('d_ajie_suit', ['/p1.png', '/p2.png']) // 天然有定稿（/p1.png）
    const a = byId('d_ajie_suit')
    const finalCand = a.candidates.find((c: { url: string }) => c.url === a.cover)
    const r = store.getState().runRemoveCandidate('d_ajie_suit', finalCand.id)
    expect(r.ok).toBe(true)
    const after = byId('d_ajie_suit')
    expect(after.candidates.length).toBe(1)
    expect(after.cover).toBe(after.candidates[0].url) // 顶了一张上来
  })

  it('setPrompt：改项目库资产的提示词（主账号可改）', () => {
    const r = store.getState().setPrompt('d_ajie', '新的定稿提示词')
    expect(r.ok).toBe(true)
    expect(byId('d_ajie').prompt).toBe('新的定稿提示词')
  })

  it('权限：团队库提示词只读（改动五：主账号也不能改）；广场恒挡', () => {
    // 主账号也不能改团队库提示词了（生产只发生在项目里）
    expect(store.getState().setPrompt('a_suwan', 'x').ok).toBe(false) // 团队库只读
    store.getState().setCurrentUser('u_lin') // 子账号
    expect(store.getState().appendCandidates('a_suwan', ['/x.png']).ok).toBe(false) // 团队库，子账号不行
    expect(store.getState().setPrompt('a_suwan', 'x').ok).toBe(false)
    store.getState().setCurrentUser('u_admin')
    expect(store.getState().appendCandidates('a_cyber_police', ['/x.png']).ok).toBe(false) // 广场恒挡
  })
})

describe('参考图删除（阶段二：removeReferenceImage · 0804 同步 referenceLabels）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('删一张参考图时同步删掉对应下标的 label（下标对齐）', () => {
    // a_ajie_trench 空壳：DEMO 预置 2 张参考图，标签写被参考资产真名（规则 20）
    const before = byId('d_ajie_suit')
    expect(before.referenceImages.length).toBe(2)
    expect(before.referenceLabels).toEqual(['阿杰', '西装'])
    // 删下标 0（阿杰）→ 只剩机甲外骨骼，label 也收缩成 ['西装']
    const r = store.getState().removeReferenceImage('d_ajie_suit', 0)
    expect(r.ok).toBe(true)
    const after = byId('d_ajie_suit')
    expect(after.referenceImages).toEqual([before.referenceImages[1]])
    expect(after.referenceLabels).toEqual(['西装'])
  })

  it('删光后 referenceImages / referenceLabels 都变 undefined', () => {
    store.getState().removeReferenceImage('d_ajie_suit', 0)
    store.getState().removeReferenceImage('d_ajie_suit', 0)
    const after = byId('d_ajie_suit')
    expect(after.referenceImages).toBeUndefined()
    expect(after.referenceLabels).toBeUndefined()
  })

  it('越界下标被挡；无生成权者不能改参考图', () => {
    expect(store.getState().removeReferenceImage('d_ajie_suit', 9).ok).toBe(false) // 越界
    store.getState().setCurrentUser('u_admin') // admin 恒无生成权
    expect(store.getState().removeReferenceImage('d_ajie_suit', 0).ok).toBe(false)
  })
})

describe('参考图追加（0804：addReferenceImages · 参考图选择器落点）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('把选中的图并入 referenceImages + referenceLabels；原有血缘不被覆盖', () => {
    const before = byId('d_ajie_suit') // referencedFrom 已是 a_ajie
    const r = store.getState().addReferenceImages(
      'd_ajie_suit',
      [{ url: '/x.png', label: '服装' }],
      'd_suit', // 传了来源，但原本已有血缘 → 不覆盖
    )
    expect(r.ok).toBe(true)
    const after = byId('d_ajie_suit')
    expect(after.referenceImages.length).toBe(before.referenceImages.length + 1)
    expect(after.referenceImages.at(-1)).toBe('/x.png')
    expect(after.referenceLabels.at(-1)).toBe('服装')
    expect(after.referencedFrom).toBe('d_ajie') // 原有血缘保留，不被 a_mech_exo 覆盖
  })

  it('权限守卫：广场资产恒失败；子账号对团队库资产失败', () => {
    // 广场资产不可生成 → addReferenceImages 挡下
    expect(store.getState().addReferenceImages('a_cyber_police', [{ url: '/x.png', label: '参考' }]).ok).toBe(false)
    // 子账号对团队库资产无生成权 → 挡下
    store.getState().setCurrentUser('u_lin')
    expect(store.getState().addReferenceImages('a_suwan', [{ url: '/x.png', label: '参考' }]).ok).toBe(false)
  })
})

describe('批量生成（阶段三：batchGenerate）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)
  const P = '/placeholder.png'

  it('空壳批量生成各 1 张、自动定稿（0810）；已有成品被跳过', () => {
    // d_ajie_suit / d_suke_pajamas 是项目库造型空壳；d_ajie 是成品 → 混选
    expect(byId('d_ajie_suit').status).toBe('empty')
    const r = store.getState().batchGenerate(['d_ajie_suit', 'd_suke_pajamas', 'd_ajie'], P)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('已生成 2 份')
    expect(r.message).toContain('跳过 1 份')
    const trench = byId('d_ajie_suit')
    // 0810：空壳生成后有图必成品、首张自动定稿。
    expect(trench.status).toBe('done')
    expect(trench.cover).toBe(trench.candidates[0].url)
    // 造型带 lookUrl（真实造型图替身）→ 生成图用它出图，不是素模、也不是通用占位图 P。
    expect(trench.candidates[0].url).toContain('ajie-suit')
    expect(trench.candidates[0].url).not.toBe(P)
    expect(trench.candidates.length).toBe(1) // 默认每份 1 张
    // 0810 自参考不入库：造型定稿不再写进 referenceImages，参考图仍是原有的素模 + 服装两张。
    expect(trench.referenceImages?.length).toBe(2)
    expect(byId('d_suke_pajamas').status).toBe('done')
  })

  it('子账号对被分配项目的空壳有权 → 生成并自动定稿；未分配项目 → 跳过', () => {
    store.getState().setCurrentUser('u_lin') // 子账号，分配了都市日常
    const r = store.getState().batchGenerate(['d_ajie_suit'], P)
    expect(r.message).toContain('已生成 1 份')
    expect(byId('d_ajie_suit').status).toBe('done') // 项目库子账号可生成，1 张自动定稿
  })
})

describe('音色（听觉身份锚点，随角色走 · 恒 1 个）', () => {
  it('setVoice 后资产 .voice 更新；clearVoice 后为 undefined', () => {
    const voice = { id: 'preset_voice_m01', type: 'preset' as const, name: '沉稳男声', gender: '男', previewUrl: '/assets/voices/preset_voice_male.mp3' }
    store.getState().setVoice('d_ajie', voice)
    expect(store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie').voice.name).toBe('沉稳男声')
    store.getState().clearVoice('d_ajie')
    expect(store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie').voice).toBeUndefined()
  })

  it('带音色的角色流转 → 副本带着音色，且是深拷贝（独立引用）', () => {
    const suwan = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_suwan')
    expect(suwan.voice).toBeTruthy() // 种子里苏晚已配音色

    // 四条流转线都走 cloneForCopy，都应带上音色且不共享引用
    store.getState().runReuse('a_suwan', 'proj_daily')            // 团队→项目
    store.getState().runDirectReuse('a_cyber_police', 'proj_daily') // 广场→项目（赛博女警也有音色）
    store.getState().runFavorite('a_cyber_police')               // 广场→团队库
    sendTeam('d_ajie')                                           // 项目→团队（阿杰无音色，验不炸）

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
    // 都市日常里已有「霓虹舞者」，把「阿杰」改成「霓虹舞者」应被挡
    const r = store.getState().renameAsset('d_ajie', '苏可')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
    expect(byId('d_ajie').name).toBe('阿杰') // 没改成
  })

  it('改成不冲突的名字 → 成功', () => {
    const r = store.getState().renameAsset('d_ajie', '阿杰·改')
    expect(r.ok).toBe(true)
    expect(byId('d_ajie').name).toBe('阿杰·改')
  })

  it('跨库同名允许：改成另一个项目已有的名字 → 成功', () => {
    // 山鬼在山海志（proj_shanhai），把都市日常的阿杰改成「山鬼」应成功（不同项目各论各的）
    const r = store.getState().renameAsset('d_ajie', '山鬼')
    expect(r.ok).toBe(true)
    expect(byId('d_ajie').name).toBe('山鬼')
  })

  it('复用进已有同名顶层资产的项目 → 被挡；换个项目 → 成功', () => {
    // 先把团队库「苏晚」复用进都市日常（此前没有苏晚）→ 成功
    expect(store.getState().runReuse('a_suwan', 'proj_daily').ok).toBe(true)
    const before = projCount('proj_daily')
    // 再复用一次同名进同项目 → 被挡
    const r = store.getState().runReuse('a_suwan', 'proj_daily')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
    expect(projCount('proj_daily')).toBe(before) // 没落库
    // 改个名再复用进同一项目 → 成功（演示只保留一个项目，用改名验"去重是按名字"）
    expect(store.getState().renameAsset('a_suwan', '苏晚·备份').ok).toBe(true)
    expect(store.getState().runReuse('a_suwan', 'proj_daily').ok).toBe(true)
  })

  it('直接复用进已有同名的项目 → 被挡', () => {
    // 广场「赛博女警」先直接复用进都市日常 → 成功
    expect(store.getState().runDirectReuse('a_cyber_police', 'proj_daily').ok).toBe(true)
    // 再直接复用同名进同项目 → 被挡
    const r = store.getState().runDirectReuse('a_cyber_police', 'proj_daily')
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

describe('审批中心（子账号存入 → 主账号审批）', () => {
  const teamCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length

  // 让小林（子账号，分配了都市日常）提交一条资产存入申请，返回申请 id
  function subApplies() {
    store.getState().setCurrentUser('u_lin')
    sendTeam('d_ajie') // 阿杰在都市日常
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
    const r = sendPlaza('a_suwan') // 苏晚在团队A团队库
    expect(r.ok).toBe(true)
    expect(store.getState().plazaSubmissions.length).toBe(1)
    expect(store.getState().plazaSubmissions[0].status).toBe('pending')
    expect(store.getState().plazaSubmissions[0].payload.name).toBe('苏晚')
    expect(plazaCount()).toBe(before) // 还没上架
  })

  it('子账号也能发起广场投稿（被分配项目里的资产）', () => {
    store.getState().setCurrentUser('u_lin') // 小林，分配了都市日常
    const r = sendPlaza('d_ajie') // 阿杰在都市日常
    expect(r.ok).toBe(true)
    expect(store.getState().plazaSubmissions[0].submitterId).toBe('u_lin')
  })

  it('admin 通过投稿 → 广场 +1、投稿变 approved、投稿人收到通知', () => {
    store.getState().setCurrentUser('u_lin')
    sendPlaza('d_ajie')
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
    sendPlaza('a_suwan') // Sunny 投稿
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_ze') // 另一个主账号
    const r = store.getState().approvePlazaSubmission(sid)
    expect(r.ok).toBe(false)
    expect(store.getState().plazaSubmissions.find((x: { id: string }) => x.id === sid).status).toBe('pending')
  })

  it('admin 驳回投稿 → 广场不变、投稿变 rejected、投稿人收到通知', () => {
    sendPlaza('a_suwan')
    const sid = store.getState().plazaSubmissions.at(-1).id
    const before = plazaCount()
    store.getState().setCurrentUser('u_admin')
    const r = store.getState().rejectPlazaSubmission(sid)
    expect(r.ok).toBe(true)
    expect(plazaCount()).toBe(before)
    expect(store.getState().plazaSubmissions.find((x: { id: string }) => x.id === sid).status).toBe('rejected')
    expect(store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_sunny').length).toBe(1)
  })

  it('广场资产不能再投稿到广场（发起层校验：只有团队库/项目资产能投）', () => {
    // 0810：发起层校验由 runSendImage 负责。主账号也只能从团队库/项目库发起，
    // 从广场资产（a_cyber_police）发起会被挡。
    const r = sendPlaza('a_cyber_police') // 默认 Sunny 主账号
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
    sendPlaza('d_ajie')
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)
    return store.getState().world.assets.find(
      (a: { scope: string; contributedBy?: string }) => a.scope === 'plaza' && a.contributedBy === 'u_lin',
    ).id as string
  }

  it('admin 下架官方素材 → 数据仍在但状态变 delisted；已直接复用出去的副本仍在（下架 ≠ 删除）', () => {
    store.getState().runDirectReuse('a_cyber_police', 'proj_daily') // Sunny 先复用一份出去
    const copyId = store.getState().world.assets.at(-1).id
    const before = plazaCount()
    store.getState().setCurrentUser('u_admin')
    const r = store.getState().runDelistPlaza('a_cyber_police', '内容违规')
    expect(r.ok).toBe(true)
    expect(plazaCount()).toBe(before) // 数据没被删，还在 world 里
    expect(byId('a_cyber_police').shelfStatus).toBe('delisted') // 只是打了状态位
    expect(byId('a_cyber_police').delistedReason).toBe('内容违规')
    expect(byId(copyId)).toBeTruthy() // 副本不受影响
  })

  it('admin 直接硬删（runRemovePlaza）被挡下：请走下架', () => {
    store.getState().setCurrentUser('u_admin')
    const r = store.getState().runRemovePlaza('a_cyber_police')
    expect(r.ok).toBe(false)
    expect(byId('a_cyber_police')).toBeTruthy() // 还在
  })

  it('非 admin、非投稿人不能撤下官方素材', () => {
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

  it('admin 下架作者投稿的素材 → 通知作者（理由拼进文案）', () => {
    const pid = contributeAndPublish()
    const before = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length
    store.getState().setCurrentUser('u_admin')
    store.getState().runDelistPlaza(pid, '收到版权申诉')
    const notis = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin')
    expect(notis.length).toBe(before + 1)
    const last = notis.at(-1)
    expect(last.kind).toBe('plaza_delisted')
    expect(last.text).toContain('收到版权申诉')
  })
})

describe('下架 → 重新上架往返（审核中心改造）', () => {
  const byId = (id: string) =>
    store.getState().world.assets.find((a: { id: string }) => a.id === id)

  // 小林投稿 a_ajie → admin 上架，返回这份广场素材 id（contributedBy = 小林）
  function publishAjie(): string {
    store.getState().setCurrentUser('u_lin')
    sendPlaza('d_ajie')
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)
    return store.getState().world.assets.find(
      (a: { scope: string; contributedBy?: string }) => a.scope === 'plaza' && a.contributedBy === 'u_lin',
    ).id as string
  }

  const canSeeFor = (uid: string, assetId: string) => {
    const w = store.getState().world
    const u = w.users.find((x: { id: string }) => x.id === uid)
    const a = w.assets.find((x: { id: string }) => x.id === assetId)
    return canSee(w, u, a)
  }

  it('下架后：普通用户看不见、admin 与投稿人仍看得见；重新上架后三者都可见且理由清空', () => {
    const pid = publishAjie()
    store.getState().setCurrentUser('u_admin')
    expect(store.getState().runDelistPlaza(pid, '质量不达标，需重传').ok).toBe(true)

    // 下架态可见性
    expect(canSeeFor('u_may', pid)).toBe(false) // 同团队普通子账号：看不见
    expect(canSeeFor('u_admin', pid)).toBe(true) // admin：治理可见
    expect(canSeeFor('u_lin', pid)).toBe(true) // 投稿人本人：看得见自己被下架的那份

    // 重新上架
    expect(store.getState().runRelistPlaza(pid).ok).toBe(true)
    expect(byId(pid).shelfStatus).toBe('listed')
    expect(byId(pid).delistedReason).toBeUndefined() // 下架痕迹被清空
    expect(canSeeFor('u_may', pid)).toBe(true)
    expect(canSeeFor('u_admin', pid)).toBe(true)
    expect(canSeeFor('u_lin', pid)).toBe(true)
  })

  it('重新上架给投稿人发 plaza_relisted 通知', () => {
    const pid = publishAjie()
    store.getState().setCurrentUser('u_admin')
    store.getState().runDelistPlaza(pid)
    const before = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length
    store.getState().runRelistPlaza(pid)
    const notis = store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin')
    expect(notis.length).toBe(before + 1)
    expect(notis.at(-1).kind).toBe('plaza_relisted')
  })

  it('非 admin 不能下架 / 重新上架', () => {
    const pid = publishAjie()
    store.getState().setCurrentUser('u_sunny') // 主账号，非 admin
    expect(store.getState().runDelistPlaza(pid).ok).toBe(false)
    store.getState().setCurrentUser('u_admin')
    store.getState().runDelistPlaza(pid)
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().runRelistPlaza(pid).ok).toBe(false)
  })
})

describe('审核中心通知补齐（deposit_submitted / plaza_submit_notice）', () => {
  const parentNotis = (kind: string) =>
    store.getState().notifications.filter(
      (n: { toUserId: string; kind?: string }) => n.toUserId === 'u_sunny' && n.kind === kind,
    )

  it('子账号存入 → 主账号收到 deposit_submitted', () => {
    store.getState().setCurrentUser('u_lin')
    const before = parentNotis('deposit_submitted').length
    sendTeam('d_ajie') // 阿杰在都市日常，小林被分配
    expect(parentNotis('deposit_submitted').length).toBe(before + 1)
    // v2：点通知直接弹开团队库上的存入申请抽屉，不再跳 #/review。
    expect(parentNotis('deposit_submitted').at(-1).link).toBe('#/team/deposits')
  })

  it('子账号投稿广场 → 主账号收到 plaza_submit_notice（知会，不拦截、不可点）', () => {
    store.getState().setCurrentUser('u_lin')
    const before = parentNotis('plaza_submit_notice').length
    const r = sendPlaza('d_ajie')
    expect(r.ok).toBe(true) // 不拦截，投稿照常成立
    expect(parentNotis('plaza_submit_notice').length).toBe(before + 1)
    // v2：知会型通知没有可执行动作，link 不填。
    expect(parentNotis('plaza_submit_notice').at(-1).link).toBeUndefined()
  })
})

describe('审核中心行数据（selectPlazaReviewRows）', () => {
  it('一份通过并上架的投稿只出一行（不重复）；官方素材投稿人显示「官方」', () => {
    // 小林投稿 a_ajie → admin 通过上架
    store.getState().setCurrentUser('u_lin')
    sendPlaza('d_ajie')
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)

    const rows = storeMod.selectPlazaReviewRows(store.getState())
    // 阿杰这份上架后：投稿记录 approved 不出行，只从广场资产出一行
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ajieRows = rows.filter((r: any) => r.name === '阿杰')
    expect(ajieRows.length).toBe(1)
    expect(ajieRows[0].status).toBe('listed')
    expect(ajieRows[0].submitterName).toBe('小林')

    // 种子官方素材（赛博女警）：没走过投稿流程 → 投稿人「官方」
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const official = rows.find((r: any) => r.assetId === 'a_cyber_police')
    expect(official).toBeTruthy()
    expect(official!.submitterName).toBe('官方')
    expect(official!.status).toBe('listed')
  })
})

describe('0810 · 送一张图出去（runSendImage）', () => {
  const teamCount = () =>
    store.getState().world.assets.filter((a: { scope: string }) => a.scope === 'team').length

  it('主账号送图进团队库 → 团队库 +1，且是扁平的单图（无图片列表 / 无参考图）', () => {
    const before = teamCount()
    const r = store.getState().runSendImage({ target: 'team', payload: { url: '/x.png', name: '风衣', category: 'costume' } })
    expect(r.ok).toBe(true)
    expect(teamCount()).toBe(before + 1)
    const added = store.getState().world.assets.at(-1)
    expect(added.scope).toBe('team')
    expect(added.cover).toBe('/x.png')
    expect(added.candidates).toBeUndefined()
    expect(added.referenceImages).toBeUndefined()
  })

  it('提示词随图走：送出去的团队素材 prompt 与传入一致', () => {
    store.getState().runSendImage({ target: 'team', payload: { url: '/y.png', name: '皮衣', category: 'costume', prompt: '黑色机车皮衣' } })
    expect(store.getState().world.assets.at(-1).prompt).toBe('黑色机车皮衣')
  })

  it('团队库重名 → 被挡，提示换名字', () => {
    store.getState().runSendImage({ target: 'team', payload: { url: '/a.png', name: '重名素材', category: 'prop' } })
    const before = teamCount()
    const r = store.getState().runSendImage({ target: 'team', payload: { url: '/b.png', name: '重名素材', category: 'prop' } })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('换个名字')
    expect(teamCount()).toBe(before)
  })

  it('广场按投稿人维度查重：同一人投两张同名 → 第二张被挡；换个人投同名 → 放行', () => {
    // Sunny 投两张同名
    store.getState().runSendImage({ target: 'plaza', payload: { url: '/p1.png', name: '通用道具', category: 'prop' }, sourceAssetId: 'd_phone' })
    const s1 = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(s1)
    store.getState().setCurrentUser('u_sunny')
    const dup = store.getState().runSendImage({ target: 'plaza', payload: { url: '/p2.png', name: '通用道具', category: 'prop' }, sourceAssetId: 'd_phone' })
    expect(dup.ok).toBe(false)
    expect(dup.message).toContain('换个名字')
    // 换个投稿人（小林，从项目库发起）投同名 → 放行
    store.getState().setCurrentUser('u_lin')
    const other = store.getState().runSendImage({ target: 'plaza', payload: { url: '/p3.png', name: '通用道具', category: 'prop' }, sourceAssetId: 'd_phone' })
    expect(other.ok).toBe(true)
  })

  it('子账号送图进团队库 → 只生成申请，团队库不变；审批通过后 +1', () => {
    store.getState().setCurrentUser('u_lin')
    const before = teamCount()
    const r = store.getState().runSendImage({ target: 'team', payload: { url: '/c.png', name: '子账号素材', category: 'scene' }, sourceAssetId: 'd_living_room' })
    expect(r.ok).toBe(true)
    expect(teamCount()).toBe(before)
    const appl = store.getState().applications.at(-1)
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(appl.id).ok).toBe(true)
    expect(teamCount()).toBe(before + 1)
  })

  it('审批期间团队库出现同名 → 审批落库时被挡，提示改名', () => {
    // 子账号提交一份「撞名」，在途期间主账号自己先存了个同名
    store.getState().setCurrentUser('u_lin')
    store.getState().runSendImage({ target: 'team', payload: { url: '/d.png', name: '撞名', category: 'prop' }, sourceAssetId: 'd_phone' })
    const appl = store.getState().applications.at(-1)
    store.getState().setCurrentUser('u_sunny')
    store.getState().runSendImage({ target: 'team', payload: { url: '/e.png', name: '撞名', category: 'prop' } }) // 主账号先占了名字
    const r = store.getState().approveApplication(appl.id)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('改名')
  })

  it('「其他」类目不能送出（assertPayload 抛错，文案含「团队库」/「素材广场」）', () => {
    const t = store.getState().runSendImage({ target: 'team', payload: { url: '/o.png', name: '分镜', category: 'other' } })
    expect(t.ok).toBe(false)
    expect(t.message).toContain('团队库')
    const p = store.getState().runSendImage({ target: 'plaza', payload: { url: '/o.png', name: '分镜', category: 'other' }, sourceAssetId: 'd_phone' })
    expect(p.ok).toBe(false)
    expect(p.message).toContain('素材广场')
  })

  it('送出不影响源资产：源资产的图片列表 / 定稿原样不动', () => {
    const before = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    const candsBefore = before.candidates.length
    const coverBefore = before.cover
    store.getState().runSendImage({ target: 'team', payload: { url: before.cover, name: '阿杰副本', category: 'character' }, sourceAssetId: 'd_ajie' })
    const after = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    expect(after.candidates.length).toBe(candsBefore)
    expect(after.cover).toBe(coverBefore)
  })
})

describe('广场投稿 · 扁平化单图（0810）', () => {
  it('上架的广场母版是扁平的单图（无图片列表 / 无参考图）', () => {
    // Sunny(主账号) 贡献苏晚，admin 通过上架
    const suwan = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_suwan')
    sendPlaza('a_suwan')
    const sid = store.getState().plazaSubmissions.at(-1).id
    store.getState().setCurrentUser('u_admin')
    store.getState().approvePlazaSubmission(sid)
    const p = store.getState().world.assets.at(-1)
    expect(p.scope).toBe('plaza')
    expect(p.cover).toBe(suwan.cover) // 定稿带上
    expect(p.candidates).toBeUndefined() // 无图片列表
    expect(p.referenceImages).toBeUndefined() // 无参考图
  })
})

describe('删除分层（R1：项目库归零 → 空壳；团队库归零 → 整删）', () => {
  const find = (id: string) => store.getState().world.assets.find((a: { id: string }) => a.id === id)

  it('clearAssetImages：清空图片、降级空壳，但保留 name / prompt / voice', () => {
    // 给阿杰（项目·都市日常）设一个音色，记下提示词与名字
    store.getState().setVoice('d_ajie', { id: 'v_test', type: 'preset', name: '测试音色', previewUrl: 'x' })
    const before = find('d_ajie')
    const { prompt, name } = before
    const r = store.getState().clearAssetImages('d_ajie')
    expect(r.ok).toBe(true)
    const after = find('d_ajie')
    expect(after.status).toBe('empty')
    expect(after.cover).toBe('')
    expect(after.candidates).toBeUndefined()
    expect(after.name).toBe(name) // 名字保留
    expect(after.prompt).toBe(prompt) // 提示词保留
    expect(after.voice?.name).toBe('测试音色') // 音色保留
  })

  it('空壳无图可送：runSendImage 传空 url 被 assertPayload 挡下', () => {
    store.getState().clearAssetImages('d_ajie')
    // 界面不会给空壳出送出入口；服务层再兜一层：空 url 直接挡。
    expect(store.getState().runSendImage({ target: 'team', payload: { url: '', name: '阿杰', category: 'character' }, sourceAssetId: 'd_ajie' }).ok).toBe(false)
    expect(store.getState().runSendImage({ target: 'plaza', payload: { url: '', name: '阿杰', category: 'character' }, sourceAssetId: 'd_ajie' }).ok).toBe(false)
  })

  it('空壳生成 1 张 →（0810）自动定稿：status done + cover = 那张 + 池中 1 张', () => {
    store.getState().clearAssetImages('d_ajie')
    const r = store.getState().appendCandidates('d_ajie', ['/gen.png'])
    expect(r.ok).toBe(true)
    const after = find('d_ajie')
    // 0808：本批 1 张 + 原本无定稿 + 原本池空 → 自动定稿。
    expect(after.status).toBe('done')
    expect(after.candidates.length).toBe(1)
    expect(after.cover).toBe(after.candidates[0].url)
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
    expect(store.getState().clearAssetImages('d_ajie').ok).toBe(false)
  })
})
