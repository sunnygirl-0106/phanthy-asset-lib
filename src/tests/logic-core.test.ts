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
 *   - 收藏/复用/直接复用/沉淀不再断言 following。
 * ─────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest'
import type { World, Asset } from '../data/types'
import { createSeedWorld, userById, assetById, projectById, IDS } from '../data/seed'
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
  canApproveDeposit,
  getTeam,
} from '../services/permission'
import {
  directReuse,
  favorite,
  reuse,
  deposit,
  AssetRuleError,
} from '../services/assetService'

let world: World
beforeEach(() => {
  world = createSeedWorld()
})

/* ═══════════════ 一、权限矩阵 · 广场 ═══════════════ */
describe('广场权限', () => {
  it('三种角色都能浏览广场', () => {
    for (const id of [IDS.admin, IDS.sunny, IDS.lin]) {
      expect(canBrowsePlaza(userById(world, id))).toBe(true)
    }
  })

  it('只有 admin 能治理广场；主账号和子账号都能投稿；admin 不投稿', () => {
    expect(canManagePlaza(userById(world, IDS.admin))).toBe(true)
    expect(canManagePlaza(userById(world, IDS.sunny))).toBe(false)
    // v4：广场投稿的把关人是 admin，所以主账号、子账号都能发起投稿；admin 只审不投
    expect(canContributeToPlaza(userById(world, IDS.sunny))).toBe(true)
    expect(canContributeToPlaza(userById(world, IDS.lin))).toBe(true)
    expect(canContributeToPlaza(userById(world, IDS.admin))).toBe(false)
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

  it('从团队库复用进项目：独立副本，造型随角色一起带过来', () => {
    const suwan = assetById(world, 'a_suwan')
    const copy = reuse(suwan, IDS.projNeon)
    expect(copy.scope).toBe('project')
    expect(copy.scopeId).toBe(IDS.projNeon)
    expect(copy.masterId).toBe(suwan.id)
    expect(copy.looks?.length).toBe(4) // 苏晚有 4 个造型（定妆照 + 国风/便装/赛博）
  })

  it('权限：复用（团队库→项目）主账号本团队任意项目，子账号仅被分配项目', () => {
    const neon = projectById(world, IDS.projNeon)
    expect(canReuseFromTeam(userById(world, IDS.sunny), neon)).toBe(true)
    expect(canReuseFromTeam(userById(world, IDS.may), neon)).toBe(false) // 阿May 没分配霓虹东京
  })

  it('复用角色可选带哪些造型：素模必带，造型按勾选（不传=整份、[]=只素模）', () => {
    const suwan = assetById(world, 'a_suwan')
    // 只带国风造型
    const one = reuse(suwan, IDS.projNeon, ['a_suwan_guofeng'])
    expect(one.baseModel).toBeTruthy() // 素模（本体）必带
    expect(one.looks?.length).toBe(1)
    expect(one.looks?.[0].id).toBe('a_suwan_guofeng')
    // 一个造型都不勾 = 只带素模
    const bare = reuse(suwan, IDS.projNeon, [])
    expect(bare.baseModel).toBeTruthy()
    expect(bare.looks ?? []).toHaveLength(0)
    // 不传 = 整份带（向后兼容）
    const all = reuse(suwan, IDS.projNeon)
    expect(all.looks?.length).toBe(4)
  })

  it('直接复用同样支持选造型：只带素模时 looks 为空、素模仍在', () => {
    const cyber = assetById(world, 'a_cyber_police')
    const bare = directReuse(cyber, IDS.projNeon, [])
    expect(bare.baseModel).toBeTruthy()
    expect(bare.looks ?? []).toHaveLength(0)
  })
})

/* ═══════════════ 六、流转 · 沉淀 ═══════════════ */
describe('沉淀（项目→团队库）', () => {
  it('主账号直接沉淀成团队母版（新母版：无 masterId）', () => {
    const src = assetById(world, 'a_ajie')
    const res = deposit(src, IDS.teamA, userById(world, IDS.sunny))
    expect(res.kind).toBe('asset')
    if (res.kind === 'asset') {
      expect(res.asset.scope).toBe('team')
      expect(res.asset.scopeId).toBe(IDS.teamA)
      expect(res.asset.masterId).toBeUndefined()
    }
  })

  it('子账号沉淀只生成"待审批申请"，不直接写团队库', () => {
    const src = assetById(world, 'a_ajie')
    const res = deposit(src, IDS.teamA, userById(world, IDS.lin))
    expect(res.kind).toBe('application')
    if (res.kind === 'application') {
      expect(res.status).toBe('pending')
      expect(res.applicantId).toBe(IDS.lin)
    }
  })

  it('admin 不参与沉淀，会被拦下', () => {
    const src = assetById(world, 'a_ajie')
    expect(() => deposit(src, IDS.teamA, userById(world, IDS.admin))).toThrow(AssetRuleError)
  })

  it('depositMode 反映三种角色的沉淀方式', () => {
    expect(depositMode(userById(world, IDS.sunny))).toBe('direct')
    expect(depositMode(userById(world, IDS.lin))).toBe('apply')
    expect(depositMode(userById(world, IDS.admin))).toBe('none')
  })

  it('只有该子账号的主账号能批他的沉淀申请', () => {
    const lin = userById(world, IDS.lin)
    expect(canApproveDeposit(userById(world, IDS.sunny), lin)).toBe(true)
    expect(canApproveDeposit(userById(world, IDS.ze), lin)).toBe(false) // 别团队主账号无权
  })
})

/* ═══════════════ 七、红线 · 只有成品能流转 ═══════════════ */
describe('红线：非成品不能被复用/沉淀/贡献', () => {
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
