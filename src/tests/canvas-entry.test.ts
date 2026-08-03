/**
 * 【测试】canvas-entry.test.ts —— 画布两入口的规则断言（技术规划 §8 阶段 4 稳定性检查）
 *
 * 覆盖 8 条：
 *  ① 空壳/生成中节点无"上传"入口、成品有
 *  ② 文本/视频节点无"上传"入口，图片/音频有
 *  ③ 图片上传选类目后进项目库为 done
 *  ④ 图片新建角色带 baseModel；关联已有→挂到已有资产 looks
 *  ⑤ 从团队库/广场拖来上传→项目副本且带 masterId；从项目库拖来→无"上传"入口
 *  ⑥ 拖到画布本身不新增 world.assets（只有上传才 +1）
 *  ⑦ 子账号画布上传项目库免审直接进，项目→团队沉淀才生成申请
 *  ⑧ 沉淀时团队库同名→提示改名（被挡下）
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  canUploadToProject,
  categoriesForMedia,
  saveCanvasNodeToProject,
  teamHasSameName,
  type CanvasNode,
  type Media,
} from '../services/canvasService'
import { AssetRuleError, deposit, contributeToPlaza } from '../services/assetService'
import type { Asset, User } from '../data/types'

/* ── 造一个画布节点的小工具 ── */
function node(over: Partial<CanvasNode> = {}): CanvasNode {
  return { id: 'n', media: 'image', status: 'done', x: 0, y: 0, name: '节点', cover: '/x.png', ...over }
}

/* ═══ 第一部分：纯函数规则（不碰 store）═══ */

describe('入口一 · 出现条件（canUploadToProject）', () => {
  it('① 空壳/生成中节点无上传入口，成品有', () => {
    expect(canUploadToProject(node({ status: 'empty' }))).toBe(false)
    expect(canUploadToProject(node({ status: 'generating' }))).toBe(false)
    expect(canUploadToProject(node({ status: 'done' }))).toBe(true)
  })

  it('② 四种媒介都可上传（文本/视频进「其他」类目）', () => {
    // 「其他」类目上线后，成品的文本/视频节点也能右键保存（只能落「其他」）。
    const cases: [Media, boolean][] = [
      ['text', true],
      ['video', true],
      ['image', true],
      ['audio', true],
    ]
    for (const [media, expected] of cases) {
      expect(canUploadToProject(node({ media }))).toBe(expected)
    }
    // 类目映射：图片可落四视觉类目 + 其他；视频/文本只能落其他；音频只落音频。
    expect(categoriesForMedia('image')).toEqual(['character', 'costume', 'scene', 'prop', 'other'])
    expect(categoriesForMedia('video')).toEqual(['other'])
    expect(categoriesForMedia('text')).toEqual(['other'])
    expect(categoriesForMedia('audio')).toEqual(['audio'])
  })

  it('⑤ 从本项目库拖上来的节点无上传入口（已经是项目资产）', () => {
    const fromProject = node({ source: { scope: 'project', assetId: 'a_ajie' } })
    expect(canUploadToProject(fromProject)).toBe(false)
    // 团队库/广场来源仍可上传
    expect(canUploadToProject(node({ source: { scope: 'team', assetId: 'a_suwan' } }))).toBe(true)
    expect(canUploadToProject(node({ source: { scope: 'plaza', assetId: 'a_cyber_police' } }))).toBe(true)
  })
})

describe('入口一 · 产出意图（saveCanvasNodeToProject 纯函数）', () => {
  it('③ 图片选类目（如场景）→ 产出 scope=project、status=done 的资产', () => {
    const out = saveCanvasNodeToProject(node(), 'proj_neon', { category: 'scene', mode: 'new', name: '新场景' })
    expect(out.kind).toBe('add')
    if (out.kind !== 'add') throw new Error('unreachable')
    expect(out.asset.scope).toBe('project')
    expect(out.asset.scopeId).toBe('proj_neon')
    expect(out.asset.status).toBe('done')
    expect(out.asset.category).toBe('scene')
  })

  it('④ 图片新建角色带 baseModel；关联已有→挂到已有资产 looks', () => {
    const asBase = saveCanvasNodeToProject(node({ cover: '/mei.png' }), 'proj_neon', {
      category: 'character',
      mode: 'new',
      name: '小美',
    })
    expect(asBase.kind).toBe('add')
    if (asBase.kind !== 'add') throw new Error('unreachable')
    expect(asBase.asset.category).toBe('character')
    expect(asBase.asset.baseModel).toBe('/mei.png') // 素模带上了

    const linked = saveCanvasNodeToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'link',
      targetId: 'a_ajie',
      name: '阿杰·新造型',
    })
    expect(linked.kind).toBe('link')
    if (linked.kind !== 'link') throw new Error('unreachable')
    expect(linked.parentId).toBe('a_ajie')
  })

  it('⑤ 从团队库拖来上传→副本带 masterId；新生成→原创无 masterId', () => {
    const fromTeam = saveCanvasNodeToProject(
      node({ source: { scope: 'team', assetId: 'a_suwan' } }),
      'proj_neon',
      { category: 'scene', mode: 'new', name: '拿来的场景' },
    )
    if (fromTeam.kind !== 'add') throw new Error('unreachable')
    expect(fromTeam.asset.masterId).toBe('a_suwan') // 记血缘

    const original = saveCanvasNodeToProject(node(), 'proj_neon', { category: 'scene', mode: 'new', name: '原创场景' })
    if (original.kind !== 'add') throw new Error('unreachable')
    expect(original.asset.masterId).toBeUndefined() // 原创无血缘
  })

  it('文本/视频落非「其他」类目仍被规则挡下（媒介↔类目不相容）', () => {
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'text' }), 'proj_neon', { category: 'scene', mode: 'new', name: 'x' }),
    ).toThrow(AssetRuleError)
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'video' }), 'proj_neon', { category: 'character', mode: 'new', name: 'x' }),
    ).toThrow(AssetRuleError)
  })

  it('「其他」：文本落「其他」→ fields 带 media/text；视频 → media/videoUrl；且不支持关联已有', () => {
    const text = saveCanvasNodeToProject(
      node({ media: 'text', content: '第一幕台词…', cover: undefined }),
      'proj_neon',
      { category: 'other', mode: 'new', name: '台词', extraFields: { media: 'text', text: '第一幕台词…' } },
    )
    if (text.kind !== 'add') throw new Error('unreachable')
    expect(text.asset.category).toBe('other')
    expect(text.asset.fields.media).toBe('text')
    expect(text.asset.fields.text).toBe('第一幕台词…')

    const video = saveCanvasNodeToProject(
      node({ media: 'video', cover: '/poster.png' }),
      'proj_neon',
      { category: 'other', mode: 'new', name: '片段', extraFields: { media: 'video', videoUrl: '' } },
    )
    if (video.kind !== 'add') throw new Error('unreachable')
    expect(video.asset.fields.media).toBe('video')
    expect(video.asset.cover).toBe('/poster.png')

    // 「其他」不支持关联已有（没有子资产概念）。
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'image' }), 'proj_neon', {
        category: 'other', mode: 'link', targetId: 'whatever', name: 'x',
      }),
    ).toThrow(AssetRuleError)
  })

  it('音频（R4）：走「关联已有」被 service 层拒绝（语义废弃）', () => {
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'audio' }), 'proj_neon', {
        category: 'audio', mode: 'link', targetId: 'whatever', name: 'x',
      }),
    ).toThrow(AssetRuleError)
  })

  it('音频（R4 ①）：新建音频素材 → 落 audio 资产、节点音源写进 fields.audioUrl（库里可试听）', () => {
    const out = saveCanvasNodeToProject(node({ media: 'audio', content: '/a.mp3' }), 'proj_neon', {
      category: 'audio', mode: 'new', name: '主角独白',
    })
    if (out.kind !== 'add') throw new Error('unreachable')
    expect(out.asset.category).toBe('audio')
    expect(out.asset.fields.audioUrl).toBe('/a.mp3')
  })

  it('teamHasSameName：团队库同名检测', () => {
    const assets = [
      { id: 'a', scope: 'team', scopeId: 'team_a', name: '苏晚' },
      { id: 'b', scope: 'project', scopeId: 'proj_neon', name: '苏晚' },
    ] as never[]
    expect(teamHasSameName(assets, 'team_a', '苏晚')).toBe(true)
    expect(teamHasSameName(assets, 'team_a', '别的名字')).toBe(false)
    expect(teamHasSameName(assets, 'team_b', '苏晚')).toBe(false) // 别的团队不算
  })
})

/* ═══ 「其他」类目流转守卫（服务层挡死，不只靠界面隐藏按钮 · 技术规划 §五）═══ */

describe('「其他」类目不参与向上流转（assetService 守卫）', () => {
  const owner: User = { id: 'u_owner', name: '主账号', avatar: '', role: 'owner', teamId: 'team_a' }
  const otherAsset: Asset = {
    id: 'a_other', category: 'other', name: '分镜图', scope: 'project', scopeId: 'proj_neon',
    status: 'done', cover: '/board.png', fields: { media: 'image' }, tags: [], createdAt: 0,
  }

  it('deposit（→ 团队库）对「其他」抛业务错误', () => {
    expect(() => deposit(otherAsset, 'team_a', owner)).toThrow(AssetRuleError)
    expect(() => deposit(otherAsset, 'team_a', owner)).toThrow(/团队库/)
  })

  it('contributeToPlaza（→ 素材广场）对「其他」抛业务错误', () => {
    expect(() => contributeToPlaza(otherAsset, owner)).toThrow(AssetRuleError)
    expect(() => contributeToPlaza(otherAsset, owner)).toThrow(/素材广场/)
  })
})

/* ═══ 第二部分：接 store 验"world 真的变了"═══ */

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
beforeEach(() => store.getState().resetDemo())

const projectAssets = () =>
  store.getState().world.assets.filter((a: { scope: string; scopeId?: string }) => a.scope === 'project' && a.scopeId === 'proj_neon')

describe('入口一 · store 提交（runSaveToProject）', () => {
  it('③ 上传图片进项目库 → 项目资产 +1 且为 done', () => {
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node(), 'proj_neon', { category: 'scene', mode: 'new', name: '雨巷' })
    expect(r.ok).toBe(true)
    const after = projectAssets()
    expect(after.length).toBe(before + 1)
    expect(after.at(-1).status).toBe('done')
  })

  it('④ 关联已有 → 挂到已有资产 looks，不新增顶层资产', () => {
    const ajieBefore = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_ajie')
    const looksBefore = ajieBefore.looks?.length ?? 0
    const totalBefore = store.getState().world.assets.length
    const r = store.getState().runSaveToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'link',
      targetId: 'a_ajie',
      name: '阿杰·夜行造型',
    })
    expect(r.ok).toBe(true)
    const ajieAfter = store.getState().world.assets.find((a: { id: string }) => a.id === 'a_ajie')
    expect(ajieAfter.looks.length).toBe(looksBefore + 1) // 挂上去了
    expect(store.getState().world.assets.length).toBe(totalBefore) // 顶层资产数不变（造型是子资产）
  })

  it('R4 ①：音频存为素材 → 项目库 audio +1，音源写进 fields.audioUrl', () => {
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node({ media: 'audio', content: '/a.mp3', cover: undefined }), 'proj_neon', {
      category: 'audio', mode: 'new', name: '主角独白',
    })
    expect(r.ok).toBe(true)
    const added = projectAssets().at(-1)
    expect(projectAssets().length).toBe(before + 1)
    expect(added.category).toBe('audio')
    expect(added.fields.audioUrl).toBe('/a.mp3')
  })

  it('⑥ 拖到画布本身不新增 world.assets，只有上传才 +1', () => {
    const before = store.getState().world.assets.length
    // 从团队库"拖"一个资产到画布 = 只造一个 UI 节点，store 完全没被调用。
    const dragged = node({ source: { scope: 'team', assetId: 'a_suwan' }, name: '苏晚' })
    expect(store.getState().world.assets.length).toBe(before) // 拖拽不 +1
    // 真正上传那一刻才 +1。
    store.getState().runSaveToProject(dragged, 'proj_neon', { category: 'character', mode: 'new', name: '苏晚（画布版）' })
    expect(store.getState().world.assets.length).toBe(before + 1)
  })

  it('⑦ 子账号画布上传项目库免审直接进；项目→团队沉淀才生成申请', () => {
    store.getState().setCurrentUser('u_lin') // 小林：团队A 子账号，被分配霓虹东京
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node(), 'proj_neon', { category: 'prop', mode: 'new', name: '手电筒' })
    expect(r.ok).toBe(true)
    expect(projectAssets().length).toBe(before + 1) // 直接进项目库
    expect(store.getState().applications.length).toBe(0) // 免审，没有任何申请

    // 再把这份项目资产往团队沉淀 → 这一步才生成待审批申请
    const uploaded = store.getState().world.assets.at(-1)
    const d = store.getState().runDeposit(uploaded.id)
    expect(d.ok).toBe(true)
    expect(store.getState().applications.length).toBe(1)
  })

  it('无权限项目挡下：小鹿（团队B）不能往霓虹东京上传', () => {
    store.getState().setCurrentUser('u_lu')
    const r = store.getState().runSaveToProject(node(), 'proj_neon', { category: 'scene', mode: 'new', name: 'x' })
    expect(r.ok).toBe(false)
  })

  it('去重（v5）：新建顶层资产撞项目库同名 → 被挡；关联已有（link）不受影响', () => {
    // 霓虹东京已有角色「阿杰」，再新建一个叫「阿杰」的角色 → 被挡
    const before = projectAssets().length
    const dup = store.getState().runSaveToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'new',
      name: '阿杰',
    })
    expect(dup.ok).toBe(false)
    expect(dup.message).toContain('改名')
    expect(projectAssets().length).toBe(before) // 没落库

    // 关联到已有角色，即使子资产名和别的顶层资产同名（如「霓虹舞者」）也不受去重影响
    const ok = store.getState().runSaveToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'link',
      targetId: 'a_ajie',
      name: '霓虹舞者',
    })
    expect(ok.ok).toBe(true)
  })
})

describe('入口一→沉淀 · 去重（⑧）', () => {
  it('⑧ 画布上传一份叫"苏晚"的项目资产，沉淀回团队库时因同名被挡下、提示改名', () => {
    // Sunny(团队A 主账号) 画布上传一份名为"苏晚"的项目资产（团队库里已有母版"苏晚" a_suwan）
    const up = store.getState().runSaveToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'new',
      name: '苏晚',
    })
    expect(up.ok).toBe(true)
    const uploaded = store.getState().world.assets.at(-1)
    // 沉淀回团队库 → 团队库已有同名，挡下
    const d = store.getState().runDeposit(uploaded.id)
    expect(d.ok).toBe(false)
    expect(d.message).toContain('改名')
  })

  it('改个不冲突的名字就能沉淀成功', () => {
    store.getState().runSaveToProject(node(), 'proj_neon', {
      category: 'character',
      mode: 'new',
      name: '苏晚·画布分身',
    })
    const uploaded = store.getState().world.assets.at(-1)
    const d = store.getState().runDeposit(uploaded.id)
    expect(d.ok).toBe(true)
  })
})

/* ═══ 演示动线自查（阶段 5）：把 README 里那条主线锁成回归用例 ═══ */

describe('演示动线：子账号画布上传 → 沉淀 → 主账号审批 → 团队库 +1', () => {
  const teamACount = () =>
    store.getState().world.assets.filter(
      (a: { scope: string; scopeId?: string }) => a.scope === 'team' && a.scopeId === 'team_a',
    ).length
  const teamAHas = (name: string) =>
    store.getState().world.assets.some(
      (a: { scope: string; scopeId?: string; name: string }) =>
        a.scope === 'team' && a.scopeId === 'team_a' && a.name === name,
    )

  it('全链路跑通', () => {
    const teamBefore = teamACount()

    // ① 子账号小林在画布上传一份新角色（免审直接进项目库）
    store.getState().setCurrentUser('u_lin')
    const up = store.getState().runSaveToProject(node({ cover: '/mei.png' }), 'proj_neon', {
      category: 'character',
      mode: 'new',
      name: '小美',
    })
    expect(up.ok).toBe(true)
    expect(store.getState().applications.length).toBe(0) // 上传免审
    expect(teamACount()).toBe(teamBefore) // 还没进团队库

    // ② 子账号把它沉淀 → 生成待审批申请
    const uploaded = store.getState().world.assets.at(-1)
    expect(store.getState().runDeposit(uploaded.id).ok).toBe(true)
    const appl = store.getState().applications.at(-1)
    expect(appl.status).toBe('pending')

    // ③ 切主账号 Sunny 审批通过 → 团队库 +1、申请人收到通知
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(appl.id).ok).toBe(true)
    expect(teamACount()).toBe(teamBefore + 1)
    expect(teamAHas('小美')).toBe(true)
    expect(
      store.getState().notifications.filter((n: { toUserId: string }) => n.toUserId === 'u_lin').length,
    ).toBe(1)
  })

  it('子账号带造型勾选沉淀 → 审批后团队库那份按勾选落库、素模仍在（v5 改动2）', () => {
    // 小林（子账号，分配了霓虹东京）沉淀「阿杰」，但一个造型都不勾（[]）
    store.getState().setCurrentUser('u_lin')
    expect(store.getState().runDeposit('a_ajie', []).ok).toBe(true)
    const appl = store.getState().applications.at(-1)
    expect(appl.includeLookIds).toEqual([]) // 勾选（空）记进了申请

    // 主账号审批通过 → 团队库那份：素模在、按勾选（空）不带任何造型
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(appl.id).ok).toBe(true)
    const master = store
      .getState()
      .world.assets.filter(
        (a: { scope: string; scopeId?: string; name: string }) =>
          a.scope === 'team' && a.scopeId === 'team_a' && a.name === '阿杰',
      )
      .at(-1)
    expect(master.baseModel).toBeTruthy() // 素模必带
    expect(master.looks ?? []).toHaveLength(0) // 按勾选：一个造型都没带
  })

  it('子账号带造型勾选沉淀 → 勾上的造型会一起落库', () => {
    store.getState().setCurrentUser('u_lin')
    expect(store.getState().runDeposit('a_ajie', ['a_ajie_look']).ok).toBe(true)
    const appl = store.getState().applications.at(-1)
    expect(appl.includeLookIds).toEqual(['a_ajie_look'])

    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(appl.id).ok).toBe(true)
    const master = store
      .getState()
      .world.assets.filter(
        (a: { scope: string; scopeId?: string; name: string }) =>
          a.scope === 'team' && a.scopeId === 'team_a' && a.name === '阿杰',
      )
      .at(-1)
    expect(master.baseModel).toBeTruthy()
    expect(master.looks).toHaveLength(1)
    expect(master.looks[0].id).toBe('a_ajie_look')
  })
})
