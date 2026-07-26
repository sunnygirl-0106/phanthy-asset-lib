/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 领域模型】types.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：用 TypeScript 类型，把《产品逻辑精简版 v3》里的核心概念
 * （三层两世界、账号模型、资产字段、拷贝/跟随）翻译成"代码里的名词"。
 *
 * 为什么它最重要：
 *   在我们这套架构里，types.ts 就是「活文档」。产品文档会过时，但类型不会——
 *   因为一旦类型写错、字段少了，其它所有代码都会当场报红。所以读懂这个文件，
 *   就等于读懂了整个资产库的数据长什么样。
 *
 * 这里只定义「数据的形状」，不写任何逻辑。逻辑在 services/ 里。
 * ─────────────────────────────────────────────────────────────────────── */


/* ─── 一、四个基础枚举（用字面量联合类型表达"只能是这几个值之一"）─── */

/**
 * 角色：整个权限系统的起点。
 * - admin：平台唯一顶级账号，只做治理（上架/审核/处置违规），不创作。就是"我们自己"。
 * - owner：主账号，手机号注册，可开会员、建团队、建子账号。是团队的拥有者。
 * - sub：子账号，主账号建的成员，没有独立手机号，是主账号的附属品。
 */
export type Role = 'admin' | 'owner' | 'sub'

/**
 * 作用域：一份资产"待在哪一层"。这就是"三层两世界"里的三层。
 * - plaza：素材广场（世界一·官方货架，全网可见）
 * - team：团队资产库（世界二·我/团队跨项目的常驻母版库）
 * - project：项目资产库（世界二·单个项目在用的资产池）
 */
export type Scope = 'plaza' | 'team' | 'project'

/** 资产类目：用户可见的 5 类。三层库的类目和字段完全一致。 */
export type Category = 'character' | 'costume' | 'scene' | 'prop' | 'audio'
//                      角色         服装         场景       道具     音频

/**
 * 资产状态机：资产"成不成立"看状态，不看有没有图。
 * 红线规则：只有 'done'（成品）才能被复用 / 沉淀 / 贡献。
 */
export type AssetStatus = 'empty' | 'generating' | 'done' | 'failed'
//                         空壳      生成中          成品      失败


/* ─── 二、账号与组织 ─── */

/**
 * 用户。注意 teamId 和 parentId 都是可选的，因为不同角色的情况不一样：
 * - admin：既没有 teamId 也没有 parentId（他不属于任何团队）。
 * - owner：有 teamId（指向自己的团队），没有 parentId。
 * - sub：有 teamId（所属团队）也有 parentId（挂在哪个主账号下）。
 */
export interface User {
  id: string
  name: string
  avatar: string
  role: Role
  teamId?: string    // 所属团队；admin 没有
  parentId?: string  // 子账号挂靠的主账号 id；只有 sub 有
}

/**
 * 团队 = 一个主账号 + 它名下的所有子账号。
 * 主账号之间不能组队；跨团队共享只能经由素材广场。
 *
 * 下面两个字段就是产品文档里子账号「两扇门」的开关：
 */
export interface Team {
  id: string
  ownerId: string  // 团队拥有者（主账号）的 id

  /**
   * 门 A（团队库货架）默认对所有子账号开放。
   * 这个数组记录被主账号「单独关掉」的子账号 id——绝大多数时候是空的。
   * （产品文档：留一个 per-sub 开关，给边缘子账号关掉团队库可见性。）
   */
  teamLibraryHiddenSubs?: string[]

  /**
   * 门 B（别人项目的资产）默认关闭。
   * 这是主账号可以「一键放开」的粗粒度开关：true = 允许本团队子账号查看全部项目的资产。
   * 我们刻意不做"逐个项目挑"的细粒度——复杂度不值当。
   */
  allowSubsSeeAllProjects?: boolean
}

/**
 * 项目。assignedSubs 对应真实仓库里的 UserProjectAccess：
 * 子账号必须被逐个授权进某个项目，才能在里面干活。
 */
export interface Project {
  id: string
  name: string
  teamId: string          // 归属团队
  cover: string
  assignedSubs: string[]  // 被授权进入本项目的子账号 id 列表
}


/* ─── 三、资产本体 ─── */

/**
 * 资产的结构化字段，同时兼作"自动分面筛选"的维度。
 * 角色的人设（性别/年龄/风格）就存在这里；其它类目可以只用一部分。
 * 末尾的索引签名允许存放我们暂时没穷举的字段。
 */
export interface AssetFields {
  gender?: string
  age?: string
  style?: string
  [key: string]: unknown
}

/**
 * 资产：整个系统的主角。
 *
 * 关于「拷贝 + 跟随」这两根线，请重点看 masterId 和 following——
 * 它们是全篇最容易混、也最关键的两个概念：
 *   · masterId  = 血缘：这份副本是从哪个资产拷出来的（记录来源，永久不变）。
 *   · following = 跟随线：母版更新时，这份副本要不要收到"要同步吗"的提示。
 *                  只在"拉取那一刻"决定；默认 false。
 * 一句话：masterId 回答"我从哪来"，following 回答"我还听不听母版的"。
 */
export interface Asset {
  id: string
  category: Category
  name: string          // 名字是本地的：改名不跟母版同步、也不断链（最高频动作）
  scope: Scope
  scopeId?: string      // 待在哪个 team / project 的 id；plaza 资产为空
  status: AssetStatus

  masterId?: string     // 母版血缘：从哪个资产拷来的。原创资产没有（它自己就是母版）。
  following?: boolean   // 是否正在跟随母版。直接复用产生的快照永远为 false。

  cover: string
  fields: AssetFields
  tags: string[]        // 本地标签：改了不断链
  voiceId?: string      // 角色音色（角色专有字段，本期占位）
  looks?: Asset[]       // 角色的造型变体子资产（角色×服装生的成品图，挂在角色下）
  createdAt: number
}


/* ─── 四、全局数据容器 ─── */

/**
 * World = 整个 Demo 的「唯一真相」。
 * 我们后面所有权限/流转函数，都是"拿 currentUser 去这份 World 里过滤/变换"。
 * 这就是架构里说的「单一数据源 + 派生视图」：数据只有一份，
 * 不同账号看到的不同世界，都是用纯函数从这一份数据里算出来的，绝不复制多份。
 */
export interface World {
  users: User[]
  teams: Team[]
  projects: Project[]
  assets: Asset[]
}
