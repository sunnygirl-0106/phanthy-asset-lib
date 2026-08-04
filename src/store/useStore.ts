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
import type { World, User, Asset, AssetStatus, Canvas, Category, Notification, NotificationKind, Voice } from '../data/types'
import { createSeedWorld, IDS, DEMO_NEON_ASSETS, DEMO_NEON_IDS } from '../data/seed'
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
  unsetFinal,
  withSelfReference,
  makeCandidate,
  makeId,
  coverOf,
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
  depositMode,
} from '../services/permission'
import {
  saveCanvasNodeToProject,
  teamHasSameName,
  libraryHasSameName,
  type CanvasNode,
  type SaveSpec,
  type SaveOutcome,
} from '../services/canvasService'

/** 流转动作的统一返回：ok + 一句给用户看的话。 */
export interface ActionResult {
  ok: boolean
  message: string
}

/** 演示脚手架（0805）：讲解"从无到有"用的两步进度，不参与任何产品规则。 */
export type DemoStep = 'idle' | 'analyzed' | 'generated'

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
  /** ① 剧本分析：idle → analyzed，不动 world（页面内容不变），只推进演示进度。 */
  runDemoAnalyze: () => ActionResult
  /** ② 资产生成：analyzed → generated，把 DEMO_NEON_ASSETS 灌进 world.assets。 */
  runDemoGenerate: () => ActionResult
  /** ↺ 重置演示：→ idle，按 id 过滤掉 DEMO_NEON_ASSETS（不碰音频 /「其他」/别的项目）。 */
  runDemoReset: () => ActionResult

  // ── 流转动作（点按钮时调用）──
  runDirectReuse: (sourceId: string, targetProjectId: string, includeVoice?: boolean) => ActionResult
  runFavorite: (sourceId: string) => ActionResult
  runReuse: (sourceId: string, targetProjectId: string) => ActionResult
  runDeposit: (sourceId: string) => ActionResult

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

  // ── 广场投稿（发起：主账号/子账号；审核：admin）──
  /** 发起广场投稿：把自己团队库/项目里的成品资产提交到 admin 审核队列（只带定稿图）。 */
  runContribute: (sourceId: string) => ActionResult
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
  /** 把候选池里的某张设为定稿。 */
  runSetFinal: (assetId: string, candidateId: string) => ActionResult
  /** 取消定稿：资产退回待定稿（图都还在池子里），撤回"可被引用"的授权。 */
  runUnsetFinal: (assetId: string) => ActionResult
  /**
   * 把新生成 / 新上传的图并入候选池（0807：不再有"保留选中"这道人工关卡）。
   * 资产原本没有定稿（空壳 / 待定稿）→ status 变 'pending'，等用户在预览台点「设为定稿」。
   * 资产原本已有定稿 → 定稿不动，只是候选池多了几张。
   * allowAutoFinal（默认 true）：只有"系统生成"才享受 0808 的"1 张自动定稿"；
   *   用户主动上传本地图应传 false——那是探索行为，定稿权留给用户，不代他拍板。
   */
  appendCandidates: (assetId: string, urls: string[], allowAutoFinal?: boolean) => ActionResult
  /** 编辑提示词（左栏 textarea 失焦 / 生成时提交）。只改这一份的 prompt。 */
  setPrompt: (assetId: string, prompt: string) => ActionResult
  /**
   * 删一张参考图（详情左栏参考图区的 ✕）。按下标移除 referenceImages，
   * 并同步删掉对应下标的 referenceLabels（0804 · 规则 16，下标对齐）。
   */
  removeReferenceImage: (assetId: string, index: number) => ActionResult
  /**
   * 追加参考图（0804 · 参考图选择器）：把选中的图并入 referenceImages + referenceLabels。
   * items 每项自带 url 与 label（从素材库选：按类目推「素模/服装/参考」；上传临时：'临时'）。
   * referencedFrom 原来为空时才写第一个来源，别覆盖已有血缘。守卫同 removeReferenceImage（canRegenerate）。
   */
  addReferenceImages: (
    assetId: string,
    items: { url: string; label: string }[],
    referencedFrom?: string,
  ) => ActionResult
  /**
   * 批量生成：对选中的空壳 / 待定稿资产各生成 countPerAsset 张（默认 1 张）。
   * 默认 1 张是有意的——统一生成属于标准化动作，一份一张、自动定稿，
   * 下游的角色造型才能立刻把它们选作参考图（参考图选择器只列成品）。
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

      /* ── 演示脚手架（0805）：三个动作只改 demoStep 与 world.assets 里 DEMO 这一批，
       *    不走任何权限/业务规则，纯讲解用。 ── */
      runDemoAnalyze: () => {
        if (get().demoStep !== 'idle') return fail('剧本已分析过了')
        // 拆解剧本：把这一批资产的"坑位"一次性铺进 world，8 份全部是"纯提示词"空壳——
        // 此刻只有提示词、没有任何图：素模/服装/场景/道具的图还没出，造型要参考的素模/服装
        // 也还没出，所以连造型的参考图也一并清空。全部等 ② 资产生成。
        //（幂等：已存在的按 id 跳过。）
        set((s) => {
          const existing = new Set(s.world.assets.map((a) => a.id))
          const incoming = DEMO_NEON_ASSETS
            .filter((a) => !existing.has(a.id))
            .map((a) => ({
              ...a,
              status: 'empty' as const,
              cover: '',
              candidates: undefined,
              referenceImages: undefined,
              referenceLabels: undefined,
            }))
          return { world: { ...s.world, assets: [...s.world.assets, ...incoming] }, demoStep: 'analyzed' }
        })
        return ok('已拆解剧本，8 份资产已列入待生成')
      },

      runDemoGenerate: () => {
        if (get().demoStep !== 'analyzed') return fail('请先完成「剧本分析」')
        // 资产生成：
        //   · 基础素材（素模/服装/场景/道具，没有 referencedFrom）：空壳 → 成品（恢复完整定义，出图）。
        //   · 造型（有 referencedFrom）：仍留「待生成」，但把参考图挂回去——此刻它要参考的
        //     素模/服装已经生成，参考图才有意义；由用户在页面上（引导条批量生成 / 详情页）现场生成。
        const demoById = new Map(DEMO_NEON_ASSETS.map((a) => [a.id, a] as const))
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => {
              const def = demoById.get(a.id)
              if (!def) return a
              if (!def.referencedFrom) {
                // 基础素材：空壳 → 成品（一份一张、自动定稿）。
                // 必须是成品，否则第二轮造型在参考图选择器里挑不到它们。
                if (a.status !== 'empty') return a
                // 0808：默认把自己的定稿图挂成参考图（标签直接用资产名）——
                // 这批已定稿的成品重新生成时理应以自己为底，进详情页预览动作条也直接显示「✓ 已是参考图」。
                // 存不带 ?g=N 后缀的裸地址（与参考图既有格式一致，isCenterInRefs 按 baseUrl 比对）。
                return def.cover
                  ? { ...def, referenceImages: [def.cover.split('?')[0]], referenceLabels: [def.name] }
                  : def
              }
              // 造型：留待生成，仅把参考图 / 标签挂回
              return { ...a, referenceImages: def.referenceImages, referenceLabels: def.referenceLabels }
            }),
          },
          demoStep: 'generated',
        }))
        return ok('已生成 5 份基础素材，3 份造型待你在页面上生成')
      },

      runDemoReset: () => {
        // 按 id 过滤掉 DEMO 这一批；音频、「其他」留存物、别的项目都不属于这条线，原样保留。
        // 另外把霓虹东京里【手动新增】的生产类资产也一并清掉——它们的 id 不在 DEMO_NEON_IDS 里，
        // 不清的话演示每重讲一遍就多留一批「未命名角色」，讲第三遍时库里已经是脏的。
        // 霓虹东京的角色/服装/场景/道具四类初始为空（种子只留音频与「其他」），所以整类清掉即可。
        const NEON_PRODUCTION: Category[] = ['character', 'costume', 'scene', 'prop']
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.filter(
              (a) =>
                !DEMO_NEON_IDS.has(a.id) &&
                !(a.scope === 'project' && a.scopeId === IDS.projNeon && NEON_PRODUCTION.includes(a.category)),
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
        // 收藏进团队库前，若团队库已有同名，挡下、提示改名（与 runDeposit 一致）。
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

      runDeposit: (sourceId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!user.teamId) return fail('当前账号没有团队库')
        if (depositMode(user) === 'none') return fail('管理员只治理，不参与存入')
        // 去重（v5：库内顶层资产名唯一）：项目→团队这一步，团队库同名则挡下、提示改名。
        if (libraryHasSameName(world.assets, 'team', user.teamId, source.name)) {
          return fail(`团队库已有同名「${source.name}」，请改名后再存入团队库`)
        }
        try {
          const res = deposit(source, user.teamId, user)
          if (res.kind === 'asset') {
            set((s) => ({ world: addAsset(s.world, res.asset) }))
            return ok(`已把「${source.name}」存入为团队母版`)
          }
          // 子账号：登记一条待审批申请，不直接写团队库；额外知会主账号「有新申请待你审批」
          // （审核中心改造 · 第 5 类消息：原来只有头像红点，没有通知）。
          set((s) => ({
            applications: [...s.applications, res],
            notifications: user.parentId
              ? [
                  ...s.notifications,
                  makeNotification(
                    user.parentId,
                    'deposit_submitted',
                    `${user.name} 提交了「${source.name}」的资产存入申请，待你审批`,
                    // v2：主账号进不去 #/review 了；点通知直接在团队库上弹开存入申请抽屉。
                    '#/team/deposits',
                  ),
                ]
              : s.notifications,
          }))
          return ok(`已提交「${source.name}」的资产存入申请，待主账号审批`)
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
        const source = findAsset(world, appl.assetId)
        if (!source) return fail('原资产已不存在，无法入库')
        try {
          // 复用同一处"入库"实现，保证审批通过和主账号直接存入行为一致
          const master = materializeDeposit(source, appl.toTeamId)
          set((s) => ({
            world: addAsset(s.world, master),
            applications: s.applications.map((a) =>
              a.id === applicationId
                ? { ...a, status: 'approved' as const, reviewedBy: approver.id, reviewedAt: Date.now() }
                : a,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(appl.applicantId, 'deposit_approved', `你的「${appl.assetName}」资产存入申请已通过，已进团队库`),
            ],
          }))
          return ok(`已通过「${appl.assetName}」的资产存入申请，写入团队库`)
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
              `你的「${appl.assetName}」资产存入申请被驳回${reason ? `：${reason}` : ''}`,
            ),
          ],
        }))
        return ok(`已驳回「${appl.assetName}」的资产存入申请`)
      },

      runContribute: (sourceId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!canContributeToPlaza(user, source)) return fail('你没有权限在这一层向广场投稿')
        try {
          const submission = contributeToPlaza(source, user)
          // 子账号投稿直达 admin，主账号不拦截；但知会一条，让主账号知道团队的东西要外流
          // （审核中心改造 · 第 8 类消息）。
          set((s) => ({
            plazaSubmissions: [...s.plazaSubmissions, submission],
            notifications: user.parentId
              ? [
                  ...s.notifications,
                  makeNotification(
                    user.parentId,
                    'plaza_submit_notice',
                    `${user.name} 把「${source.name}」投稿到了素材广场（知会，未拦截）`,
                    // v2：这是知会，主账号对广场投稿没有可执行动作，不给可点链接（免得误导）。
                  ),
                ]
              : s.notifications,
          }))
          return ok(`已提交「${source.name}」的广场投稿，待 admin 审核`)
        } catch (e) {
          return fromError(e)
        }
      },

      approvePlazaSubmission: (submissionId) => {
        const { world, currentUserId, plazaSubmissions } = get()
        const reviewer = findUser(world, currentUserId)
        const sub = plazaSubmissions.find((x) => x.id === submissionId)
        if (!reviewer || !sub) return fail('数据不存在')
        if (!canReviewPlaza(reviewer)) return fail('只有 admin 能审核广场投稿')
        if (sub.status !== 'pending') return fail('这条投稿已经处理过了')
        const source = findAsset(world, sub.assetId)
        if (!source) return fail('原资产已不存在，无法上架')
        try {
          // 上架时显式打上 shelfStatus='listed'，并把生成的广场资产 id 回填给投稿记录，
          // 让审核中心列表能把「投稿记录」和「已上架资产」对上号、不重复出行。
          const master = { ...materializePlaza(source, sub.submitterId), shelfStatus: 'listed' as const }
          set((s) => ({
            world: addAsset(s.world, master),
            plazaSubmissions: s.plazaSubmissions.map((x) =>
              x.id === submissionId
                ? { ...x, status: 'approved' as const, reviewedBy: reviewer.id, reviewedAt: Date.now(), resultAssetId: master.id }
                : x,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(sub.submitterId, 'plaza_approved', `你投稿的「${sub.assetName}」已通过 admin 审核，已上架素材广场`),
            ],
          }))
          return ok(`已通过「${sub.assetName}」的广场投稿，已上架`)
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
              `你投稿的「${sub.assetName}」被 admin 驳回${reason ? `：${reason}` : ''}`,
            ),
          ],
        }))
        return ok(`已驳回「${sub.assetName}」的广场投稿`)
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
          // 定稿后若是造型，把定稿图追加进自己的参考图（withSelfReference 内部判造型 + 判重）。
          const next = withSelfReference(setFinal(asset, candidateId))
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

      runUnsetFinal: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限修改这份资产')
        try {
          const next = unsetFinal(asset)
          set((s) => ({
            world: { ...s.world, assets: s.world.assets.map((a) => (a.id === assetId ? next : a)) },
          }))
          return ok('已取消定稿，这份资产暂时不能被参考或存入团队库')
        } catch (e) {
          return fromError(e)
        }
      },

      appendCandidates: (assetId, urls, allowAutoFinal = true) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限往这份资产生成图片')
        if (urls.length === 0) return fail('没有可生成的图片')
        const added = urls.map((u) => makeCandidate(u, asset.prompt))
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => {
              if (a.id !== assetId) return a
              const prevCands = a.candidates ?? []
              const candidates = [...prevCands, ...added]
              // 0808 · 自动定稿的三个条件：本批只有 1 张 + 原本没定稿 + 原本池子是空的（第一次出图）。
              // 三条缺一不可；尤其别漏第三条，否则"待定稿资产补传一张"会被意外定稿。
              // allowAutoFinal=false：调用方声明这是用户主动放进来的图（如上传本地图），
              // 定稿权留给用户，不代他拍板——直接进待定稿。
              const autoFinal = allowAutoFinal && added.length === 1 && !a.cover && prevCands.length === 0
              const next = {
                ...a,
                candidates,
                cover: autoFinal ? added[0].url : a.cover,
                status: (autoFinal || a.cover ? 'done' : 'pending') as AssetStatus,
              }
              // 自动定稿的若是造型，把定稿图一并挂进自己的参考图。
              return autoFinal ? withSelfReference(next) : next
            }),
          },
        }))
        const autoFinaled = allowAutoFinal && added.length === 1 && !asset.cover && (asset.candidates?.length ?? 0) === 0
        return ok(autoFinaled ? '已生成并设为定稿' : `已生成 ${added.length} 张，挑一张设为定稿`)
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

      removeReferenceImage: (assetId, index) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限编辑这份资产的参考图')
        const refs = asset.referenceImages ?? []
        if (index < 0 || index >= refs.length) return fail('参考图不存在')
        const next = refs.filter((_, i) => i !== index)
        // 标签下标对齐：删同一下标的 label（label 数组可能比图短，超界忽略）。
        const labels = asset.referenceLabels ?? []
        const nextLabels = labels.filter((_, i) => i !== index)
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    referenceImages: next.length ? next : undefined,
                    referenceLabels: nextLabels.length ? nextLabels : undefined,
                  }
                : a,
            ),
          },
        }))
        return ok('已移除参考图')
      },

      addReferenceImages: (assetId, items, referencedFrom) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限编辑这份资产的参考图')
        if (items.length === 0) return fail('没有可添加的参考图')
        const baseImgs = asset.referenceImages ?? []
        // 标签补齐到与图等长（历史资产可能没写全 label），再追加。
        const baseLabels = [...(asset.referenceLabels ?? [])]
        while (baseLabels.length < baseImgs.length) baseLabels.push('参考')
        // 去重 + 归一化：候选池的 url 带 ?g=N 后缀、参考图存裸地址，同一张图不能以两个身份进来。
        const bare = (u: string) => u.split('?')[0]
        const seen = new Set(baseImgs.map(bare))
        const fresh = items.filter((it) => {
          const k = bare(it.url)
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        if (fresh.length === 0) return fail('这张已经在参考图里了')
        const nextImgs = [...baseImgs, ...fresh.map((it) => bare(it.url))]
        const nextLabels = [...baseLabels, ...fresh.map((it) => it.label)]
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    referenceImages: nextImgs,
                    referenceLabels: nextLabels,
                    // 原来没有血缘时才写第一个来源，别覆盖已有 referencedFrom。
                    referencedFrom: a.referencedFrom || referencedFrom,
                  }
                : a,
            ),
          },
        }))
        return ok(`已添加 ${items.length} 张参考图`)
      },

      batchGenerate: (assetIds, placeholderUrl, countPerAsset = 1) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        if (!user) return fail('数据不存在')
        const idSet = new Set(assetIds)
        let generated = 0
        let skipped = 0
        let seq = 0
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => {
              if (!idSet.has(a.id)) return a
              // 0807：空壳和待定稿都可以再生成；已有定稿的成品跳过（批量生成是给"还没出图"的用的）。
              if (!canRegenerate(user, a) || (a.status !== 'empty' && a.status !== 'pending')) {
                skipped++
                return a
              }
              generated++
              // 造型有 lookUrl（真实成品图替身）时优先用它出图；否则回落参考图第一张 / 占位图。
              const look = typeof a.fields?.lookUrl === 'string' ? a.fields.lookUrl : undefined
              const src = (look ?? a.referenceImages?.[0] ?? placeholderUrl).split('?')[0]
              const cands = Array.from({ length: countPerAsset }, () =>
                makeCandidate(`${src}?g=${++seq}`, a.prompt),
              )
              // 与 appendCandidates 同一条规则：本批 1 张 + 原本没定稿 + 原本池子空 → 自动定稿。
              const autoFinal = cands.length === 1 && !a.cover && (a.candidates?.length ?? 0) === 0
              const next = {
                ...a,
                candidates: [...(a.candidates ?? []), ...cands],
                cover: autoFinal ? cands[0].url : a.cover,
                status: (autoFinal ? 'done' : 'pending') as AssetStatus,
              }
              // 自动定稿的若是造型，把定稿图一并挂进自己的参考图。
              return autoFinal ? withSelfReference(next) : next
            }),
          },
        }))
        if (generated === 0 && skipped === 0) return fail('没有可生成的资产')
        return ok(`已生成 ${generated} 份资产（跳过 ${skipped} 份）`)
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
          status: 'empty', cover: '', prompt: '', fields: {}, tags: [],
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
  const fromLabelOf = (fromScope: 'team' | 'project', fromScopeId?: string) =>
    fromScope === 'team' ? '团队资产库' : world.projects.find((p) => p.id === fromScopeId)?.name ?? '某项目'

  const rows: PlazaReviewRow[] = []

  // ① 还没过审 / 被驳回的投稿：世界里还没有对应的广场资产，从投稿记录出行。
  //    已通过（approved）的不在这里出——它对应的资产已经在 world.assets 里，会从 ② 出行，否则重复。
  for (const s of plazaSubmissions) {
    if (s.status === 'approved') continue
    const src = world.assets.find((a) => a.id === s.assetId)
    rows.push({
      key: `sub_${s.id}`,
      submissionId: s.id,
      assetId: s.assetId,
      name: s.assetName,
      cover: src ? coverOf(src) : '',
      category: src?.category ?? 'character',
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
      const src = world.assets.find((x) => x.id === a.assetId)
      return {
        id: a.id,
        assetId: a.assetId,
        name: a.assetName,
        cover: src ? coverOf(src) : '',
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
