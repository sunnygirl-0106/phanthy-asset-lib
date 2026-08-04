/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【测试】logic-core.test.ts —— 用断言证明产品规则真的成立
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 跑 `npm test`：全绿代表逻辑内核站得住。
 * 每个 it("……") 里的中文，就是它验证的那条产品规则。
 * 以后每改一条规则，先来这里改/加一条断言，再改实现——测试就是你的安全网。
 *
 * 【v4 改动】跟随/断链、门 B 已从产品逻辑里砍掉，本文件对应的用例也删了：
 *   - 原「八、跟随·断链规则」「九、母版消失·降级」整段删除；
 *   - 原「门 B 一键放开」用例删除；
 *   - 收藏/复用/直接复用/存入不再断言 following。
 * ─────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest'
import { parseHash, routeToHash } from '../hooks/useHashRoute'
import type { World, Asset } from '../data/types'
import { createSeedWorld, userById, assetById, projectById, IDS, DEMO_NEON_ASSETS } from '../data/seed'
import {
  canBrowsePlaza,
  canBrowseTeamLibrary,
  canSee,
  canDirectReuse,
  canFavorite,
  canReuseFromTeam,
  depositMode,
  canManagePlaza,
  canContributeToPlaza,
  canRegenerate,
  canViewPrompt,
  canApproveDeposit,
  getTeam,
  isListed,
  canRelistPlazaAsset,
  canEnterReviewCenter,
  canHandleDepositRequests,
} from '../services/permission'
import {
  directReuse,
  favorite,
  reuse,
  deposit,
  materializeDeposit,
  coverOf,
  removeCandidate,
  setFinal,
  AssetRuleError,
} from '../services/assetService'

let world: World
beforeEach(() => {
  world = createSeedWorld()
  // 0805：霓虹东京那批资产（a_ajie 等）从种子挪进了 DEMO_NEON_ASSETS（演示时才灌入）。
  // 这些沿用旧演员表的权限/流转用例，先把它们（深拷贝，防跨用例污染）补回 world 再断言。
  world.assets.push(...DEMO_NEON_ASSETS.map((a) => JSON.parse(JSON.stringify(a)) as Asset))
})

/* ═══════════════ 一、权限矩阵 · 广场 ═══════════════ */
describe('广场权限', () => {
  it('三种角色都能浏览广场', () => {
    for (const id of [IDS.admin, IDS.sunny, IDS.lin]) {
      expect(canBrowsePlaza(userById(world, id))).toBe(true)
    }
  })

  it('只有 admin 能治理广场（v6：投稿改为 scope-aware，见下方专测）', () => {
    expect(canManagePlaza(userById(world, IDS.admin))).toBe(true)
    expect(canManagePlaza(userById(world, IDS.sunny))).toBe(false)
  })

  it('贡献到广场按层收口（v6）：主账号团队库/项目库都行；子账号仅项目库；admin 不投', () => {
    const teamAsset = assetById(world, 'a_suwan') // 团队库
    const projAsset = assetById(world, 'a_ajie') // 项目库
    const plazaAsset = assetById(world, 'a_cyber_police') // 广场
    const sunny = userById(world, IDS.sunny)
    const lin = userById(world, IDS.lin)
    const admin = userById(world, IDS.admin)
    // 主账号：团队库、项目库都能发起
    expect(canContributeToPlaza(sunny, teamAsset)).toBe(true)
    expect(canContributeToPlaza(sunny, projAsset)).toBe(true)
    // 子账号：只能在项目库发起；团队库对子账号封闭
    expect(canContributeToPlaza(lin, teamAsset)).toBe(false)
    expect(canContributeToPlaza(lin, projAsset)).toBe(true)
    // admin：只审不投（对任何层都 false）
    expect(canContributeToPlaza(admin, teamAsset)).toBe(false)
    expect(canContributeToPlaza(admin, plazaAsset)).toBe(false)
  })

  it('收藏（广场→团队库）只有主账号能做', () => {
    expect(canFavorite(userById(world, IDS.sunny))).toBe(true)
    expect(canFavorite(userById(world, IDS.lin))).toBe(false)
    expect(canFavorite(userById(world, IDS.admin))).toBe(false)
  })
})

/* ═══════════════ 二、团队库 · 门 A ═══════════════ */
describe('团队库门A（子账号默认可浏览，主账号可单独关）', () => {
  it('子账号默认能看本团队的团队库', () => {
    const teamA = getTeam(world, IDS.teamA)!
    expect(canBrowseTeamLibrary(userById(world, IDS.lin), teamA)).toBe(true)
  })

  it('主账号把某子账号的门A关掉后，该子账号看不到、其他子账号仍能看', () => {
    const teamA = getTeam(world, IDS.teamA)!
    teamA.teamLibraryHiddenSubs = [IDS.lin]
    expect(canBrowseTeamLibrary(userById(world, IDS.lin), teamA)).toBe(false)
    expect(canBrowseTeamLibrary(userById(world, IDS.may), teamA)).toBe(true)
  })

  it('主账号看不到别的团队的团队库', () => {
    const teamB = getTeam(world, IDS.teamB)!
    expect(canBrowseTeamLibrary(userById(world, IDS.sunny), teamB)).toBe(false)
  })
})

/* ═══════════════ 三、项目隔离（v4：门 B 已砍，子账号只看被分配项目）═══════════════ */
describe('项目隔离（别人项目一律不可见，没有"看全部项目"的口子）', () => {
  it('主账号能看本团队所有项目资产，但看不到别团队的', () => {
    const sunny = userById(world, IDS.sunny)
    expect(canSee(world, sunny, assetById(world, 'a_ajie'))).toBe(true) // 霓虹东京·本团队
    expect(canSee(world, sunny, assetById(world, 'a_shangui'))).toBe(true) // 山海志·本团队
    expect(canSee(world, sunny, assetById(world, 'a_captain'))).toBe(false) // 星际公约·团队B
  })

  it('子账号只看到被分配的项目资产，没分配的一律看不到', () => {
    const lin = userById(world, IDS.lin) // 分配到霓虹东京
    const may = userById(world, IDS.may) // 分配到都市迷案
    expect(canSee(world, lin, assetById(world, 'a_ajie'))).toBe(true) // 分配了 → 看得到
    expect(canSee(world, lin, assetById(world, 'a_linjingguan'))).toBe(false) // 没分配都市迷案 → 看不到
    expect(canSee(world, may, assetById(world, 'a_linjingguan'))).toBe(true) // 分配了都市迷案
    expect(canSee(world, may, assetById(world, 'a_ajie'))).toBe(false) // 没分配霓虹东京
  })

  it('admin 能看到所有项目的资产（治理视角）', () => {
    const admin = userById(world, IDS.admin)
    expect(canSee(world, admin, assetById(world, 'a_captain'))).toBe(true)
    expect(canSee(world, admin, assetById(world, 'a_ajie'))).toBe(true)
  })
})

/* ═══════════════ 四、流转 · 直接复用 ═══════════════ */
describe('直接复用（广场→项目·产生独立副本）', () => {
  it('产生独立副本：新 id、进目标项目、记录血缘', () => {
    const src = assetById(world, 'a_cyber_police')
    const copy = directReuse(src, IDS.projNeon)
    expect(copy.id).not.toBe(src.id)
    expect(copy.scope).toBe('project')
    expect(copy.scopeId).toBe(IDS.projNeon)
    expect(copy.masterId).toBe(src.id)
  })

  it('改副本名字不影响母版（名字是本地的）', () => {
    const src = assetById(world, 'a_cyber_police')
    const copy = directReuse(src, IDS.projNeon)
    copy.name = '林警官'
    expect(src.name).toBe('赛博女警')
  })

  it('音色默认带入，也可以在直接复用时取消', () => {
    const src = assetById(world, 'a_cyber_police')
    expect(directReuse(src, IDS.projNeon).voice).toBeTruthy()
    expect(directReuse(src, IDS.projNeon, false).voice).toBeUndefined()
  })

  it('副本只带定稿图，候选池不跟着走（0803 流转口径）', () => {
    // 候选池只属于项目层（0804 · 规则 14）。0805 起种子里项目库候选池恒 1，
    // 这里手造一份多候选的项目库源，验证副本不带候选。
    const base = assetById(world, 'a_ajie')
    const src = {
      ...base,
      cover: `${base.cover.split('?')[0]}?g=1`,
      candidates: [
        { id: 'c1', url: `${base.cover.split('?')[0]}?g=1`, createdAt: 0 },
        { id: 'c2', url: `${base.cover.split('?')[0]}?g=2`, createdAt: 0 },
      ],
    }
    expect(src.candidates.length).toBeGreaterThan(1)
    const copy = directReuse(src, IDS.projNeon)
    expect(copy.cover).toBe(src.cover) // 定稿带上
    expect(copy.candidates).toBeUndefined() // 候选池不带
  })

  it('权限：主账号可在本团队项目直接复用；子账号仅限被分配的项目', () => {
    const neon = projectById(world, IDS.projNeon)
    const urban = projectById(world, IDS.projUrban)
    expect(canDirectReuse(userById(world, IDS.sunny), neon)).toBe(true)
    expect(canDirectReuse(userById(world, IDS.lin), neon)).toBe(true) // 小林分配了霓虹东京
    expect(canDirectReuse(userById(world, IDS.lin), urban)).toBe(false) // 但没分配都市迷案
    expect(canDirectReuse(userById(world, IDS.admin), neon)).toBe(false)
  })
})

/* ═══════════════ 五、流转 · 收藏 / 复用（都产生独立副本）═══════════════ */
describe('收藏与复用（拉一份就是独立副本，不再有跟随选项）', () => {
  it('收藏（广场→团队库）产生独立副本：进团队库、记血缘', () => {
    const src = assetById(world, 'a_cyber_police')
    const copy = favorite(src, IDS.teamA)
    expect(copy.scope).toBe('team')
    expect(copy.scopeId).toBe(IDS.teamA)
    expect(copy.masterId).toBe(src.id)
  })

  it('从团队库复用进项目：独立副本，只带定稿图、候选池不带', () => {
    const suwan = assetById(world, 'a_suwan')
    const copy = reuse(suwan, IDS.projNeon)
    expect(copy.scope).toBe('project')
    expect(copy.scopeId).toBe(IDS.projNeon)
    expect(copy.masterId).toBe(suwan.id)
    expect(copy.cover).toBe(suwan.cover) // 定稿 = 原素模图
    expect(copy.candidates).toBeUndefined() // 候选池不跟着走
  })

  it('权限：复用（团队库→项目）主账号本团队任意项目，子账号仅被分配项目', () => {
    const neon = projectById(world, IDS.projNeon)
    expect(canReuseFromTeam(userById(world, IDS.sunny), neon)).toBe(true)
    expect(canReuseFromTeam(userById(world, IDS.may), neon)).toBe(false) // 阿May 没分配霓虹东京
  })
})

/* ═══════════════ 六、流转 · 存入 ═══════════════ */
describe('存入（项目→团队库）', () => {
  it('主账号直接存入为团队母版（新母版：无 masterId）', () => {
    const src = assetById(world, 'a_ajie')
    const res = deposit(src, IDS.teamA, userById(world, IDS.sunny))
    expect(res.kind).toBe('asset')
    if (res.kind === 'asset') {
      expect(res.asset.scope).toBe('team')
      expect(res.asset.scopeId).toBe(IDS.teamA)
      expect(res.asset.masterId).toBeUndefined()
    }
  })

  it('子账号存入只生成"待审批申请"，不直接写团队库', () => {
    const src = assetById(world, 'a_ajie')
    const res = deposit(src, IDS.teamA, userById(world, IDS.lin))
    expect(res.kind).toBe('application')
    if (res.kind === 'application') {
      expect(res.status).toBe('pending')
      expect(res.applicantId).toBe(IDS.lin)
    }
  })

  it('admin 不参与存入，会被拦下', () => {
    const src = assetById(world, 'a_ajie')
    expect(() => deposit(src, IDS.teamA, userById(world, IDS.admin))).toThrow(AssetRuleError)
  })

  it('主账号存入为团队母版：只带定稿图、候选池不带（0803）', () => {
    const suwan = assetById(world, 'a_suwan')
    const res = deposit(suwan, IDS.teamA, userById(world, IDS.sunny))
    expect(res.kind).toBe('asset')
    if (res.kind === 'asset') {
      expect(res.asset.cover).toBe(suwan.cover)
      expect(res.asset.candidates).toBeUndefined()
    }
  })

  it('depositMode 反映三种角色的存入方式', () => {
    expect(depositMode(userById(world, IDS.sunny))).toBe('direct')
    expect(depositMode(userById(world, IDS.lin))).toBe('apply')
    expect(depositMode(userById(world, IDS.admin))).toBe('none')
  })

  it('只有该子账号的主账号能批他的资产存入申请', () => {
    const lin = userById(world, IDS.lin)
    expect(canApproveDeposit(userById(world, IDS.sunny), lin)).toBe(true)
    expect(canApproveDeposit(userById(world, IDS.ze), lin)).toBe(false) // 别团队主账号无权
  })
})

/* ═══════════════ 七、红线 · 只有成品能流转 ═══════════════ */
describe('红线：非成品不能被复用/存入/贡献', () => {
  // 临时造一份"生成中"的资产（不进种子数据，避免污染界面）
  function makeGenerating(world: World): Asset {
    return { ...assetById(world, 'a_cyber_police'), id: 'tmp_wip', status: 'generating' }
  }

  it('对"生成中"的资产做直接复用会抛错', () => {
    expect(() => directReuse(makeGenerating(world), IDS.projNeon)).toThrow(AssetRuleError)
  })

  it('对"生成中"的资产做收藏也会抛错', () => {
    expect(() => favorite(makeGenerating(world), IDS.teamA)).toThrow(AssetRuleError)
  })
})

/* ═══════════════ 七·五、重新生成 / 提示词可见性权限（v6）═══════════════ */
describe('canRegenerate（重新生成 / 新增造型权限 · 0803：只有项目库能生成）', () => {
  it('主账号：只有项目库能生成，团队库不能', () => {
    const sunny = userById(world, IDS.sunny)
    expect(canRegenerate(sunny, assetById(world, 'a_ajie'))).toBe(true) // 项目库
    expect(canRegenerate(sunny, assetById(world, 'a_suwan'))).toBe(false) // 团队库（改动五：生产只在项目里）
  })
  it('子账号：项目库能、团队库不能', () => {
    const lin = userById(world, IDS.lin)
    expect(canRegenerate(lin, assetById(world, 'a_ajie'))).toBe(true) // 项目库
    expect(canRegenerate(lin, assetById(world, 'a_suwan'))).toBe(false) // 团队库
  })
  it('广场恒 false；admin 恒 false', () => {
    const plaza = assetById(world, 'a_cyber_police')
    expect(canRegenerate(userById(world, IDS.sunny), plaza)).toBe(false) // 广场对谁都不行
    expect(canRegenerate(userById(world, IDS.admin), assetById(world, 'a_ajie'))).toBe(false) // admin 恒不行
    expect(canRegenerate(userById(world, IDS.admin), plaza)).toBe(false)
  })
})

describe('canViewPrompt（提示词可见性）', () => {
  it('项目库/团队库可看；广场本期不给看', () => {
    expect(canViewPrompt(assetById(world, 'a_ajie'))).toBe(true) // 项目库
    expect(canViewPrompt(assetById(world, 'a_suwan'))).toBe(true) // 团队库
    expect(canViewPrompt(assetById(world, 'a_cyber_police'))).toBe(false) // 广场
  })
})

/* ═══════════════ 七·六、提示词随流转带上（v6 改动二）═══════════════ */
describe('提示词随副本走（cloneForCopy 带上 prompt）', () => {
  it('直接复用 / 复用 / 收藏 / 存入团队库：副本 prompt 与源一致', () => {
    const cyber = assetById(world, 'a_cyber_police') // 广场角色，带 prompt
    expect(cyber.prompt).toBeTruthy() // 种子已按类目补上提示词

    expect(directReuse(cyber, IDS.projNeon).prompt).toBe(cyber.prompt)

    const suwan = assetById(world, 'a_suwan')
    expect(reuse(suwan, IDS.projNeon).prompt).toBe(suwan.prompt)
    expect(favorite(cyber, IDS.teamA).prompt).toBe(cyber.prompt)

    const ajie = assetById(world, 'a_ajie')
    expect(materializeDeposit(ajie, IDS.teamA).prompt).toBe(ajie.prompt)
  })
})

/* ═══════════════ 九、种子不变式（0803 修订：空壳归位 + 团队库无候选池）═══════════════ */
describe('种子不变式', () => {
  it('createSeedWorld 里霓虹东京 character/costume/scene/prop 四类资产数为 0（0805 · 初始态清零）', () => {
    // 注意：这条验的是"原始种子"（不含 beforeEach 补进来的 DEMO），所以直接 createSeedWorld()。
    const w = createSeedWorld()
    const core = w.assets.filter(
      (a) => a.scope === 'project' && a.scopeId === IDS.projNeon &&
        ['character', 'costume', 'scene', 'prop'].includes(a.category),
    )
    expect(core.length).toBe(0)
    // 音频 /「其他」不清零：霓虹东京仍有音频与留存物。
    expect(w.assets.some((a) => a.scopeId === IDS.projNeon && a.category === 'audio')).toBe(true)
    expect(w.assets.some((a) => a.scopeId === IDS.projNeon && a.category === 'other')).toBe(true)
  })

  it('团队库永不出现空壳（空壳只在项目里）', () => {
    expect(world.assets.filter((a) => a.scope === 'team' && a.status === 'empty').length).toBe(0)
  })

  it('凡带候选池的资产，定稿图都在池中（★ 打得准）', () => {
    for (const a of world.assets) {
      if (a.candidates?.length) {
        expect(a.candidates.some((c) => c.url === a.cover)).toBe(true)
      }
    }
  })

  it('所有项目库成品资产候选池恒 1，且 candidates[0].url === cover（0805 · 只展示定稿）', () => {
    // 只针对四类"生成资产"（角色/服装/场景/道具）；音频与「其他」留存物没有候选池、不在此列。
    const gen = ['character', 'costume', 'scene', 'prop']
    const dones = world.assets.filter((a) => a.scope === 'project' && a.status === 'done' && gen.includes(a.category))
    expect(dones.length).toBeGreaterThan(0)
    for (const a of dones) {
      expect(a.candidates?.length).toBe(1)
      expect(a.candidates![0].url).toBe(a.cover)
    }
  })

  it('所有带 referenceLabels 的资产，referenceLabels 与 referenceImages 等长', () => {
    for (const a of world.assets) {
      if (a.referenceLabels) {
        expect(a.referenceLabels.length).toBe(a.referenceImages?.length)
      }
    }
  })

  it('项目库空壳都有参考图与来源资产（含 DEMO 补入的三份造型）', () => {
    const shells = world.assets.filter((a) => a.scope === 'project' && a.status === 'empty')
    expect(shells.length).toBeGreaterThanOrEqual(4) // 霓虹东京 3 份造型 + 山海志 1 份
    for (const s of shells) {
      expect(s.referenceImages?.length).toBeGreaterThan(0)
      expect(s.referencedFrom).toBeTruthy()
    }
  })

  it('候选池只属于项目层（规则 14）：团队库 / 广场任何资产都没有候选池', () => {
    const nonProject = world.assets.filter((a) => a.scope !== 'project')
    expect(nonProject.length).toBeGreaterThan(0)
    expect(nonProject.every((a) => !a.candidates?.length)).toBe(true)
  })

  it('项目库造型资产（有 referencedFrom）参考图 ≥ 1，且 referenceLabels 与之等长（规则 16）', () => {
    const looks = world.assets.filter((a) => a.scope === 'project' && a.referencedFrom)
    expect(looks.length).toBeGreaterThan(0)
    for (const a of looks) {
      expect(a.referenceImages?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(a.referenceLabels?.length).toBe(a.referenceImages?.length)
    }
  })
})

/* ═══════════════ 八、展示封面（coverOf，0803：直接返回定稿）═══════════════ */
describe('coverOf：返回定稿图', () => {
  it('有 cover → 用 cover', () => {
    expect(coverOf({ cover: '/a.png' })).toBe('/a.png')
  })
  it('cover 空（空壳）→ 返回空串', () => {
    expect(coverOf({ cover: '' })).toBe('')
  })
})

/* ═══════════════ 八·五、候选池：removeCandidate / setFinal（0803）═══════════════ */
describe('removeCandidate / setFinal：候选池增删与设定稿', () => {
  // 0805：种子里项目库候选池恒 1（只展示定稿）。这几条验的是"多候选时的增删"纯函数逻辑，
  // 手造一份多候选的项目库源（定稿=第一张）。
  const multiCand = (): Asset => ({
    ...assetById(world, 'a_ajie'),
    cover: '/x.png?g=1',
    candidates: [
      { id: 'c1', url: '/x.png?g=1', createdAt: 0 },
      { id: 'c2', url: '/x.png?g=2', createdAt: 0 },
      { id: 'c3', url: '/x.png?g=3', createdAt: 0 },
    ],
  })

  it('删非定稿候选：直接移除、定稿不变', () => {
    const source = multiCand() // 定稿=第一张，候选池 3 张
    const nonFinal = source.candidates!.find((c) => c.url !== source.cover)!
    const next = removeCandidate(source, nonFinal.id)
    expect(next).not.toBe(source) // 不可变
    expect(next.candidates!.some((c) => c.id === nonFinal.id)).toBe(false)
    expect(next.cover).toBe(source.cover) // 定稿没动
    expect(source.candidates!.some((c) => c.id === nonFinal.id)).toBe(true) // 源不变
  })

  it('删定稿候选且池中还有别的：从剩余里顶一张上来当新定稿', () => {
    const source = multiCand()
    const finalCand = source.candidates!.find((c) => c.url === source.cover)!
    const next = removeCandidate(source, finalCand.id)
    expect(next.candidates!.some((c) => c.id === finalCand.id)).toBe(false)
    expect(next.cover).not.toBe(source.cover) // 定稿被顶替
    expect(next.cover).toBe(next.candidates![0].url)
  })

  it('删不存在的候选 → 抛业务错误', () => {
    const source = multiCand()
    expect(() => removeCandidate(source, 'nope')).toThrow(AssetRuleError)
  })

  it('setFinal：把某张候选设为定稿（改 cover，并跃迁到成品）', () => {
    const source = multiCand()
    const target = source.candidates!.find((c) => c.url !== source.cover)!
    const next = setFinal(source, target.id)
    expect(next.cover).toBe(target.url)
    expect(next.status).toBe('done') // 0807：设定稿即成品
    expect(next.candidates).toBe(source.candidates) // 候选池没动
  })
})

/* ═══════════════ 九、审核中心 · 上架状态与进入权限（审核中心改造）═══════════════ */
describe('isListed / canRelistPlazaAsset / canEnterReviewCenter', () => {
  const admin = () => userById(world, IDS.admin)
  const owner = () => userById(world, IDS.sunny)
  const sub = () => userById(world, IDS.lin)
  const plazaAsset = () => assetById(world, 'a_cyber_police')

  it('isListed：缺省（老数据 / 官方素材无字段）算在架；delisted 才算下架', () => {
    expect(isListed(plazaAsset())).toBe(true) // 种子官方素材没有 shelfStatus → 在架
    expect(isListed({ ...plazaAsset(), shelfStatus: 'delisted' })).toBe(false)
    expect(isListed({ ...plazaAsset(), shelfStatus: 'listed' })).toBe(true)
  })

  it('canRelistPlazaAsset：只有 admin 能把已下架的素材重新上架', () => {
    const delisted = { ...plazaAsset(), shelfStatus: 'delisted' as const }
    expect(canRelistPlazaAsset(admin(), delisted)).toBe(true)
    expect(canRelistPlazaAsset(owner(), delisted)).toBe(false) // 主账号不行
    expect(canRelistPlazaAsset(admin(), plazaAsset())).toBe(false) // 在架的谈不上重新上架
  })

  it('canEnterReviewCenter（v2 收敛）：只有 admin 能进；主账号 / 子账号都进不来', () => {
    expect(canEnterReviewCenter(admin())).toBe(true)
    expect(canEnterReviewCenter(owner())).toBe(false) // v2：主账号改走团队库抽屉
    expect(canEnterReviewCenter(sub())).toBe(false)
  })

  it('canHandleDepositRequests：只有主账号有"处理存入申请"这项职责', () => {
    expect(canHandleDepositRequests(owner())).toBe(true)
    expect(canHandleDepositRequests(admin())).toBe(false)
    expect(canHandleDepositRequests(sub())).toBe(false)
  })
})

/* ═══════════════ 十、路由 · 团队库抽屉段（v2 · 纯函数往返）═══════════════ */
describe('parseHash / routeToHash：#/team 与 #/team/deposits 往返', () => {
  it('parseHash：#/team → drawer undefined；#/team/deposits → drawer deposits', () => {
    expect(parseHash('#/team')).toEqual({ name: 'team', drawer: undefined })
    expect(parseHash('#/team/deposits')).toEqual({ name: 'team', drawer: 'deposits' })
  })

  it('parseHash：#/team/乱写 回落成 drawer undefined（不掉回首页）', () => {
    expect(parseHash('#/team/乱写')).toEqual({ name: 'team', drawer: undefined })
  })

  it('routeToHash：team 往返一致', () => {
    expect(routeToHash({ name: 'team' })).toBe('#/team')
    expect(routeToHash({ name: 'team', drawer: 'deposits' })).toBe('#/team/deposits')
  })
})
