/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【服务层 · 权限】permission.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把《产品逻辑精简版 v3》第 5 章那张「权限矩阵」，
 * 一格一格翻译成一堆小小的「纯函数」。
 *
 * 什么叫纯函数？—— 给定相同的输入，永远返回相同的输出，且不偷偷修改外部数据。
 * 好处：好读、好测、好对照产品文档。每个函数都能单独拎出来问一句
 *      "admin 能不能收藏？"—— 答案就是一次函数调用。
 *
 * 这一层就是 sunny 直觉里说的"后端逻辑"。它现在跑在浏览器里、喂假数据；
 * 将来接真后端时，这些规则会几乎原样搬到服务器端做鉴权。所以把它写对、写清楚，
 * 就是在提前把后端的权限设计钉死。
 * ─────────────────────────────────────────────────────────────────────── */

import type { User, Team, Project, Asset, World } from '../data/types'

/* ─── 一、角色小助手（让下面的代码读起来像大白话）─── */

export const isAdmin = (u: User): boolean => u.role === 'admin'
export const isOwner = (u: User): boolean => u.role === 'owner'
export const isSub = (u: User): boolean => u.role === 'sub'

/* ─── 二、从 World 里查东西的小助手 ─── */

export const getTeam = (world: World, teamId: string | undefined): Team | undefined =>
  world.teams.find((t) => t.id === teamId)

export const getProject = (world: World, projectId: string | undefined): Project | undefined =>
  world.projects.find((p) => p.id === projectId)

/* ─── 三、子账号的门 A ────────────────────────────────────────────────
 * 门 A = 团队库货架：默认对子账号开，除非主账号把这个子账号单独关掉。
 * 【v4 改动】原来还有门 B（看别人项目），已砍掉：子账号只看被分配的项目，
 * 想跨项目共享就走团队库/广场。所以这里不再有 doorBAllProjectsOpen。   */

/** 门 A 对某个子账号是否打开（默认开）。 */
export function doorATeamLibraryOpen(team: Team, sub: User): boolean {
  const closed = team.teamLibraryHiddenSubs ?? []
  return !closed.includes(sub.id)
}

/* ─── 四、浏览类权限 ─── */

/** 广场：所有人都能浏览（包括 admin，只是他是去治理的）。 */
export function canBrowsePlaza(_user: User): boolean {
  return true
}

/**
 * 团队库货架：能不能浏览某个团队的资产库。
 * - admin：能看（仅用于治理）
 * - owner：只能看自己团队的
 * - sub：只能看自己团队的，且门 A 得开着
 */
export function canBrowseTeamLibrary(user: User, team: Team): boolean {
  if (isAdmin(user)) return true
  if (isOwner(user)) return user.teamId === team.id
  // sub：
  if (user.teamId !== team.id) return false
  return doorATeamLibraryOpen(team, user)
}

/**
 * 能不能看到某个「项目」里的资产。
 * - admin：全部项目都能看
 * - owner：只看本团队的项目
 * - sub：只看本团队里被分配给自己的项目——没分配就是看不到，没有例外。
 *   （v4 改动：门 B 砍掉后，子账号再没有"看全部项目"的口子。）
 *
 * 注意 team 参数保留着：门 A 相关判断和将来可能的团队级策略仍要用它，
 * 这里刻意不删签名，免得调用处（canSee / 页面）跟着连锁改。
 */
export function canSeeProjectAssets(user: User, project: Project, _team: Team): boolean {
  if (isAdmin(user)) return true
  if (isOwner(user)) return user.teamId === project.teamId
  // sub：本团队 + 被分配，两个条件缺一不可
  if (user.teamId !== project.teamId) return false
  return project.assignedSubs.includes(user.id)
}

/**
 * ★ 核心函数 canSee ★
 * "我能不能看到这一份资产" = 拿 currentUser 去过滤这份唯一的全局数据。
 * 界面上"某个账号看到的世界"，本质就是对所有资产跑一遍这个函数。
 */
export function canSee(world: World, user: User, asset: Asset): boolean {
  switch (asset.scope) {
    case 'plaza':
      return canBrowsePlaza(user)

    case 'team': {
      const team = getTeam(world, asset.scopeId)
      if (!team) return false
      return canBrowseTeamLibrary(user, team)
    }

    case 'project': {
      const project = getProject(world, asset.scopeId)
      if (!project) return false
      const team = getTeam(world, project.teamId)
      if (!team) return false
      return canSeeProjectAssets(user, project, team)
    }
  }
}

/* ─── 五、写入 / 流转类权限 ────────────────────────────────────────
 * 这些回答的是"某个账号能不能做某个动作"，对应矩阵里那些流转行。   */

/**
 * 直接复用（广场 → 项目）。
 * - owner：可以，前提是目标项目属于自己团队
 * - sub：可以，但只能在被分配的项目里
 * - admin：不行（admin 不创作）
 */
export function canDirectReuse(user: User, targetProject: Project): boolean {
  if (isAdmin(user)) return false
  if (isOwner(user)) return user.teamId === targetProject.teamId
  // sub：
  return user.teamId === targetProject.teamId && targetProject.assignedSubs.includes(user.id)
}

/**
 * 收藏（广场 → 团队库）。只有主账号能收藏；子账号请改用"直接复用"。
 */
export function canFavorite(user: User): boolean {
  return isOwner(user)
}

/**
 * 复用（团队库 → 项目）。规则同直接复用：owner 本团队任意项目，sub 仅被分配项目。
 */
export function canReuseFromTeam(user: User, targetProject: Project): boolean {
  if (isAdmin(user)) return false
  if (isOwner(user)) return user.teamId === targetProject.teamId
  return user.teamId === targetProject.teamId && targetProject.assignedSubs.includes(user.id)
}

/**
 * 沉淀（项目 → 团队库）的方式。
 * 用一个联合类型表达三种情况，比返回 true/false 更能表达"子账号是要走审批的"：
 * - 'direct'：主账号，直接沉淀
 * - 'apply' ：子账号，要走"申请 → 主账号批"
 * - 'none'  ：admin，不参与创作/沉淀
 */
export type DepositMode = 'direct' | 'apply' | 'none'

export function depositMode(user: User): DepositMode {
  if (isOwner(user)) return 'direct'
  if (isSub(user)) return 'apply'
  return 'none'
}

/* ─── 六、治理 / 审核类权限（admin 与主账号各管一摊）─── */

/** 广场上架 / 审核 / 下架：官方素材的唯一写入口，仅 admin。 */
export function canManagePlaza(user: User): boolean {
  return isAdmin(user)
}

/**
 * 谁能"移除"一份广场素材（v4：上架后不可编辑，只能删/下架）：
 * - admin：可以下架任何一份广场素材。
 * - 投稿作者本人：可以删掉自己投上去的那份（contributedBy === 我）。
 * - 其他人：不行。
 * 注意：删/下架只是把广场这份拿掉，已经被别人复用/收藏出去的独立副本不受影响。
 */
export function canRemovePlazaAsset(user: User, asset: Asset): boolean {
  if (asset.scope !== 'plaza') return false
  if (isAdmin(user)) return true
  return !!asset.contributedBy && asset.contributedBy === user.id
}

/**
 * 向广场投稿 / 贡献作品：主账号和子账号都能发起。
 * 【v4 改动】原来只有主账号能投；现在子账号也能投——因为广场是平台公开层，
 * 把关人天然是 admin（见 canReviewPlaza），跟"这个人是不是主账号"无关。
 * admin 只当审核方、自己不投稿。
 */
export function canContributeToPlaza(user: User): boolean {
  return isOwner(user) || isSub(user)
}

/** 审核广场投稿：仅 admin（不管投稿人是主账号还是子账号，都由 admin 审）。 */
export function canReviewPlaza(user: User): boolean {
  return isAdmin(user)
}

/**
 * 审批"子账号沉淀申请"：只有该子账号所在团队的主账号能批。
 * 这是团队内部唯一的治理动作（团队库本身像内部 wiki，不做常规审核）。
 */
export function canApproveDeposit(approver: User, applicant: User): boolean {
  return isOwner(approver) && approver.id === applicant.parentId
}
