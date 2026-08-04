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
      // 已下架的素材不再对外陈列：只有 admin（治理）和投稿人本人（能看到自己的稿被下了）看得见。
      if (!isListed(asset)) {
        return isAdmin(user) || (!!asset.contributedBy && asset.contributedBy === user.id)
      }
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
 * 存入（项目 → 团队库）的方式。
 * 用一个联合类型表达三种情况，比返回 true/false 更能表达"子账号是要走审批的"：
 * - 'direct'：主账号，直接存入
 * - 'apply' ：子账号，要走"申请 → 主账号批"
 * - 'none'  ：admin，不参与创作/存入
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
 * 一份广场素材现在是不是在货架上（审核中心改造新增）。
 * 缺省（老数据 / 种子官方素材没有这个字段）一律算「在架」。
 * 全仓库判断上架状态都走这里，不要在页面里裸写 shelfStatus 比较。
 */
export function isListed(asset: Asset): boolean {
  return (asset.shelfStatus ?? 'listed') === 'listed'
}

/**
 * 谁能"移除"一份广场素材（审核中心改造后语义收窄）：
 * 现在这条只回答「**作者撤回自己的投稿**」——硬删除，作者不要了就是不要了。
 * admin 的「下架」不再走这里（下架 ≠ 删除，走 store.runDelistPlaza 打状态位、可重新上架）。
 * - admin：仍返回 true（页面不用它做删除，但撤稿判定的语义上 admin 也算有权）。
 * - 投稿作者本人：可以删掉自己投上去的那份（contributedBy === 我）。
 * - 其他人：不行。
 * 注意：删只是把广场这份拿掉，已经被别人复用/收藏出去的独立副本不受影响。
 */
export function canRemovePlazaAsset(user: User, asset: Asset): boolean {
  if (asset.scope !== 'plaza') return false
  if (isAdmin(user)) return true
  return !!asset.contributedBy && asset.contributedBy === user.id
}

/**
 * 谁能把一份已下架的素材「重新上架」：只有 admin。
 * 投稿作者不行——他能撤回自己的稿（删除），但把东西放回全网货架是平台的权力。
 */
export function canRelistPlazaAsset(user: User, asset: Asset): boolean {
  return isAdmin(user) && asset.scope === 'plaza' && !isListed(asset)
}

/**
 * 谁能"删除"一份团队库 / 项目资产库里的资产：
 * - 只针对 team / project 两层（广场走 canRemovePlazaAsset，那是下架/撤稿）。
 * - admin 只治理、不碰团队与项目里的创作物，所以不给删。
 * - 其余账号（owner / sub）能删他们所在层看到的这份。删的只是这一份，
 *   已被复用/存出去的独立副本 id 不同、不受影响。
 */
export function canDeleteLibraryAsset(user: User, asset: Asset): boolean {
  if (asset.scope !== 'team' && asset.scope !== 'project') return false
  return !isAdmin(user)
}

/**
 * 向广场投稿 / 贡献（v6）：按"在哪一层发起"收口。
 * - admin：不投稿（只审核）。
 * - 主账号：团队库、项目库都能发起。
 * - 子账号：只能在【项目资产库】发起；团队库对子账号封闭。
 * 【v4→v6】原来只吃 user（owner/sub 都能投）；v6 增加 scope 感知：子账号想让团队库的东西
 * 进广场，走"复用到项目 → 重新生成 → 资产存入申请"，不在团队库直接投。
 */
export function canContributeToPlaza(user: User, asset: Asset): boolean {
  if (isAdmin(user)) return false
  if (isOwner(user)) return asset.scope === 'team' || asset.scope === 'project'
  // sub：仅项目库
  return isSub(user) && asset.scope === 'project'
}

/**
 * 能不能对这份资产"重新生成 / 新增造型"（0803 修订）。
 * - 只有项目库能生成：生产只发生在项目里（空壳、批量生成都在项目层）。
 * - 广场：官方货架，不可编辑。团队库：筛选过的成品母版，提示词只读、不再生成。
 * - admin：不行（只治理）。
 * - 主账号 / 子账号：仅项目库。
 */
export function canRegenerate(user: User, asset: Asset): boolean {
  if (asset.scope !== 'project') return false // ← 只有项目库能生成：生产只发生在项目里
  if (isAdmin(user)) return false
  return isOwner(user) || isSub(user)
}

/** 提示词可见性（v6）：项目库/团队库可看可复制；素材广场本期不给用户看。 */
export function canViewPrompt(asset: Asset): boolean {
  return asset.scope !== 'plaza'
}

/** 审核广场投稿：仅 admin（不管投稿人是主账号还是子账号，都由 admin 审）。 */
export function canReviewPlaza(user: User): boolean {
  return isAdmin(user)
}

/**
 * 能不能进「审核中心」页面（#/review）。
 *
 * 【v2 收敛】原来主账号也能进——现在不能了。原因不是权限，是产品形态：
 * 审核中心是 admin 的岗位工作台（广场投稿、内容下架/重新上架），他每次登录都为这个来。
 * 主账号的「资产存入申请」是被动打断，不该塞进一个他想不起来的菜单里；
 * 它改由通知铃铛推送 + 团队资产库边栏常驻入口触达，在团队库上开抽屉处理。
 */
export function canEnterReviewCenter(user: User): boolean {
  return isAdmin(user)
}

/**
 * 能不能审批「资产存入申请」——即主账号处理自己名下子账号的申请。
 * 和 canApproveDeposit（判断某一条具体申请）不同，这个只回答「这个账号有没有这项职责」，
 * 用来决定要不要渲染入口（团队库边栏入口 / 抽屉守卫共用）。
 */
export function canHandleDepositRequests(user: User): boolean {
  return isOwner(user)
}

/**
 * 审批"子账号资产存入申请"：只有该子账号所在团队的主账号能批。
 * 这是团队内部唯一的治理动作（团队库本身像内部 wiki，不做常规审核）。
 */
export function canApproveDeposit(approver: User, applicant: User): boolean {
  return isOwner(approver) && approver.id === applicant.parentId
}
