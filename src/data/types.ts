/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 领域模型】types.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：用 TypeScript 类型，把《产品逻辑精简版 v3》里的核心概念
 * （三层两世界、账号模型、资产字段、拷贝血缘）翻译成"代码里的名词"。
 *
 * 【v4 改动】带教敲定：广场素材上架审核后不可编辑（只能删/下架/重传），
 * 母版永不变内容 → "跟随母版更新"失去存在理由，整套跟随/断链已删除。
 * 层与层之间就是纯粹的「拷贝」，masterId 只作血缘记录，不再挂任何同步行为。
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

/**
 * 资产类目：前 5 类是可复用的「生产要素」，三层库的类目和字段完全一致。
 * 第 6 类 'other'（其他）是另一层东西——创作过程的留存物（分镜图 / 视频片段 / 剧本文本），
 * 只存在于项目资产库，不参与向上流转（不能沉淀到团队库、不能贡献到广场），
 * 也不套用前五类的素模 / 造型 / 音色结构。详见 canvasService / assetService 的守卫。
 */
export type Category = 'character' | 'costume' | 'scene' | 'prop' | 'audio' | 'other'
//                      角色         服装         场景       道具     音频      其他

/** 音色来源：预置库挑的，还是用户复刻的。 */
export type VoiceType = 'preset' | 'cloned'

/**
 * 候选图（0803 结构重做）：一次次生成留下来的备选图。
 * 它**不是资产**——没有名字 / 类目，不能被单独流转；只是这份资产历次生成的产物之一。
 * 定稿图（Asset.cover）必定也是候选池里某一张（url 与 cover 相等的那张即定稿）。
 */
export interface Candidate {
  id: string
  url: string
  prompt?: string      // 产出这张图时用的提示词（本 demo 可空）
  createdAt: number
}

/**
 * 音色 = 角色的"听觉身份锚点"（1 个，是素模的孪生兄弟，不是造型）。
 * 本期无后端：预置音色 previewUrl 指向真实 mp3；复刻音色 previewUrl 先回放用户上传的原音占位。
 */
export interface Voice {
  id: string             // 音色标识：预置=固定 id；复刻=本期前端生成的占位 id
  type: VoiceType        // 'preset' | 'cloned'
  name: string           // 展示名，如"清透女声" / "男主·磁性低音"
  gender?: string        // '男' | '女'（预置带上，便于展示）
  previewUrl: string     // 试听音源：预置=/assets/voices/xxx.mp3；复刻=上传原音的 objectURL（占位）
  sampleUrl?: string     // 复刻源料：用户上传的 5–10s 录音（仅 type==='cloned'）
  sampleDuration?: number// 复刻源料时长（秒），仅 cloned
  providerVoiceId?: string // 接入豆包后真正的音色/speaker_id；本期恒为空（占位，标记"待接入"）
}

/**
 * 资产状态机：资产"成不成立"看状态，不看有没有图。
 * 红线规则：只有 'done'（成品）才能被复用 / 沉淀 / 贡献。
 *
 * 【0803】'empty'（空壳）语义扩大，成为一等公民：
 *   · 既表示"图被删光后的降级态"，
 *   · 也表示"只有提示词、还没生成过"（拆解剧本时一次性写好提示词、只出素模图，
 *     穿衣服的角色只有提示词没有图，等用户手动 / 批量触发生成）。
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
 * 【v4 改动】原来子账号有「两扇门」，现在只剩门 A。
 * 门 B（看别人项目）被带教砍掉了："剧组"里的人只干这个剧组的活、只看这个剧组的资产，
 * 想跨剧组共享就丢到公司公共资源（广场）里去。所以子账号只能看被分配的项目，
 * 连"一键看全部项目"的粗粒度开关都不留了（原 allowSubsSeeAllProjects 已删除）。
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
  tag?: string            // 展示用风格标签（写实 / 赛博 / 国风…），仅界面陈列，不参与权限
  createdAt?: number       // 创建时间（项目管理列表按它排序 / 展示）
  assignedSubs: string[]  // 被授权进入本项目的子账号 id 列表
}

/**
 * 画布 = 项目下的一张"无限画布"草稿台。一个项目可有多张画布（对应界面上的"画布列表"）。
 * 画布本身只是入口 + 元信息；里面摆的节点是纯 UI 侧数据（见 canvasService.CanvasNode），
 * 拖节点不入库、不产副本——只有右键"上传到项目资产库"那一刻才产生 world 资产（红线 3）。
 */
export interface Canvas {
  id: string
  projectId: string
  name: string
  cover: string     // 列表缩略图
  createdAt: number
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
  /**
   * 「其他」类目（category==='other'）专用，标记这一份到底是图 / 视频 / 文本，决定卡片与详情怎么渲染：
   *   · media==='image'：cover 存图片地址（与前五类一致）。
   *   · media==='video'：cover 存视频首帧/海报图，videoUrl 存可播放视频源（demo 可空串占位）。
   *   · media==='text' ：cover 留空，text 存正文；卡片渲染文字预览块，不出现裂图。
   * 音频不进「其他」：音频有自己的类目（category==='audio'），只在那里存。
   */
  media?: 'image' | 'video' | 'text'
  videoUrl?: string
  text?: string
  [key: string]: unknown
}

/**
 * 资产：整个系统的主角。
 *
 * 关于血缘，请重点看 masterId：
 *   · masterId = 血缘：这份副本是从哪个资产拷出来的（记录来源，永久不变）。
 *     它只回答"我从哪来"，纯信息展示用，不挂任何同步/跟随行为。
 *
 * 【v4 改动】原来还有一个 following（跟随线）字段，已删除。
 * 因为广场母版上架后不可编辑（只能删/下架/重传），母版内容永不变化，
 * 也就没有"母版更新了要不要同步"这回事——层与层之间就是干脆的拷贝。
 */
export interface Asset {
  id: string
  category: Category
  name: string          // 名字是本地的：改名不跟母版同步（最高频动作）
  scope: Scope
  scopeId?: string      // 待在哪个 team / project 的 id；plaza 资产为空
  status: AssetStatus

  masterId?: string     // 母版血缘：从哪个资产拷来的。原创资产没有（它自己就是母版）。纯信息，不挂同步行为。

  /**
   * 图片级提示词（v6）：产出这份资产图的出图提示词，跟"人设/角色设定"无关。
   * 每份资产（角色 / 服装 / 场景 / 道具 / 音频）都只有一段自己的提示词——
   * 变体（睡衣苏晚、夜晚客厅…）各自独立成资产、各自带自己的提示词，不再挂在父资产下。
   * 本地字段，随副本走、可改，不参与库内去重。
   */
  prompt?: string

  /**
   * 定稿图（0803，原 cover 语义升级）：这份资产对外就长这样——
   * 卡片封面、被引用时用的都是它。空壳（status==='empty'）时为空串。
   */
  cover: string

  /**
   * 候选池（0803）：本资产历次生成中被用户「保留」下来的图。定稿图必定也在池中。
   * 跨层流转只带定稿、不带候选（候选是原始库的生产过程中间物），所以副本的 candidates 通常为空。
   */
  candidates?: Candidate[]

  /**
   * 参考图（0803，本版只做展示与删除，不做「从资产库选」的选择器——下一版再加）。
   * 存图片 url 数组。空壳资产由种子预置好来源资产的定稿图，引导用户点生成。
   */
  referenceImages?: string[]

  /** 参考自哪份资产（可选，用于卡片 / 详情上的「参考自 XX」小标签）。纯展示，不挂任何行为。 */
  referencedFrom?: string

  fields: AssetFields
  tags: string[]        // 本地标签：改了不断链
  voice?: Voice         // 角色音色：1 个；通常随角色走，广场直接复用时可取消；仅角色有
  contributedBy?: string // 广场素材专用：是谁投稿上架的。作者本人可删自己投的；admin 可下架任何一份。种子里的官方素材没有这个字段（只有 admin 能下架）。
  createdAt: number
}


/* ─── 三·五、通知（本期占位）─────────────────────────────────────────
 * 要发通知的事：审核结果、子账号沉淀审批结果。用户主动动作不通知。
 * 本期只做一张"通知大表"，最小实现：谁收到、一句话、读没读。 */
export interface Notification {
  id: string
  toUserId: string     // 收件人
  text: string         // 一句给人看的话
  createdAt: number
  read: boolean
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
  canvases: Canvas[]
  assets: Asset[]
}
