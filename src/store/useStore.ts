/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【状态层】useStore.ts —— 全局唯一真相 + 流转动作
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 装两样东西：world（整份数据）和 currentUserId（现在是谁）。
 * 界面全部渲染为 currentUser 的函数：切账号 = 只改这一个指针 + 重渲染。
 *
 * 【本次新增：流转动作】
 * 这里体现一个重要的分工，值得记住：
 *   · services/assetService.ts 的纯函数负责"算出"那份新资产（不碰任何全局状态）；
 *   · store 负责把算出来的结果"提交"进 world（不可变更新，触发重渲染）。
 * 服务算、store 存，各管一段。将来接真后端时，store 这几个动作里
 * "本地 push 进数组"的那一行，会换成"调后端 API"，其余不动。
 *
 * 另外：所有提交都用不可变写法（新建数组/对象，而不是就地改），
 * 这是 React 能感知到"数据变了、该重渲染了"的前提——新手最常见的坑之一。
 * ─────────────────────────────────────────────────────────────────────── */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { World, User, Asset, AssetRef, AssetStatus, Canvas, Category, FlatImagePayload, Notification, NotificationKind, Voice } from '../data/types'
import { createSeedWorld, IDS, PROMPT_BY_CATEGORY } from '../data/seed'
import { DEMO_ASSETS, DEMO_IDS, DEMO_LOOK_IDS } from '../data/demoProject'
import {
  directReuse,
  favorite,
  reuse,
  deposit,
  materializeDeposit,
  contributeToPlaza,
  materializePlaza,
  removeCandidate,
  setFinal,
  makeCandidate,
  makeId,
  coverOf,
  usableRefUrls,
  wouldCycle,
  AssetRuleError,
  type DepositApplication,
  type PlazaSubmission,
} from '../services/assetService'
import {
  canDirectReuse,
  canFavorite,
  canReuseFromTeam,
  canApproveDeposit,
  canContributeToPlaza,
  canRegenerate,
  canReviewPlaza,
  canRemovePlazaAsset,
  canDeleteLibraryAsset,
  canSeeProjectAssets,
  getTeam,
  isAdmin,
  isListed,
} from '../services/permission'
import {
  saveCanvasNodeToProject,
  teamHasSameName,
  libraryHasSameName,
  plazaHasSameNameBySubmitter,
  type CanvasNode,
  type SaveSpec,
  type SaveOutcome,
} from '../services/canvasService'

/** 「送一张图出去」的入参（0810 · runSendImage）。 */
export interface SendImageInput {
  target: 'team' | 'plaza'
  payload: FlatImagePayload
  /** 从项目库某份资产送出时给上；画布节点 / 本地文件直传时不给。 */
  sourceAssetId?: string
}

/** 流转动作的统一返回：ok + 一句给用户看的话。 */
export interface ActionResult {
  ok: boolean
  message: string
}

/**
 * 演示脚手架：讲解"从无到有"用的三步进度，不参与任何产品规则。
 *   idle      未开始
 *   analyzed  ① 剧本分析完成 —— 8 份空壳已列入，全部只有提示词
 *   generated ② 资产生成完成 —— 基础 6 份已出图定稿，2 份造型已挂上参考图
 *   looked    ③ 批量生成造型完成 —— 2 份造型也已出图定稿
 */
export type DemoStep = 'idle' | 'analyzed' | 'generated' | 'looked'

interface StoreState {
  world: World
  currentUserId: string
  /** 子账号提交的资产存入申请（pending → approved/rejected，由主账号在审批中心处理）。 */
  applications: DepositApplication[]
  /** 广场投稿申请（主账号/子账号发起，pending → approved/rejected，由 admin 审核）。 */
  plazaSubmissions: PlazaSubmission[]
  /** 通知大表（本期占位）：审批结果等发到这里，按 toUserId 分给各账号看。 */
  notifications: Notification[]

  /** 演示脚手架（0805）：只服务于讲解，不参与任何产品规则。仅项目资产库页的「演示」控件用。 */
  demoStep: DemoStep

  setCurrentUser: (id: string) => void
  resetDemo: () => void

  // ── 演示脚手架动作（0805 · 项目资产库左下角「演示」控件）──
  /** ① 剧本分析：idle → analyzed，把 8 份**空壳**灌进 world（只有提示词，无图无参考图）。 */
  runDemoAnalyze: () => ActionResult
  /** ② 资产生成：analyzed → generated，基础 6 份出 4 张候选、首张定稿；造型挂上参考图。 */
  runDemoGenerate: () => ActionResult
  /** ③ 批量生成造型：generated → looked，2 份造型出 4 张候选、首张定稿。 */
  runDemoLooks: () => ActionResult
  /** ↺ 重置演示：→ idle，按 id 过滤掉 DEMO 这一批（不碰音频 /「其他」）。 */
  runDemoReset: () => ActionResult

  // ── 流转动作（点按钮时调用）──
  runDirectReuse: (sourceId: string, targetProjectId: string, includeVoice?: boolean) => ActionResult
  runFavorite: (sourceId: string) => ActionResult
  runReuse: (sourceId: string, targetProjectId: string) => ActionResult
  /**
   * 【0810 · B 主线唯一落点】把一张图送出去（存入团队库 / 贡献广场）。
   * 流转的最小单位是图不是资产：主账号存团队库直接落一份扁平单图，子账号存团队库生成申请，
   * 广场投稿一律进 admin 队列。唯一守门规则是名字不重复（团队库全库查、广场按投稿人查）。
   */
  runSendImage: (input: SendImageInput) => ActionResult

  /**
   * 【入口一 · 本期内核唯一实质扩展】把一个画布成品节点存进项目资产库（技术规划 §2.1）。
   * 子账号在画布上传项目库免审、直接进——不生成任何审批申请（稳定性检查 ⑦）。
   * 来源是团队库/广场时，产出的项目副本自带 masterId 血缘（在 canvasService 里算）。
   */
  runSaveToProject: (node: CanvasNode, projectId: string, spec: SaveSpec) => ActionResult

  // ── 团队资产存入审批（仅主账号）──
  /** 通过一条子账号资产存入申请：把资产写入团队库、申请标记 approved（记录处理人/时间）、给申请人发通知。 */
  approveApplication: (applicationId: string) => ActionResult
  /** 驳回一条子账号资产存入申请：申请标记 rejected、记录理由（选填），随通知发给申请人。团队库不动。 */
  rejectApplication: (applicationId: string, reason?: string) => ActionResult

  // ── 广场投稿（发起走 runSendImage；审核：admin）──
  /** admin 通过广场投稿：把资产上架成广场官方母版（shelfStatus=listed）、回填 resultAssetId、给投稿人发通知。 */
  approvePlazaSubmission: (submissionId: string) => ActionResult
  /** admin 驳回广场投稿：标记 rejected、记录理由（选填），随通知发给投稿人。广场不动。 */
  rejectPlazaSubmission: (submissionId: string, reason?: string) => ActionResult
  /**
   * 作者撤回自己投的广场稿（审核中心改造后语义收窄）：硬删除，把这份从 world 拿掉。
   * admin 请改用「下架」（runDelistPlaza）——下架 ≠ 删除。已被复用出去的副本不受影响。
   */
  runRemovePlaza: (assetId: string) => ActionResult
  /**
   * admin 下架一份广场素材（审核中心改造新增）：不删数据，只写 shelfStatus='delisted' + 理由/时间/操作人。
   * 给投稿人发 plaza_delisted 通知（理由拼进文案）；官方素材（无 contributedBy）不发通知。可再 runRelistPlaza。
   */
  runDelistPlaza: (assetId: string, reason?: string) => ActionResult
  /**
   * admin 重新上架一份已下架的素材（审核中心改造新增）：写回 shelfStatus='listed'、清空下架痕迹，
   * 给投稿人发 plaza_relisted 通知。
   */
  runRelistPlaza: (assetId: string) => ActionResult

  /**
   * 删除一份团队库 / 项目资产库里的资产（详情图片卡片 hover 垃圾桶）。
   * 只把这一份从 world 里拿掉；已被复用/存出去的独立副本 id 不同、不受影响。
   */
  runDeleteAsset: (assetId: string) => ActionResult
  /**
   * 从候选池删一张候选图（详情右栏「已保留」区的删除）。
   * 删非定稿 → 直接移除；删定稿且池中还有别的 → 顶一张上来当定稿。
   * （删定稿且池空的归零判定由详情页按层分流到 clearAssetImages / runDeleteAsset。）
   */
  runRemoveCandidate: (assetId: string, candidateId: string) => ActionResult
  /** 把候选池里的某张设为定稿（换 cover 指向）。 */
  runSetFinal: (assetId: string, candidateId: string) => ActionResult
  /**
   * 把新生成 / 新上传的图并入候选池（0810）。
   * 资产从"没有图"变成"有图"时，本批第一张自动成为定稿——生成 / 上传 / 批量一视同仁；
   * 资产原本已有定稿 → 定稿不动，只是候选池多了几张。
   */
  appendCandidates: (assetId: string, urls: string[]) => ActionResult
  /** 编辑提示词（左栏 textarea 失焦 / 生成时提交）。只改这一份的 prompt。 */
  setPrompt: (assetId: string, prompt: string) => ActionResult
  /**
   * 删一个参考槽（0812，原 removeReferenceImage）。按下标从 references 移除。
   * 两分法的直接收益：移除后不再需要同步第二个平行数组。
   * 移除后打 fields.refsTouched = true（用户手动改过，工作流不再覆盖）。
   */
  removeRef: (assetId: string, index: number) => ActionResult
  /**
   * 用户从素材库挑图（0812）：只能挑已出图的资产的某张图，产出**图级槽**。
   * 用户没有能力创建 pending 槽——由选择器只列成品保证，这里只负责落图级槽。
   * 打 fields.refsTouched = true。
   */
  addImageRefs: (assetId: string, urls: string[]) => ActionResult
  /**
   * 工作流拆剧本时建**资产级槽**（0812）。带 wouldCycle 守卫，成环则拒绝。
   * 系统只填空位、不覆盖用户的决定：资产被用户手动改过（refsTouched）则不再塞。
   */
  addAssetRefs: (assetId: string, targetIds: string[]) => ActionResult
  /**
   * 批量生成（0812 重写）：对选中的空壳资产按依赖拓扑分波生成。
   *   ① 拓扑排序：参考槽指向本批次内其他资产的，排到后面（被参考的先出图）。
   *   ② 分波落地：同一波同时进 generating，1200ms 后统一 → done；波数 = 依赖深度。
   *   ③ 出图源：usableRefUrls[0] → fields.lookUrl（演示替身）→ placeholderUrl。
   * 返回即时结果；各波的 generating / done 跃迁随定时器异步发生。
   */
  batchGenerate: (assetIds: string[], placeholderUrl: string, countPerAsset?: number) => ActionResult
  /**
   * 在项目资产库手动新建一份空壳资产（0808）。
   * 产出形态与剧本分析产出的空壳完全一致：status='empty'、无图、无提示词，
   * 用户进详情页写提示词、加参考图、点生成。
   * 去重走 libraryHasSameName（规则 4：同库同类目名称唯一）。
   * 返回值的 message 在成功时是新资产的 id，供页面直接打开详情页。
   */
  createShellAsset: (projectId: string, category: Category, name: string) => ActionResult
  /**
   * 项目库归零（R1）：删掉资产的最后一张图片时，不删整份，而是清空图片、保留空壳。
   * 资产降级为 status:'empty'，清掉 cover / candidates；name / prompt / referenceImages / voice / masterId / fields / tags 全部保留。
   * 用户之后可到左栏点「生成」把空壳恢复成成品。
   */
  clearAssetImages: (assetId: string) => ActionResult

  /** 把某个账号的通知都标为已读（点开通知面板时调用）。 */
  markNotificationsRead: (userId: string) => void

  // ── 画布（项目下的无限画布草稿台）──
  /** 在项目下新建一张画布，返回新画布 id（供导航直接进入）。 */
  createCanvas: (projectId: string, name?: string) => string
  /** 画布改名（本地元信息，纯展示）。 */
  renameCanvas: (canvasId: string, newName: string) => void
  /** 删除一张画布（画布里的节点是 UI 侧数据，不涉及 world 资产）。 */
  deleteCanvas: (canvasId: string) => void

  /**
   * 改名：名字是本地的，改了不影响母版、也不断链。
   * 去重（v5：库内顶层资产名唯一）：同一个库里若已有别的顶层资产叫这个名字，挡下、提示改名。
   */
  renameAsset: (assetId: string, newName: string) => ActionResult
  /**
   * 设封面（0803）：把某个资产的定稿图换成候选池里的某张图。
   * 只改这一份资产的 cover 字段，别的都不动。（等价于 runSetFinal 的裸操作，供画布等场景直接用。）
   */
  setCover: (assetId: string, coverUrl: string) => void

  /**
   * 设音色：把某个角色的音色换成挑中的预置 / 复刻音色（听觉身份锚点，恒 1 个）。
   * 只改这一份资产的 voice 字段，别的都不动。音色活在 world 里、本期不持久化。
   */
  setVoice: (assetId: string, voice: Voice) => void
  /** 清除音色：把某个角色的音色置空（回到"未设置"态）。 */
  clearVoice: (assetId: string) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      world: createSeedWorld(),
      currentUserId: IDS.sunny,
      applications: [],
      plazaSubmissions: [],
      notifications: [],
      demoStep: 'idle',

      setCurrentUser: (id) => set({ currentUserId: id }),
      resetDemo: () =>
        set({
          world: createSeedWorld(),
          currentUserId: IDS.sunny,
          applications: [],
          plazaSubmissions: [],
          notifications: [],
          demoStep: 'idle',
        }),

      /* ── 演示脚手架：四个动作只改 demoStep 与 world.assets 里 DEMO 这一批，
       *    不走任何权限/业务规则，纯讲解用。定义见 data/demoProject.ts。
       *
       *    ① 剧本分析     8 份全部降级为空壳灌入（只有提示词）
       *    ② 资产生成     基础 6 份恢复完整（4 张候选、首张定稿）+ 造型挂参考图
       *    ③ 批量生成造型 造型 2 份恢复完整（4 张候选、首张定稿）
       *    ↺ 重置         按 id 清掉这一批 + 用户手动新增的生产类资产
       * ── */

      /** 把一份完整定义降级成"只有提示词"的空壳（0812：参考槽原样保留——造型的资产级槽从第一步就带着）。 */
      runDemoAnalyze: () => {
        if (get().demoStep !== 'idle') return fail('剧本已分析过了')
        // 造型的资产级槽此刻指向还没出图的角色/服装（pending 状态），这是对的：
        // 「参考对象还没出图」这个状态本来就只有工作流能造出来（0812 §1）。（幂等：已存在的按 id 跳过。）
        set((s) => {
          const existing = new Set(s.world.assets.map((a) => a.id))
          const incoming: Asset[] = DEMO_ASSETS
            .filter((a) => !existing.has(a.id))
            .map((a) => ({
              ...a,
              status: 'empty' as const,
              cover: '',
              candidates: undefined,
              // references 原样保留（资产级槽从第一步就在，指着还没出图的上游）
            }))
          return { world: { ...s.world, assets: [...s.world.assets, ...incoming] }, demoStep: 'analyzed' }
        })
        return ok(`已拆解剧本，${DEMO_ASSETS.length} 份资产已列入待生成`)
      },

      runDemoGenerate: () => {
        if (get().demoStep !== 'analyzed') return fail('请先完成「剧本分析」')
        // 基础素材：空壳 → 成品，一次落 4 张候选、首张自动定稿。
        // 造型：留待第三步生成（本身仍是空壳）。它的资产级槽会随上游一 done 自动从
        // pending 变 ready——不需要任何"把参考图挂回去"的代码（0812 §5.4）。
        const byId = new Map(DEMO_ASSETS.map((a) => [a.id, a] as const))
        const baseCount = DEMO_ASSETS.length - DEMO_LOOK_IDS.size
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a): Asset => {
              const def = byId.get(a.id)
              if (!def) return a
              if (DEMO_LOOK_IDS.has(def.id)) return a // 造型：原样留空壳，槽自动就位
              if (a.status !== 'empty') return a
              return { ...def } // 完整定义：cover=1.png、candidates=1..4
            }),
          },
          demoStep: 'generated',
        }))
        return ok(`已生成 ${baseCount} 份基础素材`)
      },

      runDemoLooks: () => {
        if (get().demoStep !== 'generated') return fail('请先完成「资产生成」')
        // 造型：空壳 → 成品，同样 4 张候选、首张自动定稿。
        const byId = new Map(DEMO_ASSETS.map((a) => [a.id, a] as const))
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a): Asset => {
              if (!DEMO_LOOK_IDS.has(a.id) || a.status !== 'empty') return a
              const def = byId.get(a.id)
              return def ? { ...def } : a
            }),
          },
          demoStep: 'looked',
        }))
        return ok(`已生成 ${DEMO_LOOK_IDS.size} 份角色造型`)
      },

      runDemoReset: () => {
        // 按 id 过滤掉 DEMO 这一批；音频、「其他」留存物不属于这条线，原样保留。
        // 另外把项目里【手动新增】的生产类资产也一并清掉——它们的 id 不在 DEMO_IDS 里，
        // 不清的话演示每重讲一遍就多留一批「未命名角色」，讲第三遍时库里已经是脏的。
        // 项目的角色/服装/场景/道具四类初始为空（种子只留音频与「其他」），所以整类清掉即可。
        const PRODUCTION: Category[] = ['character', 'costume', 'scene', 'prop']
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.filter(
              (a) =>
                !DEMO_IDS.has(a.id) &&
                !(a.scope === 'project' && a.scopeId === IDS.projDaily && PRODUCTION.includes(a.category)),
            ),
          },
          demoStep: 'idle',
        }))
        return ok('已重置演示，可以重讲一遍')
      },

      /* ── 下面每个动作都是同一个套路：
       *    ① 找到人和资产 → ② 权限守卫 → ③ 调纯函数算结果（可能抛业务错）
       *    → ④ 不可变提交进 world → ⑤ 返回一句话给界面显示。 */

      runDirectReuse: (sourceId, targetProjectId, includeVoice) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        const project = world.projects.find((p) => p.id === targetProjectId)
        if (!user || !source || !project) return fail('数据不存在')
        if (!canDirectReuse(user, project)) return fail('你没有权限在该项目里直接复用')
        // 去重（v5：库内顶层资产名唯一）：目标项目库已有同名则挡下、提示改名。
        if (libraryHasSameName(world.assets, 'project', targetProjectId, source.name)) {
          return fail(`该项目已有同名「${source.name}」，请改名后再复用`)
        }
        try {
          const copy = directReuse(source, targetProjectId, includeVoice)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」直接复用进「${project.name}」（独立副本）`)
        } catch (e) {
          return fromError(e)
        }
      },

      runFavorite: (sourceId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!user.teamId) return fail('当前账号没有团队库')
        if (!canFavorite(user)) return fail('只有主账号能收藏进团队库（子账号请用"直接复用"）')
        // 去重把关（v5 改动1）：写团队库的两条路（收藏 / 存入）都去重。
        // 收藏进团队库前，若团队库已有同名，挡下、提示改名（与 runSendImage 一致）。
        if (teamHasSameName(world.assets, user.teamId, source.name)) {
          return fail(`团队库已有同名「${source.name}」，请改名后再收藏进团队库`)
        }
        try {
          const copy = favorite(source, user.teamId)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已收藏「${source.name}」进团队库（独立副本）`)
        } catch (e) {
          return fromError(e)
        }
      },

      runReuse: (sourceId, targetProjectId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        const project = world.projects.find((p) => p.id === targetProjectId)
        if (!user || !source || !project) return fail('数据不存在')
        if (!canReuseFromTeam(user, project)) return fail('你没有权限把它复用进该项目')
        // 去重（v5：库内顶层资产名唯一）：目标项目库已有同名则挡下、提示改名。
        if (libraryHasSameName(world.assets, 'project', targetProjectId, source.name)) {
          return fail(`该项目已有同名「${source.name}」，请改名后再复用`)
        }
        try {
          const copy = reuse(source, targetProjectId)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」复用进「${project.name}」（独立副本）`)
        } catch (e) {
          return fromError(e)
        }
      },

      runSendImage: (input) => {
        const { world, currentUserId } = get()
        const { target, payload, sourceAssetId } = input
        const user = findUser(world, currentUserId)
        if (!user) return fail('数据不存在')
        // ② admin 不参与创作与流转。
        if (isAdmin(user)) return fail('管理员只治理，不参与创作与流转')
        // ③ 名字不能为空。
        const name = payload.name.trim()
        if (!name) return fail('请先给这张素材起个名字')
        const src = sourceAssetId ? findAsset(world, sourceAssetId) : undefined

        // ④ 唯一的守门规则：重名校验（团队库全库查、广场按投稿人查）。
        if (target === 'team') {
          if (!user.teamId) return fail('当前账号没有团队库')
          if (libraryHasSameName(world.assets, 'team', user.teamId, name)) {
            return fail(`团队库已有同名「${name}」，请换个名字`)
          }
        } else {
          if (plazaHasSameNameBySubmitter(world.assets, user.id, name)) {
            return fail(`你已经投过同名的「${name}」，请换个名字`)
          }
          // ⑤ 广场发起层校验：子账号只能从项目库发起（无源资产=画布直传，算项目上下文）。
          const scope = src?.scope ?? 'project'
          if (!canContributeToPlaza(user, { scope } as Asset)) {
            return fail('你没有权限在这一层向广场投稿')
          }
        }

        try {
          if (target === 'team') {
            const res = deposit(payload, user.teamId!, user, { assetId: sourceAssetId, scopeId: src?.scopeId })
            if (res.kind === 'asset') {
              set((s) => ({ world: addAsset(s.world, res.asset) }))
              return ok(`已把「${name}」存入团队资产库`)
            }
            // 子账号：登记一条待审批申请，不直接写团队库；额外知会主账号。
            set((s) => ({
              applications: [...s.applications, res],
              notifications: user.parentId
                ? [
                    ...s.notifications,
                    makeNotification(
                      user.parentId,
                      'deposit_submitted',
                      `${user.name} 提交了素材「${name}」的存入申请，待你审批`,
                      '#/team/deposits',
                    ),
                  ]
                : s.notifications,
            }))
            return ok(`已提交「${name}」的存入申请，待主账号审批`)
          }
          // 广场投稿：一律进 admin 队列；子账号投稿额外知会主账号（不拦截）。
          const submission = contributeToPlaza(payload, user, {
            assetId: sourceAssetId,
            scope: src?.scope === 'team' || src?.scope === 'project' ? src.scope : undefined,
            scopeId: src?.scopeId,
          })
          set((s) => ({
            plazaSubmissions: [...s.plazaSubmissions, submission],
            notifications: user.parentId
              ? [
                  ...s.notifications,
                  makeNotification(
                    user.parentId,
                    'plaza_submit_notice',
                    `${user.name} 把素材「${name}」投稿到了素材广场（知会，未拦截）`,
                  ),
                ]
              : s.notifications,
          }))
          return ok(`已提交「${name}」的广场投稿，待审核`)
        } catch (e) {
          return fromError(e)
        }
      },

      runSaveToProject: (node, projectId, spec) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const project = world.projects.find((p) => p.id === projectId)
        if (!user || !project) return fail('数据不存在')
        const team = getTeam(world, project.teamId)
        if (!team) return fail('项目所属团队不存在')
        // 得能进这个项目才能往它的库里上传（子账号免审直接进，但仍要有项目权限）。
        if (!canSeeProjectAssets(user, project, team)) return fail('你没有权限进入该项目，无法上传')
        try {
          const outcome = saveCanvasNodeToProject(node, projectId, spec)
          // 去重（v5：库内顶层资产名唯一）：新建一份顶层资产（角色/服装/场景/道具/音频）才查；
          // 关联到已有资产（link）不查——挂上去的是子资产、天然豁免。
          if (outcome.kind === 'add' && libraryHasSameName(world.assets, 'project', projectId, outcome.asset.name)) {
            return fail(`该项目已有同名「${outcome.asset.name}」，请改名后再上传`)
          }
          set((s) => ({ world: applySaveOutcome(s.world, outcome) }))
          return ok(saveMessage(outcome))
        } catch (e) {
          return fromError(e)
        }
      },

      approveApplication: (applicationId) => {
        const { world, currentUserId, applications } = get()
        const approver = findUser(world, currentUserId)
        const appl = applications.find((a) => a.id === applicationId)
        if (!approver || !appl) return fail('数据不存在')
        if (appl.status !== 'pending') return fail('这条申请已经处理过了')
        const applicant = findUser(world, appl.applicantId)
        if (!applicant) return fail('申请人不存在')
        if (!canApproveDeposit(approver, applicant)) return fail('只有该子账号的主账号能审批')
        // 0810：不再回查源资产，直接用申请携带的快照落库。
        // 落库前做第二次重名校验（在途期间团队库可能已经多了一个同名的）。
        if (libraryHasSameName(world.assets, 'team', appl.toTeamId, appl.payload.name)) {
          return fail(`团队库已有同名「${appl.payload.name}」，请让申请人改名后重新提交`)
        }
        try {
          // 复用同一处"入库"实现，保证审批通过和主账号直接存入行为一致
          const master = materializeDeposit(appl.payload, appl.toTeamId)
          set((s) => ({
            world: addAsset(s.world, master),
            applications: s.applications.map((a) =>
              a.id === applicationId
                ? { ...a, status: 'approved' as const, reviewedBy: approver.id, reviewedAt: Date.now() }
                : a,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(appl.applicantId, 'deposit_approved', `你的「${appl.payload.name}」素材存入申请已通过，已进团队库`),
            ],
          }))
          return ok(`已通过「${appl.payload.name}」的存入申请，写入团队库`)
        } catch (e) {
          return fromError(e)
        }
      },

      rejectApplication: (applicationId, reason) => {
        const { world, currentUserId, applications } = get()
        const approver = findUser(world, currentUserId)
        const appl = applications.find((a) => a.id === applicationId)
        if (!approver || !appl) return fail('数据不存在')
        if (appl.status !== 'pending') return fail('这条申请已经处理过了')
        const applicant = findUser(world, appl.applicantId)
        if (!applicant) return fail('申请人不存在')
        if (!canApproveDeposit(approver, applicant)) return fail('只有该子账号的主账号能审批')
        set((s) => ({
          applications: s.applications.map((a) =>
            a.id === applicationId
              ? { ...a, status: 'rejected' as const, reviewedBy: approver.id, reviewedAt: Date.now(), reason }
              : a,
          ),
          notifications: [
            ...s.notifications,
            makeNotification(
              appl.applicantId,
              'deposit_rejected',
              `你的「${appl.payload.name}」素材存入申请被驳回${reason ? `：${reason}` : ''}`,
            ),
          ],
        }))
        return ok(`已驳回「${appl.payload.name}」的存入申请`)
      },

      approvePlazaSubmission: (submissionId) => {
        const { world, currentUserId, plazaSubmissions } = get()
        const reviewer = findUser(world, currentUserId)
        const sub = plazaSubmissions.find((x) => x.id === submissionId)
        if (!reviewer || !sub) return fail('数据不存在')
        if (!canReviewPlaza(reviewer)) return fail('只有 admin 能审核广场投稿')
        if (sub.status !== 'pending') return fail('这条投稿已经处理过了')
        // 0810：不再回查源资产，直接用投稿携带的快照上架；落库前再按投稿人维度查一次重名。
        if (plazaHasSameNameBySubmitter(world.assets, sub.submitterId, sub.payload.name)) {
          return fail(`该投稿人已有同名素材「${sub.payload.name}」，请驳回并让其改名`)
        }
        try {
          // 上架时显式打上 shelfStatus='listed'，并把生成的广场资产 id 回填给投稿记录，
          // 让审核中心列表能把「投稿记录」和「已上架资产」对上号、不重复出行。
          const master = { ...materializePlaza(sub.payload, sub.submitterId), shelfStatus: 'listed' as const }
          set((s) => ({
            world: addAsset(s.world, master),
            plazaSubmissions: s.plazaSubmissions.map((x) =>
              x.id === submissionId
                ? { ...x, status: 'approved' as const, reviewedBy: reviewer.id, reviewedAt: Date.now(), resultAssetId: master.id }
                : x,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(sub.submitterId, 'plaza_approved', `你投稿的「${sub.payload.name}」已通过 admin 审核，已上架素材广场`),
            ],
          }))
          return ok(`已通过「${sub.payload.name}」的广场投稿，已上架`)
        } catch (e) {
          return fromError(e)
        }
      },

      rejectPlazaSubmission: (submissionId, reason) => {
        const { world, currentUserId, plazaSubmissions } = get()
        const reviewer = findUser(world, currentUserId)
        const sub = plazaSubmissions.find((x) => x.id === submissionId)
        if (!reviewer || !sub) return fail('数据不存在')
        if (!canReviewPlaza(reviewer)) return fail('只有 admin 能审核广场投稿')
        if (sub.status !== 'pending') return fail('这条投稿已经处理过了')
        set((s) => ({
          plazaSubmissions: s.plazaSubmissions.map((x) =>
            x.id === submissionId
              ? { ...x, status: 'rejected' as const, reviewedBy: reviewer.id, reviewedAt: Date.now(), reason }
              : x,
          ),
          notifications: [
            ...s.notifications,
            makeNotification(
              sub.submitterId,
              'plaza_rejected',
              `你投稿的「${sub.payload.name}」被 admin 驳回${reason ? `：${reason}` : ''}`,
            ),
          ],
        }))
        return ok(`已驳回「${sub.payload.name}」的广场投稿`)
      },

      runRemovePlaza: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (asset.scope !== 'plaza') return fail('只有广场素材才谈得上撤稿 / 下架')
        // 审核中心改造：admin 走「下架」（打状态位、可重新上架），不再硬删；硬删只留给作者撤自己的稿。
        if (isAdmin(user)) return fail('管理员请用「下架」，不要直接删除')
        if (!canRemovePlazaAsset(user, asset)) return fail('你没有权限移除这份广场素材')
        set((s) => ({
          // 只把广场这份拿掉；已被复用/收藏出去的独立副本 id 不同，不受影响
          world: { ...s.world, assets: s.world.assets.filter((a) => a.id !== assetId) },
        }))
        return ok(`已撤回「${asset.name}」的投稿（已复用出去的副本不受影响）`)
      },

      runDelistPlaza: (assetId, reason) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (asset.scope !== 'plaza') return fail('只有广场素材才谈得上下架')
        if (!isAdmin(user)) return fail('只有平台管理员能下架广场素材')
        if (!isListed(asset)) return fail('这份素材已经是下架状态')
        // 下架别人投的 → 通知投稿人（理由拼进文案）；官方素材（无投稿人）不发通知。
        const notifyContributor = !!asset.contributedBy
        set((s) => ({
          // 不删数据，只打状态位 + 记录理由/时间/操作人。数据留着，才能重新上架。
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? { ...a, shelfStatus: 'delisted' as const, delistedReason: reason, delistedAt: Date.now(), delistedBy: user.id }
                : a,
            ),
          },
          notifications: notifyContributor
            ? [
                ...s.notifications,
                makeNotification(
                  asset.contributedBy!,
                  'plaza_delisted',
                  `你投稿的「${asset.name}」已被 admin 下架${reason ? `：${reason}` : ''}`,
                ),
              ]
            : s.notifications,
        }))
        return ok(`已下架「${asset.name}」（数据保留，可重新上架）`)
      },

      runRelistPlaza: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (asset.scope !== 'plaza') return fail('只有广场素材才谈得上重新上架')
        if (!isAdmin(user)) return fail('只有平台管理员能重新上架')
        if (isListed(asset)) return fail('这份素材已经在架上')
        const notifyContributor = !!asset.contributedBy
        set((s) => ({
          // 写回在架、清空下架痕迹。
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? { ...a, shelfStatus: 'listed' as const, delistedReason: undefined, delistedAt: undefined, delistedBy: undefined }
                : a,
            ),
          },
          notifications: notifyContributor
            ? [
                ...s.notifications,
                makeNotification(asset.contributedBy!, 'plaza_relisted', `你投稿的「${asset.name}」已被重新上架`),
              ]
            : s.notifications,
        }))
        return ok(`已重新上架「${asset.name}」`)
      },

      runDeleteAsset: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限删除这份资产')

        set((s) => ({
          // 只把这一份拿掉；已被复用/存出去的独立副本 id 不同，不受影响
          world: { ...s.world, assets: s.world.assets.filter((a) => a.id !== assetId) },
        }))
        return ok(`已删除「${asset.name}」（已复用出去的副本不受影响）`)
      },

      runRemoveCandidate: (assetId, candidateId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限删除这张图片')
        try {
          const next = removeCandidate(asset, candidateId)
          set((s) => ({
            world: {
              ...s.world,
              assets: s.world.assets.map((a) => (a.id === assetId ? next : a)),
            },
          }))
          return ok('已删除该图片')
        } catch (e) {
          return fromError(e)
        }
      },

      runSetFinal: (assetId, candidateId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限修改这份资产')
        try {
          const next = setFinal(asset, candidateId)
          set((s) => ({
            world: {
              ...s.world,
              assets: s.world.assets.map((a) => (a.id === assetId ? next : a)),
            },
          }))
          return ok('已设为定稿')
        } catch (e) {
          return fromError(e)
        }
      },

      appendCandidates: (assetId, urls) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限往这份资产生成图片')
        if (urls.length === 0) return fail('没有可生成的图片')
        const added = urls.map((u) => makeCandidate(u, asset.prompt))
        // 0810：任何时候资产从"没有图"变成"有图"，本批第一张自动成为定稿。
        // 生成 / 上传 / 批量，一视同仁——不再区分张数、不再区分是不是用户主动放进来的。
        const autoFinal = !asset.cover
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => {
              if (a.id !== assetId) return a
              const candidates = [...(a.candidates ?? []), ...added]
              return {
                ...a,
                candidates,
                cover: autoFinal ? added[0].url : a.cover,
                status: 'done' as AssetStatus, // ← 有图必成品
              }
            }),
          },
        }))
        return ok(autoFinal ? `已生成 ${added.length} 张，第一张已设为定稿` : `已生成 ${added.length} 张`)
      },

      setPrompt: (assetId, prompt) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限编辑这份资产的提示词')
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, prompt } : a)),
          },
        }))
        return ok('提示词已更新')
      },

      removeRef: (assetId, index) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限编辑这份资产的参考图')
        const refs = asset.references ?? []
        if (index < 0 || index >= refs.length) return fail('参考图不存在')
        const next = refs.filter((_, i) => i !== index)
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    references: next.length ? next : undefined,
                    // 用户手动改过参考槽 → 打标，工作流不再覆盖（系统只填空位）。
                    fields: { ...a.fields, refsTouched: true },
                  }
                : a,
            ),
          },
        }))
        return ok('已移除参考图')
      },

      addImageRefs: (assetId, urls) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限编辑这份资产的参考图')
        if (urls.length === 0) return fail('没有可添加的参考图')
        const refs = asset.references ?? []
        // 去重 + 归一化：候选池的 url 带 ?g=N 后缀、图级槽存裸地址，同一张图不能以两个身份进来。
        const bare = (u: string) => u.split('?')[0]
        const seen = new Set(refs.filter((r) => r.kind === 'image').map((r) => bare((r as { url: string }).url)))
        const fresh: string[] = []
        for (const u of urls) {
          const k = bare(u)
          if (seen.has(k)) continue
          seen.add(k)
          fresh.push(k)
        }
        if (fresh.length === 0) return fail('这张已经在参考图里了')
        const nextRefs: AssetRef[] = [...refs, ...fresh.map((u) => ({ kind: 'image' as const, url: u }))]
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? { ...a, references: nextRefs, fields: { ...a.fields, refsTouched: true } }
                : a,
            ),
          },
        }))
        return ok(`已添加 ${fresh.length} 张参考图`)
      },

      addAssetRefs: (assetId, targetIds) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        // 系统只填空位、不覆盖用户的决定：用户手动改过就不再塞（0812 §5.3）。
        if (asset.fields?.refsTouched) return fail('用户已手动调整过参考，工作流不再覆盖')
        const refs = asset.references ?? []
        const existing = new Set(refs.filter((r) => r.kind === 'asset').map((r) => (r as { assetId: string }).assetId))
        const fresh: string[] = []
        for (const t of targetIds) {
          if (t === assetId || existing.has(t)) continue
          // 加槽前跑环检测：a 参考 t 会不会成环。
          if (wouldCycle(world, assetId, t)) return fail('不能互相参考（会形成环）')
          existing.add(t)
          fresh.push(t)
        }
        if (fresh.length === 0) return fail('没有可添加的参考')
        const nextRefs: AssetRef[] = [...refs, ...fresh.map((id) => ({ kind: 'asset' as const, assetId: id }))]
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, references: nextRefs } : a)),
          },
        }))
        return ok(`已添加 ${fresh.length} 个参考`)
      },

      batchGenerate: (assetIds, placeholderUrl, countPerAsset = 1) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        if (!user) return fail('数据不存在')
        const idSet = new Set(assetIds)
        // 只处理：有权生成、且还没出图（空壳）的资产。有图的、无权的都算跳过。
        const targets = world.assets.filter(
          (a) => idSet.has(a.id) && canRegenerate(user, a) && a.status === 'empty',
        )
        const skipped = assetIds.filter((id) => !targets.some((t) => t.id === id)).length
        if (targets.length === 0) return fail('没有可生成的资产')

        // ① 拓扑排序：只看本批次内的资产级依赖，算出每份的依赖深度（波号）。
        const inBatch = new Set(targets.map((a) => a.id))
        const depthCache = new Map<string, number>()
        const visiting = new Set<string>()
        let cyclic = false
        const depthOf = (id: string): number => {
          if (depthCache.has(id)) return depthCache.get(id)!
          if (visiting.has(id)) { cyclic = true; return 0 } // 环：兜底（加槽时已挡环，这里只兜底）
          visiting.add(id)
          const a = world.assets.find((x) => x.id === id)
          let d = 0
          for (const ref of a?.references ?? []) {
            if (ref.kind === 'asset' && inBatch.has(ref.assetId)) d = Math.max(d, depthOf(ref.assetId) + 1)
          }
          visiting.delete(id)
          depthCache.set(id, d)
          return d
        }
        const waves: string[][] = []
        for (const a of targets) {
          const d = cyclic ? 0 : depthOf(a.id)
          ;(waves[d] ??= []).push(a.id)
        }
        if (cyclic) console.warn('batchGenerate: 参考槽在本批次内成环，按原顺序降级处理')

        // ② 分波落地：每波先进 generating，1200ms 后统一 → done，再触发下一波。
        //    下一波开始时上一波已 done，下游 usableRefUrls 拿得到真实参考图。
        let seq = 0
        const runWave = (i: number) => {
          const wave = waves[i]
          if (!wave) return
          const ids = new Set(wave)
          set((s) => ({
            world: {
              ...s.world,
              assets: s.world.assets.map((a) =>
                ids.has(a.id) ? { ...a, status: 'generating' as AssetStatus } : a,
              ),
            },
          }))
          setTimeout(() => {
            set((s) => ({
              world: {
                ...s.world,
                assets: s.world.assets.map((a): Asset => {
                  if (!ids.has(a.id)) return a
                  // ③ 出图源：真实参考图优先于演示替身（0812 §5.1）。此刻读最新 world。
                  const usable = usableRefUrls(s.world, a)[0]
                  const look = typeof a.fields?.lookUrl === 'string' ? a.fields.lookUrl : undefined
                  const src = (usable ?? look ?? placeholderUrl).split('?')[0]
                  const cands = Array.from({ length: countPerAsset }, () =>
                    makeCandidate(`${src}?g=${++seq}`, a.prompt),
                  )
                  // 空壳原本无定稿，本批第一张自动成为定稿（0810：有图必成品）。
                  return {
                    ...a,
                    candidates: [...(a.candidates ?? []), ...cands],
                    cover: cands[0].url,
                    status: 'done' as AssetStatus,
                  }
                }),
              },
            }))
            runWave(i + 1)
          }, 1200)
        }
        runWave(0)

        return ok(`已开始生成 ${targets.length} 份资产${skipped ? `（跳过 ${skipped} 份）` : ''}`)
      },

      createShellAsset: (projectId, category, name) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const project = world.projects.find((p) => p.id === projectId)
        if (!user || !project) return fail('数据不存在')
        if (!canDirectReuse(user, project)) return fail('你没有权限在这个项目里新建资产')
        if (category === 'other' || category === 'audio') return fail('这个类目不支持手动新建')
        const nm = name.trim()
        if (!nm) return fail('名字不能为空')
        if (libraryHasSameName(world.assets, 'project', projectId, nm)) {
          return fail(`该项目已有「${nm}」，请换个名字`)
        }
        const id = makeId('asset')
        const asset: Asset = {
          id, category, name: nm, scope: 'project', scopeId: projectId,
          // 0812：灌按类目的兜底提示词，与剧本拆出来的资产完全一致。有了兜底，批量生成
          // 就不必再处理"提示词为空"这个分支，§2 的判据才能真的只剩一句话。
          status: 'empty', cover: '', prompt: PROMPT_BY_CATEGORY[category], fields: {}, tags: [],
          createdAt: Date.now(),
        }
        set((s) => ({ world: { ...s.world, assets: [...s.world.assets, asset] } }))
        return { ok: true, message: id }
      },

      clearAssetImages: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限清空这份资产')
        // 不可变降级为空壳：只清图片相关字段（cover / candidates），其余（name/prompt/referenceImages/voice/masterId/fields/tags）原样保留。
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? { ...a, status: 'empty' as const, cover: '', candidates: undefined }
                : a,
            ),
          },
        }))
        return ok('已清空图片，提示词已保留，可随时重新生成')
      },

      markNotificationsRead: (userId) => {
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.toUserId === userId ? { ...n, read: true } : n,
          ),
        }))
      },

      createCanvas: (projectId, name) => {
        const id = `cv_${_canvasSeq++}`
        const project = get().world.projects.find((p) => p.id === projectId)
        const canvas: Canvas = {
          id,
          projectId,
          name: name?.trim() || '未命名画布',
          cover: project?.cover ?? '',
          createdAt: Date.now(),
        }
        set((s) => ({ world: { ...s.world, canvases: [...s.world.canvases, canvas] } }))
        return id
      },

      renameCanvas: (canvasId, newName) => {
        const name = newName.trim()
        if (!name) return
        set((s) => ({
          world: {
            ...s.world,
            canvases: s.world.canvases.map((c) => (c.id === canvasId ? { ...c, name } : c)),
          },
        }))
      },

      deleteCanvas: (canvasId) => {
        set((s) => ({
          world: { ...s.world, canvases: s.world.canvases.filter((c) => c.id !== canvasId) },
        }))
      },

      renameAsset: (assetId, newName) => {
        const { world } = get()
        const asset = findAsset(world, assetId)
        if (!asset) return fail('数据不存在')
        const name = newName.trim()
        if (!name) return fail('名字不能为空')
        // 去重（v5：库内顶层资产名唯一）：在这份资产所在的库（它自己的 scope+scopeId）里，
        // 除它自己外若已有同名顶层资产，挡下、提示改名。跨库/跨项目允许重名。
        if (
          (asset.scope === 'project' || asset.scope === 'team') &&
          asset.scopeId &&
          libraryHasSameName(world.assets, asset.scope, asset.scopeId, name, assetId)
        ) {
          return fail(`该库已有「${name}」，请改名后再用这个名字`)
        }
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, name } : a)),
          },
        }))
        return ok(`已改名为「${name}」`)
      },

      setCover: (assetId, coverUrl) => {
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, cover: coverUrl } : a)),
          },
        }))
      },

      setVoice: (assetId, voice) => {
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, voice } : a)),
          },
        }))
      },

      clearVoice: (assetId) => {
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId ? { ...a, voice: undefined } : a,
            ),
          },
        }))
      },
    }),
    {
      name: 'phanty-demo-v1',
      partialize: (state) => ({ currentUserId: state.currentUserId }),
      /**
       * generating 是瞬态（0812 §5.1）：若 world 被持久化，刷新页面后所有 generating 会
       * 永久冻在那里。这里把它们打回空壳兜底。当前 partialize 不持久化 world，本守卫暂时
       * 空转，但语义摆在这里——一旦以后把 world 纳入持久化，就不会变成必现 bug。
       */
      onRehydrateStorage: () => (state) => {
        if (!state?.world) return
        if (!state.world.assets.some((a) => a.status === 'generating')) return
        state.world = {
          ...state.world,
          assets: state.world.assets.map((a) =>
            a.status === 'generating'
              ? { ...a, status: 'empty' as AssetStatus, cover: '', candidates: undefined }
              : a,
          ),
        }
      },
    },
  ),
)

/* ─── 派生 hook：直接拿到当前用户 ─── */
export function useCurrentUser(): User {
  const world = useStore((s) => s.world)
  const currentUserId = useStore((s) => s.currentUserId)
  return world.users.find((u) => u.id === currentUserId) ?? world.users[0]
}

/* ─── 审核中心 · 派生 selector（审核中心改造）────────────────────────────
 * 页面不该关心「一条审核记录在数据里到底是哪种东西」，这两个纯函数把差异碾平成统一行。 */

/**
 * 审核中心「素材」Tab 的一行。
 *
 * 为什么要专门造这个形状：admin 眼里的一条「素材审核记录」，
 * 在数据里其实可能是两种东西之一——
 *   · 还没过审 / 被驳回的：一条 PlazaSubmission（世界里还没有对应的广场资产）
 *   · 已上架 / 已下架的：一份 scope==='plaza' 的 Asset
 * 种子里的官方素材更特殊：只有 Asset，压根没走过投稿流程。
 * 页面不该关心这些差别，所以在这里把三种情况碾平成同一行。
 */
export interface PlazaReviewRow {
  key: string
  assetId?: string        // 已上架 / 已下架时有
  submissionId?: string   // 走过投稿流程的才有；官方素材没有
  name: string
  cover: string
  category: Category
  submitterName: string   // 无投稿人时显示「官方」
  fromLabel: string       // '团队资产库' / 项目名 / '官方'
  createdAt: number
  status: 'pending' | 'listed' | 'delisted' | 'rejected'
  reason?: string         // 驳回或下架的理由
}

export function selectPlazaReviewRows(state: StoreState): PlazaReviewRow[] {
  const { world, plazaSubmissions } = state
  const userName = (id: string) => world.users.find((u) => u.id === id)?.name ?? id
  const fromLabelOf = (fromScope: 'team' | 'project' | undefined, fromScopeId?: string) =>
    fromScope === 'team' ? '团队资产库'
      : fromScope === 'project' ? world.projects.find((p) => p.id === fromScopeId)?.name ?? '某项目'
        : '—'

  const rows: PlazaReviewRow[] = []

  // ① 还没过审 / 被驳回的投稿：世界里还没有对应的广场资产，从投稿记录出行。
  //    已通过（approved）的不在这里出——它对应的资产已经在 world.assets 里，会从 ② 出行，否则重复。
  //    0810：投稿携带图片快照，名字 / 封面 / 类目直接读 payload，不再回查源资产。
  for (const s of plazaSubmissions) {
    if (s.status === 'approved') continue
    rows.push({
      key: `sub_${s.id}`,
      submissionId: s.id,
      assetId: s.sourceAssetId,
      name: s.payload.name,
      cover: s.payload.url,
      category: s.payload.category,
      submitterName: userName(s.submitterId),
      fromLabel: fromLabelOf(s.fromScope, s.fromScopeId),
      createdAt: s.createdAt,
      status: s.status === 'rejected' ? 'rejected' : 'pending',
      reason: s.reason,
    })
  }

  // ② 每一份 scope==='plaza' 的资产出行；反查投稿人（resultAssetId 对上号），查不到就是官方素材。
  for (const a of world.assets) {
    if (a.scope !== 'plaza') continue
    const sub = plazaSubmissions.find((s) => s.resultAssetId === a.id)
    rows.push({
      key: `asset_${a.id}`,
      assetId: a.id,
      submissionId: sub?.id,
      name: a.name,
      cover: coverOf(a),
      category: a.category,
      submitterName: sub ? userName(sub.submitterId) : a.contributedBy ? userName(a.contributedBy) : '官方',
      fromLabel: sub ? fromLabelOf(sub.fromScope, sub.fromScopeId) : '官方',
      createdAt: a.createdAt,
      status: isListed(a) ? 'listed' : 'delisted',
      reason: isListed(a) ? undefined : a.delistedReason,
    })
  }

  return rows.sort((x, y) => y.createdAt - x.createdAt)
}

/**
 * 审核中心「资产存入申请」Tab 的一行（主账号视角）。
 * 把原来内联在页面里的过滤（申请人是我名下子账号）+ 反查封面搬到这里，页面只管渲染。
 */
export interface DepositReviewRow {
  id: string
  assetId: string
  name: string
  cover: string
  applicantName: string
  fromLabel: string       // 来自哪个项目
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
}

export function selectDepositRows(state: StoreState): DepositReviewRow[] {
  const { world, applications, currentUserId } = state
  const me = world.users.find((u) => u.id === currentUserId)
  if (!me) return []
  const userName = (id: string) => world.users.find((u) => u.id === id)?.name ?? id
  const projName = (id?: string) => world.projects.find((p) => p.id === id)?.name ?? '未知项目'
  return applications
    .filter((a) => world.users.find((u) => u.id === a.applicantId)?.parentId === me.id)
    .map((a) => {
      return {
        id: a.id,
        assetId: a.sourceAssetId ?? '',
        name: a.payload.name,
        cover: a.payload.url,
        applicantName: userName(a.applicantId),
        fromLabel: projName(a.fromScopeId),
        createdAt: a.createdAt,
        status: a.status,
        reason: a.reason,
      }
    })
    .sort((x, y) => y.createdAt - x.createdAt)
}

/* ─── 一些内部小工具（不导出）─── */

function findUser(world: World, id: string): User | undefined {
  return world.users.find((u) => u.id === id)
}
function findAsset(world: World, id: string): Asset | undefined {
  return world.assets.find((a) => a.id === id)
}
/** 不可变地往 world 里加一份资产（返回新的 world）。 */
function addAsset(world: World, asset: Asset): World {
  return { ...world, assets: [...world.assets, asset] }
}
/** 入口一：把画布上传的产出意图不可变地提交进 world（新建顶层 / 追加候选到已有资产）。 */
function applySaveOutcome(world: World, outcome: SaveOutcome): World {
  switch (outcome.kind) {
    case 'add':
      return addAsset(world, outcome.asset)
    case 'link':
      return {
        ...world,
        assets: world.assets.map((a) =>
          a.id === outcome.parentId
            ? { ...a, candidates: [...(a.candidates ?? []), outcome.candidate] }
            : a,
        ),
      }
  }
}
/** 给入口一的结果配一句给用户看的话。 */
function saveMessage(outcome: SaveOutcome): string {
  switch (outcome.kind) {
    case 'add':
      return `已上传「${outcome.asset.name}」到项目资产库`
    case 'link':
      return '已把这张图追加到已有资产的候选池'
  }
}
/** 新建画布的自增 id 计数器（够 Demo 用且可预测）。 */
let _canvasSeq = 1
/** 造一条通知（自增 id，够 Demo 用且可预测）。审核中心改造：带上 kind（分类）与可选 link（点击跳转）。 */
let _notiSeq = 1
function makeNotification(
  toUserId: string,
  kind: NotificationKind,
  text: string,
  link?: string,
): Notification {
  return { id: `noti_${_notiSeq++}`, toUserId, kind, text, link, createdAt: Date.now(), read: false }
}
function ok(message: string): ActionResult {
  return { ok: true, message }
}
function fail(message: string): ActionResult {
  return { ok: false, message }
}
/** 把 assetService 抛出的业务错误，转成给用户看的一句话。 */
function fromError(e: unknown): ActionResult {
  if (e instanceof AssetRuleError) return fail(e.message)
  return fail('操作失败')
}
