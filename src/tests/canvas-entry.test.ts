/**
 * 【测试】canvas-entry.test.ts —— 画布两入口的规则断言（技术规划 §8 阶段 4 稳定性检查）
 *
 * 覆盖 8 条：
 *  ① 空壳/生成中节点无"上传"入口、成品有
 *  ② 文本/视频节点无"上传"入口，图片/音频有
 *  ③ 图片上传选类目后进项目库为 done
 *  ④ 图片新建角色 cover 即定稿；关联已有→追加候选到已有资产候选池
 *  ⑤ 从团队库/广场拖来上传→项目副本且带 masterId；从项目库拖来→无"上传"入口
 *  ⑥ 拖到画布本身不新增 world.assets（只有上传才 +1）
 *  ⑦ 子账号画布上传项目库免审直接进，项目→团队存入才生成申请
 *  ⑧ 存入时团队库同名→提示改名（被挡下）
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  canUploadToProject,
  categoriesForMedia,
  destinationsForMedia,
  destinationsForScope,
  scopesForNode,
  saveCanvasNodeToProject,
  teamHasSameName,
  plazaHasSameNameBySubmitter,
  type CanvasNode,
  type Media,
} from '../services/canvasService'
import { AssetRuleError, deposit, contributeToPlaza } from '../services/assetService'
import type { User } from '../data/types'

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

  it('去处映射（destinationsForMedia · 统一保存弹窗）：四种媒介的返回值', () => {
    // 「存到哪里」瓷砖的唯一真相：类目 + 特殊项 'voice'。
    expect(destinationsForMedia('image')).toEqual(['character', 'prop', 'costume', 'scene', 'other'])
    expect(destinationsForMedia('audio')).toEqual(['audio', 'voice'])
    expect(destinationsForMedia('video')).toEqual(['other'])
    expect(destinationsForMedia('text')).toEqual(['other'])
  })

  it('音频的去处里不含 「其他」（音频有自己的类目，永不进「其他」）', () => {
    expect(destinationsForMedia('audio')).not.toContain('other')
    expect(destinationsForMedia('audio')).toContain('voice')
  })

  it('⑤ 从本项目库拖上来的节点：不再给"存项目库"，但仍能送团队库/广场（0810 放宽）', () => {
    const fromProject = node({ source: { scope: 'project', assetId: 'd_ajie' } })
    // 0810：条件 ⑤ 放宽——上传入口仍在（还能往上送），只是层选项里不含项目库。
    expect(scopesForNode(fromProject)).not.toContain('project')
    expect(scopesForNode(fromProject)).toContain('team')
    expect(scopesForNode(fromProject)).toContain('plaza')
    // 团队库/广场来源：三层都能存（含"另存一份项目库"）。
    expect(scopesForNode(node({ source: { scope: 'team', assetId: 'a_suwan' } }))).toEqual(['project', 'team', 'plaza'])
    // 视频 / 文本 / 音频媒介只能待在项目库（音频：0811 收口）。
    expect(scopesForNode(node({ media: 'video' }))).toEqual(['project'])
    expect(scopesForNode(node({ media: 'text' }))).toEqual(['project'])
    expect(scopesForNode(node({ media: 'audio' }))).toEqual(['project'])
  })
})

describe('入口一 · 产出意图（saveCanvasNodeToProject 纯函数）', () => {
  it('③ 图片选类目（如场景）→ 产出 scope=project、status=done 的资产', () => {
    const out = saveCanvasNodeToProject(node(), 'proj_daily', { category: 'scene', mode: 'new', name: '新场景' })
    expect(out.kind).toBe('add')
    if (out.kind !== 'add') throw new Error('unreachable')
    expect(out.asset.scope).toBe('project')
    expect(out.asset.scopeId).toBe('proj_daily')
    expect(out.asset.status).toBe('done')
    expect(out.asset.category).toBe('scene')
  })

  it('④ 图片新建角色：cover 即定稿；关联已有→追加候选到已有资产候选池', () => {
    const asNew = saveCanvasNodeToProject(node({ cover: '/mei.png' }), 'proj_daily', {
      category: 'character',
      mode: 'new',
      name: '小美',
    })
    expect(asNew.kind).toBe('add')
    if (asNew.kind !== 'add') throw new Error('unreachable')
    expect(asNew.asset.category).toBe('character')
    expect(asNew.asset.cover).toBe('/mei.png') // 定稿 = 这张图

    const linked = saveCanvasNodeToProject(node({ cover: '/new.png' }), 'proj_daily', {
      category: 'character',
      mode: 'link',
      targetId: 'd_ajie',
      name: '阿杰·新候选',
    })
    expect(linked.kind).toBe('link')
    if (linked.kind !== 'link') throw new Error('unreachable')
    expect(linked.parentId).toBe('d_ajie')
    expect(linked.candidate.url).toBe('/new.png') // 追加为候选图
  })

  it('⑤ 从团队库拖来上传→副本带 masterId；新生成→原创无 masterId', () => {
    const fromTeam = saveCanvasNodeToProject(
      node({ source: { scope: 'team', assetId: 'a_suwan' } }),
      'proj_daily',
      { category: 'scene', mode: 'new', name: '拿来的场景' },
    )
    if (fromTeam.kind !== 'add') throw new Error('unreachable')
    expect(fromTeam.asset.masterId).toBe('a_suwan') // 记血缘

    const original = saveCanvasNodeToProject(node(), 'proj_daily', { category: 'scene', mode: 'new', name: '原创场景' })
    if (original.kind !== 'add') throw new Error('unreachable')
    expect(original.asset.masterId).toBeUndefined() // 原创无血缘
  })

  it('文本/视频落非「其他」类目仍被规则挡下（媒介↔类目不相容）', () => {
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'text' }), 'proj_daily', { category: 'scene', mode: 'new', name: 'x' }),
    ).toThrow(AssetRuleError)
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'video' }), 'proj_daily', { category: 'character', mode: 'new', name: 'x' }),
    ).toThrow(AssetRuleError)
  })

  it('「其他」：文本落「其他」→ fields 带 media/text；视频 → media/videoUrl；且不支持关联已有', () => {
    const text = saveCanvasNodeToProject(
      node({ media: 'text', content: '第一幕台词…', cover: undefined }),
      'proj_daily',
      { category: 'other', mode: 'new', name: '台词', extraFields: { media: 'text', text: '第一幕台词…' } },
    )
    if (text.kind !== 'add') throw new Error('unreachable')
    expect(text.asset.category).toBe('other')
    expect(text.asset.fields.media).toBe('text')
    expect(text.asset.fields.text).toBe('第一幕台词…')

    const video = saveCanvasNodeToProject(
      node({ media: 'video', cover: '/poster.png' }),
      'proj_daily',
      { category: 'other', mode: 'new', name: '片段', extraFields: { media: 'video', videoUrl: '' } },
    )
    if (video.kind !== 'add') throw new Error('unreachable')
    expect(video.asset.fields.media).toBe('video')
    expect(video.asset.cover).toBe('/poster.png')

    // 「其他」不支持关联已有（没有子资产概念）。
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'image' }), 'proj_daily', {
        category: 'other', mode: 'link', targetId: 'whatever', name: 'x',
      }),
    ).toThrow(AssetRuleError)
  })

  it('音频（R4）：走「关联已有」被 service 层拒绝（语义废弃）', () => {
    expect(() =>
      saveCanvasNodeToProject(node({ media: 'audio' }), 'proj_daily', {
        category: 'audio', mode: 'link', targetId: 'whatever', name: 'x',
      }),
    ).toThrow(AssetRuleError)
  })

  it('音频（R4 ①）：新建音频素材 → 落 audio 资产、节点音源写进 fields.audioUrl（库里可试听）', () => {
    const out = saveCanvasNodeToProject(node({ media: 'audio', content: '/a.mp3' }), 'proj_daily', {
      category: 'audio', mode: 'new', name: '主角独白',
    })
    if (out.kind !== 'add') throw new Error('unreachable')
    expect(out.asset.category).toBe('audio')
    expect(out.asset.fields.audioUrl).toBe('/a.mp3')
  })

  it('teamHasSameName：团队库同名检测', () => {
    const assets = [
      { id: 'a', scope: 'team', scopeId: 'team_a', name: '苏晚' },
      { id: 'b', scope: 'project', scopeId: 'proj_daily', name: '苏晚' },
    ] as never[]
    expect(teamHasSameName(assets, 'team_a', '苏晚')).toBe(true)
    expect(teamHasSameName(assets, 'team_a', '别的名字')).toBe(false)
    expect(teamHasSameName(assets, 'team_b', '苏晚')).toBe(false) // 别的团队不算
  })

  it('destinationsForScope（0810）：团队库 / 广场没有「其他」、没有「角色音色」', () => {
    // 项目层沿用 destinationsForMedia 的全集。
    expect(destinationsForScope('image', 'project')).toEqual(['character', 'prop', 'costume', 'scene', 'other'])
    // 团队库：滤掉 other / voice。
    expect(destinationsForScope('image', 'team')).toEqual(['character', 'prop', 'costume', 'scene'])
    expect(destinationsForScope('audio', 'team')).toEqual(['audio'])
    expect(destinationsForScope('image', 'plaza')).toEqual(['character', 'prop', 'costume', 'scene'])
  })

  it('plazaHasSameNameBySubmitter（0810）：按投稿人维度查重', () => {
    const assets = [
      { id: 'p1', scope: 'plaza', contributedBy: 'u_a', name: '西装' },
      { id: 'p2', scope: 'plaza', name: '官方西装' }, // 官方素材无 contributedBy
    ] as never[]
    expect(plazaHasSameNameBySubmitter(assets, 'u_a', '西装')).toBe(true) // 同人同名
    expect(plazaHasSameNameBySubmitter(assets, 'u_a', '风衣')).toBe(false) // 同人异名
    expect(plazaHasSameNameBySubmitter(assets, 'u_b', '西装')).toBe(false) // 异人同名 → 放行
    expect(plazaHasSameNameBySubmitter(assets, 'u_a', '官方西装')).toBe(false) // 官方素材不参与
  })
})

/* ═══ 「其他」类目流转守卫（服务层挡死，不只靠界面隐藏按钮 · 技术规划 §五）═══ */

describe('「其他」类目不参与向上流转（assertPayload 守卫）', () => {
  const owner: User = { id: 'u_owner', name: '主账号', avatar: '', role: 'owner', teamId: 'team_a' }
  const otherPayload = { url: '/board.png', name: '分镜图', category: 'other' as const }

  it('deposit（→ 团队库）对「其他」抛业务错误', () => {
    expect(() => deposit(otherPayload, 'team_a', owner)).toThrow(AssetRuleError)
    expect(() => deposit(otherPayload, 'team_a', owner)).toThrow(/团队库/)
  })

  it('contributeToPlaza（→ 素材广场）对「其他」抛业务错误', () => {
    expect(() => contributeToPlaza(otherPayload, owner)).toThrow(AssetRuleError)
    expect(() => contributeToPlaza(otherPayload, owner)).toThrow(/素材广场/)
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
// 0805：都市日常那批资产（d_ajie 等）改由演示脚手架灌入；重置后跑一遍演示动作补回，
// 让沿用旧演员表（关联 d_ajie 等）的入口一用例照常跑。
// 0810：演示生成后基础素材直接落成品（有图必自动定稿），无需再补定稿。
beforeEach(() => {
  store.getState().resetDemo()
  store.getState().runDemoAnalyze()
  store.getState().runDemoGenerate()
})

/** 0810：把一份项目资产按单张图存入团队库（替代已删除的 runDeposit）。 */
function sendTeam(id: string) {
  const a = store.getState().world.assets.find((x: { id: string }) => x.id === id)
  return store.getState().runSendImage({ target: 'team', payload: { url: a.cover, name: a.name, category: a.category }, sourceAssetId: id })
}

const projectAssets = () =>
  store.getState().world.assets.filter((a: { scope: string; scopeId?: string }) => a.scope === 'project' && a.scopeId === 'proj_daily')

describe('入口一 · store 提交（runSaveToProject）', () => {
  it('③ 上传图片进项目库 → 项目资产 +1 且为 done', () => {
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node(), 'proj_daily', { category: 'scene', mode: 'new', name: '雨巷' })
    expect(r.ok).toBe(true)
    const after = projectAssets()
    expect(after.length).toBe(before + 1)
    expect(after.at(-1).status).toBe('done')
  })

  it('④ 关联已有 → 追加候选到已有资产候选池，不新增顶层资产', () => {
    const ajieBefore = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    const candsBefore = ajieBefore.candidates?.length ?? 0
    const totalBefore = store.getState().world.assets.length
    const r = store.getState().runSaveToProject(node(), 'proj_daily', {
      category: 'character',
      mode: 'link',
      targetId: 'd_ajie',
      name: '阿杰·新候选',
    })
    expect(r.ok).toBe(true)
    const ajieAfter = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    expect(ajieAfter.candidates.length).toBe(candsBefore + 1) // 追加进候选池
    expect(store.getState().world.assets.length).toBe(totalBefore) // 顶层资产数不变（候选不是资产）
  })

  it('R4 ①：音频存为素材 → 项目库 audio +1，音源写进 fields.audioUrl', () => {
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node({ media: 'audio', content: '/a.mp3', cover: undefined }), 'proj_daily', {
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
    store.getState().runSaveToProject(dragged, 'proj_daily', { category: 'character', mode: 'new', name: '苏晚（画布版）' })
    expect(store.getState().world.assets.length).toBe(before + 1)
  })

  it('⑦ 子账号画布上传项目库免审直接进；项目→团队存入才生成申请', () => {
    store.getState().setCurrentUser('u_lin') // 小林：团队A 子账号，被分配都市日常
    const before = projectAssets().length
    const r = store.getState().runSaveToProject(node(), 'proj_daily', { category: 'prop', mode: 'new', name: '手电筒' })
    expect(r.ok).toBe(true)
    expect(projectAssets().length).toBe(before + 1) // 直接进项目库
    expect(store.getState().applications.length).toBe(0) // 免审，没有任何申请

    // 再把这份项目资产往团队存入 → 这一步才生成待审批申请
    const uploaded = store.getState().world.assets.at(-1)
    const d = sendTeam(uploaded.id)
    expect(d.ok).toBe(true)
    expect(store.getState().applications.length).toBe(1)
  })

  it('无权限项目挡下：小鹿（团队B）不能往都市日常上传', () => {
    store.getState().setCurrentUser('u_lu')
    const r = store.getState().runSaveToProject(node(), 'proj_daily', { category: 'scene', mode: 'new', name: 'x' })
    expect(r.ok).toBe(false)
  })

  it('去重（v5）：新建顶层资产撞项目库同名 → 被挡；关联已有（link）不受影响', () => {
    // 都市日常已有角色「阿杰」，再新建一个叫「阿杰」的角色 → 被挡
    const before = projectAssets().length
    const dup = store.getState().runSaveToProject(node(), 'proj_daily', {
      category: 'character',
      mode: 'new',
      name: '阿杰',
    })
    expect(dup.ok).toBe(false)
    expect(dup.message).toContain('改名')
    expect(projectAssets().length).toBe(before) // 没落库

    // 关联到已有角色，即使子资产名和别的顶层资产同名（如「霓虹舞者」）也不受去重影响
    const ok = store.getState().runSaveToProject(node(), 'proj_daily', {
      category: 'character',
      mode: 'link',
      targetId: 'd_ajie',
      name: '苏可',
    })
    expect(ok.ok).toBe(true)
  })
})

describe('入口一→存入 · 去重（⑧）', () => {
  it('⑧ 画布上传一份叫"苏晚"的项目资产，存入团队库时因同名被挡下、提示改名', () => {
    // Sunny(团队A 主账号) 画布上传一份名为"苏晚"的项目资产（团队库里已有母版"苏晚" a_suwan）
    const up = store.getState().runSaveToProject(node(), 'proj_daily', {
      category: 'character',
      mode: 'new',
      name: '苏晚',
    })
    expect(up.ok).toBe(true)
    const uploaded = store.getState().world.assets.at(-1)
    // 存入团队库 → 团队库已有同名，挡下（0810 文案统一为「换个名字」）
    const d = sendTeam(uploaded.id)
    expect(d.ok).toBe(false)
    expect(d.message).toContain('换个名字')
  })

  it('改个不冲突的名字就能存入成功', () => {
    store.getState().runSaveToProject(node(), 'proj_daily', {
      category: 'character',
      mode: 'new',
      name: '苏晚·画布分身',
    })
    const uploaded = store.getState().world.assets.at(-1)
    const d = sendTeam(uploaded.id)
    expect(d.ok).toBe(true)
  })
})

/* ═══ 演示动线自查（阶段 5）：把 README 里那条主线锁成回归用例 ═══ */

describe('演示动线：子账号画布上传 → 存入 → 主账号审批 → 团队库 +1', () => {
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
    const up = store.getState().runSaveToProject(node({ cover: '/mei.png' }), 'proj_daily', {
      category: 'character',
      mode: 'new',
      name: '小美',
    })
    expect(up.ok).toBe(true)
    expect(store.getState().applications.length).toBe(0) // 上传免审
    expect(teamACount()).toBe(teamBefore) // 还没进团队库

    // ② 子账号把它存入 → 生成待审批申请
    const uploaded = store.getState().world.assets.at(-1)
    expect(sendTeam(uploaded.id).ok).toBe(true)
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

  it('子账号存入 → 审批后团队库那份是扁平的单图（0810 扁平化三件套）', () => {
    // 小林（子账号，分配了都市日常）存入「阿杰」
    store.getState().setCurrentUser('u_lin')
    const ajie = store.getState().world.assets.find((a: { id: string }) => a.id === 'd_ajie')
    expect(sendTeam('d_ajie').ok).toBe(true)
    const appl = store.getState().applications.at(-1)

    // 主账号审批通过 → 团队库那份：定稿在，图片列表 / 参考图 / 来源全无
    store.getState().setCurrentUser('u_sunny')
    expect(store.getState().approveApplication(appl.id).ok).toBe(true)
    const master = store
      .getState()
      .world.assets.filter(
        (a: { scope: string; scopeId?: string; name: string }) =>
          a.scope === 'team' && a.scopeId === 'team_a' && a.name === '阿杰',
      )
      .at(-1)
    expect(master.cover).toBe(ajie.cover) // 定稿带上
    expect(master.candidates).toBeUndefined() // 无图片列表
    expect(master.referenceImages).toBeUndefined() // 无参考图
    expect(master.referencedFrom).toBeUndefined() // 无来源
  })
})
