/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 种子数据】seed.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：造一小组"假数据"——账号、团队、项目、资产——
 * 规模刚好够把 permission.ts 和 assetService.ts 里的每条规则都验一遍。
 *
 * 演员表（对齐 Demo 素材里的角色）：
 *   平台   · admin
 *   团队A  · Sunny(主) / 小林(子) / 阿May(子)
 *   团队B  · 阿泽(主) / 小鹿(子)
 *   Solo   · 老周(一人团队)
 *
 * createSeedWorld() 每次调用都返回一份「全新的」World，
 * 这样每个测试用例都在自己独立的数据上跑，互不干扰（这是很重要的测试卫生习惯）。
 * ─────────────────────────────────────────────────────────────────────── */

import type { World, User, Team, Project, Asset } from './types'

/* ─── 账号 id 常量：集中定义，避免到处写裸字符串写错 ─── */
export const IDS = {
  admin: 'u_admin',
  sunny: 'u_sunny', // 团队A 主账号
  lin: 'u_lin',     // 团队A 子账号（被分配到"霓虹东京"）
  may: 'u_may',     // 团队A 子账号（没被分配任何项目）
  ze: 'u_ze',       // 团队B 主账号
  lu: 'u_lu',       // 团队B 子账号
  zhou: 'u_zhou',   // Solo 一人团队主账号

  teamA: 'team_a',
  teamB: 'team_b',
  teamSolo: 'team_solo',

  projNeon: 'proj_neon',   // 霓虹东京（团队A · 分配给小林）
  projCase: 'proj_case',   // 都市迷案（团队A · 谁都没分配）
  projStar: 'proj_star',   // 星际公约（团队B · 分配给小鹿）
  projBoat: 'proj_boat',   // 孤舟（Solo）
} as const

/* ─── 一个造资产的小助手，省得每份都写全字段 ─── */
function asset(partial: Partial<Asset> & Pick<Asset, 'id' | 'category' | 'name' | 'scope'>): Asset {
  return {
    scopeId: undefined,
    status: 'done',
    cover: `mock://${partial.id}.png`,
    fields: {},
    tags: [],
    createdAt: 0,
    ...partial,
  }
}

export function createSeedWorld(): World {
  const users: User[] = [
    { id: IDS.admin, name: 'Admin', avatar: 'mock://admin.png', role: 'admin' },
    { id: IDS.sunny, name: 'Sunny', avatar: 'mock://sunny.png', role: 'owner', teamId: IDS.teamA },
    { id: IDS.lin, name: '小林', avatar: 'mock://lin.png', role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.may, name: '阿May', avatar: 'mock://may.png', role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.ze, name: '阿泽', avatar: 'mock://ze.png', role: 'owner', teamId: IDS.teamB },
    { id: IDS.lu, name: '小鹿', avatar: 'mock://lu.png', role: 'sub', teamId: IDS.teamB, parentId: IDS.ze },
    { id: IDS.zhou, name: '老周', avatar: 'mock://zhou.png', role: 'owner', teamId: IDS.teamSolo },
  ]

  const teams: Team[] = [
    // 团队A：两扇门都用默认（门A对子账号开、门B关）
    { id: IDS.teamA, ownerId: IDS.sunny },
    { id: IDS.teamB, ownerId: IDS.ze },
    { id: IDS.teamSolo, ownerId: IDS.zhou },
  ]

  const projects: Project[] = [
    { id: IDS.projNeon, name: '霓虹东京', teamId: IDS.teamA, cover: 'mock://neon.png', assignedSubs: [IDS.lin] },
    { id: IDS.projCase, name: '都市迷案', teamId: IDS.teamA, cover: 'mock://case.png', assignedSubs: [] },
    { id: IDS.projStar, name: '星际公约', teamId: IDS.teamB, cover: 'mock://star.png', assignedSubs: [IDS.lu] },
    { id: IDS.projBoat, name: '孤舟', teamId: IDS.teamSolo, cover: 'mock://boat.png', assignedSubs: [] },
  ]

  const assets: Asset[] = [
    // ── 广场（官方，全网可见）──
    asset({ id: 'a_cyberpolice', category: 'character', name: '赛博女警', scope: 'plaza',
      fields: { gender: '女', age: '青年', style: '赛博' } }),
    asset({ id: 'a_uniform', category: 'costume', name: '女警制服', scope: 'plaza' }),
    // 一份"生成中"的广场资产，用来验证"非成品不能流转"这条红线
    asset({ id: 'a_wip', category: 'character', name: '半成品角色', scope: 'plaza', status: 'generating' }),

    // ── 团队A 团队库（母版，带一个造型变体）──
    asset({ id: 'a_suwan', category: 'character', name: '苏晚', scope: 'team', scopeId: IDS.teamA,
      fields: { gender: '女', age: '青年', style: '国风' },
      looks: [asset({ id: 'a_suwan_guofeng', category: 'character', name: '苏晚·国风造型', scope: 'team', scopeId: IDS.teamA })] }),

    // ── 团队B 团队库 ──
    asset({ id: 'a_laok', category: 'character', name: '老K', scope: 'team', scopeId: IDS.teamB }),

    // ── 各项目里的资产 ──
    asset({ id: 'a_neon_role', category: 'character', name: '霓虹东京·主角', scope: 'project', scopeId: IDS.projNeon }),
    asset({ id: 'a_case_role', category: 'character', name: '都市迷案·嫌疑人', scope: 'project', scopeId: IDS.projCase }),
    asset({ id: 'a_star_role', category: 'character', name: '星际公约·舰长', scope: 'project', scopeId: IDS.projStar }),
  ]

  return { users, teams, projects, assets }
}

/** 从一份 world 里按 id 取用户的小助手（测试里常用）。 */
export function userById(world: World, id: string): User {
  const u = world.users.find((x) => x.id === id)
  if (!u) throw new Error(`种子数据里没有用户 ${id}`)
  return u
}

/** 按 id 取资产的小助手。 */
export function assetById(world: World, id: string): Asset {
  const a = world.assets.find((x) => x.id === id)
  if (!a) throw new Error(`种子数据里没有资产 ${id}`)
  return a
}
