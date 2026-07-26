/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 种子数据】seed.ts —— 完整演员表版（接真实图片）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把 demo所需素材 里那 41 张图、7 个账号、5 个项目，
 * 组织成一份能驱动界面、也能验证规则的假数据（World）。
 *
 * 图片路径约定：图片放在工程的 public/assets/ 下，浏览器按 `/assets/...` 访问。
 *   例如 team-library/suwan_role.png → cover: '/assets/team-library/suwan_role.png'
 * （public/ 里的文件 Vite 会原样对外提供，所以用 / 开头的绝对路径即可。）
 *
 * createSeedWorld() 每次返回一份全新的 World，测试之间互不污染。
 * ─────────────────────────────────────────────────────────────────────── */

import type { World, User, Team, Project, Asset } from './types'

/** 图片根目录：所有 cover 都以它开头。 */
const IMG = '/assets'

/* ─── 账号 / 团队 / 项目 id 常量（集中定义，避免裸字符串写错）─── */
export const IDS = {
  admin: 'u_admin',
  sunny: 'u_sunny', // 团队A 主账号（默认视角，内容最全）
  lin: 'u_lin',     // 团队A 子账号，被分配到"霓虹东京"
  may: 'u_may',     // 团队A 子账号，被分配到"都市迷案"
  ze: 'u_ze',       // 团队B 主账号
  lu: 'u_lu',       // 团队B 子账号，被分配到"星际公约"
  zhou: 'u_zhou',   // Solo 一人团队主账号

  teamA: 'team_a',
  teamB: 'team_b',
  teamSolo: 'team_solo',

  projNeon: 'proj_neon',   // 霓虹东京（团队A · 分配给小林）
  projShanhai: 'proj_shanhai', // 山海志（团队A · 演复用）
  projUrban: 'proj_urban', // 都市迷案（团队A · 分配给阿May · 演空项目从库添加）
  projStar: 'proj_star',   // 星际公约（团队B · 分配给小鹿）
  projBoat: 'proj_boat',   // 孤舟（Solo）
} as const

/* ─── 造资产的小助手：省去每份都写全字段 ─── */
function asset(
  partial: Partial<Asset> & Pick<Asset, 'id' | 'category' | 'name' | 'scope' | 'cover'>,
): Asset {
  return {
    scopeId: undefined,
    status: 'done',
    fields: {},
    tags: [],
    createdAt: 0,
    ...partial,
  }
}

export function createSeedWorld(): World {
  /* ── 用户（头像用真实图）── */
  const users: User[] = [
    { id: IDS.admin, name: 'Admin', avatar: `${IMG}/avatars/admin_avatar.png`, role: 'admin' },
    { id: IDS.sunny, name: 'Sunny', avatar: `${IMG}/avatars/sunny_avatar.png`, role: 'owner', teamId: IDS.teamA },
    { id: IDS.lin, name: '小林', avatar: `${IMG}/avatars/xiaolin_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.may, name: '阿May', avatar: `${IMG}/avatars/amay_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.ze, name: '阿泽', avatar: `${IMG}/avatars/aze_avatar.png`, role: 'owner', teamId: IDS.teamB },
    { id: IDS.lu, name: '小鹿', avatar: `${IMG}/avatars/xiaolu_avatar.png`, role: 'sub', teamId: IDS.teamB, parentId: IDS.ze },
    { id: IDS.zhou, name: '老周', avatar: `${IMG}/avatars/laozhou_avatar.png`, role: 'owner', teamId: IDS.teamSolo },
  ]

  /* ── 团队（两扇门都用默认：门A对子账号开、门B关）── */
  const teams: Team[] = [
    { id: IDS.teamA, ownerId: IDS.sunny },
    { id: IDS.teamB, ownerId: IDS.ze },
    { id: IDS.teamSolo, ownerId: IDS.zhou },
  ]

  /* ── 项目（封面用真实图）── */
  const projects: Project[] = [
    { id: IDS.projNeon, name: '霓虹东京', teamId: IDS.teamA, cover: `${IMG}/project-covers/neon_tokyo_cover.png`, assignedSubs: [IDS.lin] },
    { id: IDS.projShanhai, name: '山海志', teamId: IDS.teamA, cover: `${IMG}/project-covers/shanhai_cover.png`, assignedSubs: [IDS.lin] },
    { id: IDS.projUrban, name: '都市迷案', teamId: IDS.teamA, cover: `${IMG}/project-covers/urban_mystery_cover.png`, assignedSubs: [IDS.may] },
    { id: IDS.projStar, name: '星际公约', teamId: IDS.teamB, cover: `${IMG}/project-covers/starcovenant_cover.png`, assignedSubs: [IDS.lu] },
    { id: IDS.projBoat, name: '孤舟', teamId: IDS.teamSolo, cover: `${IMG}/project-covers/loneboat_cover.png`, assignedSubs: [] },
  ]

  /* ── 资产 ─────────────────────────────────────────────────────── */
  const assets: Asset[] = [
    /* 【广场·官方货架 9】四类目齐（角色/服装/场景/道具）*/
    asset({ id: 'a_cyber_police', category: 'character', name: '赛博女警', scope: 'plaza', cover: `${IMG}/plaza-shelf/cyber_police_role.png`, fields: { gender: '女', age: '青年', style: '赛博' } }),
    asset({ id: 'a_cyber_uniform', category: 'costume', name: '女警制服', scope: 'plaza', cover: `${IMG}/plaza-shelf/cyber_police_uniform.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_rainy_rooftop', category: 'scene', name: '雨夜天台', scope: 'plaza', cover: `${IMG}/plaza-shelf/rainy_rooftop_scene.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_holo_bracelet', category: 'prop', name: '全息手环', scope: 'plaza', cover: `${IMG}/plaza-shelf/holographic_bracelet_prop.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_swordsman', category: 'character', name: '东方剑客', scope: 'plaza', cover: `${IMG}/plaza-shelf/eastern_swordsman_role.png`, fields: { gender: '男', age: '青年', style: '国风' } }),
    asset({ id: 'a_mech_butler', category: 'character', name: '机械管家', scope: 'plaza', cover: `${IMG}/plaza-shelf/mech_butler_role.png`, fields: { style: '科幻' } }),
    asset({ id: 'a_swordsman_robe', category: 'costume', name: '剑客长袍', scope: 'plaza', cover: `${IMG}/plaza-shelf/swordsman_robe_costume.png`, fields: { style: '国风' } }),
    asset({ id: 'a_cyber_street', category: 'scene', name: '赛博街市', scope: 'plaza', cover: `${IMG}/plaza-shelf/cyber_street_scene.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_lightsaber', category: 'prop', name: '光剑', scope: 'plaza', cover: `${IMG}/plaza-shelf/lightsaber_prop.png`, fields: { style: '科幻' } }),

    /* 【团队A 团队库·母版 9】（苏晚带 3 个造型子资产）*/
    asset({
      id: 'a_suwan', category: 'character', name: '苏晚', scope: 'team', scopeId: IDS.teamA,
      cover: `${IMG}/team-library/suwan_role.png`, fields: { gender: '女', age: '青年', style: '国风' },
      looks: [
        asset({ id: 'a_suwan_guofeng', category: 'character', name: '苏晚·国风造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/suwan_look_guofeng.png` }),
        asset({ id: 'a_suwan_casual', category: 'character', name: '苏晚·便装造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/suwan_look_casual.png` }),
        asset({ id: 'a_suwan_cyber', category: 'character', name: '苏晚·赛博造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/suwan_look_cyber.png` }),
      ],
    }),
    asset({ id: 'a_oldk', category: 'character', name: '老K', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/oldk_role.png`, fields: { gender: '男', age: '中年' } }),
    asset({ id: 'a_cyber_jacket', category: 'costume', name: '赛博夹克', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/cyber_jacket_costume.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_palace_dress', category: 'costume', name: '国风宫装', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/palace_dress_costume.png`, fields: { style: '国风' } }),
    asset({ id: 'a_ancient_dock', category: 'scene', name: '古镇码头', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/ancient_dock_scene.png`, fields: { style: '国风' } }),
    asset({ id: 'a_folding_fan', category: 'prop', name: '折扇', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/folding_fan_prop.png`, fields: { style: '国风' } }),

    /* 【项目·霓虹东京 5】（团队A）*/
    asset({ id: 'a_ajie', category: 'character', name: '阿杰', scope: 'project', scopeId: IDS.projNeon, cover: `${IMG}/proj-neon-tokyo/ajie_role.png`, fields: { gender: '男', style: '赛博' } }),
    asset({ id: 'a_neon_dancer', category: 'character', name: '霓虹舞者', scope: 'project', scopeId: IDS.projNeon, cover: `${IMG}/proj-neon-tokyo/neon_dancer_role.png`, fields: { gender: '女', style: '赛博' } }),
    asset({ id: 'a_mech_exo', category: 'costume', name: '机甲外骨骼', scope: 'project', scopeId: IDS.projNeon, cover: `${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png`, fields: { style: '科幻' } }),
    asset({ id: 'a_neon_bar', category: 'scene', name: '霓虹酒吧', scope: 'project', scopeId: IDS.projNeon, cover: `${IMG}/proj-neon-tokyo/neon_bar_scene.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_mech_prosthetic', category: 'prop', name: '机械义肢', scope: 'project', scopeId: IDS.projNeon, cover: `${IMG}/proj-neon-tokyo/mech_prosthetic_prop.png`, fields: { style: '科幻' } }),

    /* 【项目·山海志 3】（团队A）*/
    asset({ id: 'a_shangui', category: 'character', name: '山鬼', scope: 'project', scopeId: IDS.projShanhai, cover: `${IMG}/proj-shanhai/shangui_role.png`, fields: { style: '国风' } }),
    asset({ id: 'a_bamboo', category: 'scene', name: '竹林', scope: 'project', scopeId: IDS.projShanhai, cover: `${IMG}/proj-shanhai/bamboo_forest_scene.png`, fields: { style: '国风' } }),
    asset({ id: 'a_token', category: 'prop', name: '令牌', scope: 'project', scopeId: IDS.projShanhai, cover: `${IMG}/proj-shanhai/token_prop.png`, fields: { style: '国风' } }),

    /* 【项目·都市迷案 1】林警官（=广场赛博女警 直接复用改名而来，masterId 记录血缘）*/
    asset({
      id: 'a_linjingguan', category: 'character', name: '林警官', scope: 'project', scopeId: IDS.projUrban,
      cover: `${IMG}/proj-urban-mystery/linjingguan_look_cyberjacket.png`,
      masterId: 'a_cyber_police', following: false, fields: { gender: '女', style: '赛博' },
    }),

    /* 【项目·星际公约 1】（团队B）*/
    asset({ id: 'a_captain', category: 'character', name: '星舰船长', scope: 'project', scopeId: IDS.projStar, cover: `${IMG}/proj-star-covenant/starship_captain_role.png`, fields: { style: '科幻' } }),

    /* 【项目·孤舟 1】（Solo）*/
    asset({ id: 'a_indie_lead', category: 'character', name: '孤舟主角', scope: 'project', scopeId: IDS.projBoat, cover: `${IMG}/proj-lone-boat/indie_lead_role.png` }),
  ]

  return { users, teams, projects, assets }
}

/* ─── 一些测试/界面里常用的取数小助手 ─── */

export function userById(world: World, id: string): User {
  const u = world.users.find((x) => x.id === id)
  if (!u) throw new Error(`种子数据里没有用户 ${id}`)
  return u
}

export function assetById(world: World, id: string): Asset {
  const a = world.assets.find((x) => x.id === id)
  if (!a) throw new Error(`种子数据里没有资产 ${id}`)
  return a
}

export function projectById(world: World, id: string): Project {
  const p = world.projects.find((x) => x.id === id)
  if (!p) throw new Error(`种子数据里没有项目 ${id}`)
  return p
}
