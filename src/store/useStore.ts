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
import type { World, User, Asset, Canvas, Notification, Voice } from '../data/types'
import { createSeedWorld, IDS } from '../data/seed'
import { assetUrl } from '../utils/assets'
import {
  directReuse,
  favorite,
  reuse,
  deposit,
  materializeDeposit,
  contributeToPlaza,
  materializePlaza,
  removeLook,
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

interface StoreState {
  world: World
  currentUserId: string
  /** 子账号提交的沉淀申请（pending → approved/rejected，由主账号在审批中心处理）。 */
  applications: DepositApplication[]
  /** 广场投稿申请（主账号/子账号发起，pending → approved/rejected，由 admin 审核）。 */
  plazaSubmissions: PlazaSubmission[]
  /** 通知大表（本期占位）：审批结果等发到这里，按 toUserId 分给各账号看。 */
  notifications: Notification[]

  setCurrentUser: (id: string) => void
  resetDemo: () => void

  // ── 流转动作（点按钮时调用）──
  runDirectReuse: (sourceId: string, targetProjectId: string, includeLookIds?: string[], includeVoice?: boolean) => ActionResult
  runFavorite: (sourceId: string, includeLookIds?: string[]) => ActionResult
  runReuse: (sourceId: string, targetProjectId: string, includeLookIds?: string[]) => ActionResult
  runDeposit: (sourceId: string, includeLookIds?: string[]) => ActionResult

  /**
   * 【入口一 · 本期内核唯一实质扩展】把一个画布成品节点存进项目资产库（技术规划 §2.1）。
   * 子账号在画布上传项目库免审、直接进——不生成任何审批申请（稳定性检查 ⑦）。
   * 来源是团队库/广场时，产出的项目副本自带 masterId 血缘（在 canvasService 里算）。
   */
  runSaveToProject: (node: CanvasNode, projectId: string, spec: SaveSpec) => ActionResult

  // ── 团队沉淀审批（仅主账号）──
  /** 通过一条子账号沉淀申请：把资产写入团队库、申请标记 approved、给申请人发通知。 */
  approveApplication: (applicationId: string) => ActionResult
  /** 驳回一条子账号沉淀申请：申请标记 rejected、给申请人发通知。团队库不动。 */
  rejectApplication: (applicationId: string) => ActionResult

  // ── 广场投稿（发起：主账号/子账号；审核：admin）──
  /**
   * 发起广场投稿：把自己团队库/项目里的成品资产提交到 admin 审核队列。
   * includeLookIds：贡献角色时想一起带上的造型 id（素模始终带上、不用选；空=只贡献素模）。
   */
  runContribute: (sourceId: string, includeLookIds?: string[]) => ActionResult
  /** admin 通过广场投稿：把资产上架成广场官方母版、标记 approved、给投稿人发通知。 */
  approvePlazaSubmission: (submissionId: string) => ActionResult
  /** admin 驳回广场投稿：标记 rejected、给投稿人发通知。广场不动。 */
  rejectPlazaSubmission: (submissionId: string) => ActionResult
  /**
   * 移除一份广场素材（v4：上架后不可编辑，只能删/下架）。
   * admin=下架任何一份；投稿作者=删自己投的那份。已被复用出去的副本不受影响。
   */
  runRemovePlaza: (assetId: string) => ActionResult

  /**
   * 删除一份团队库 / 项目资产库里的资产（详情图片卡片 hover 垃圾桶）。
   * 只把这一份从 world 里拿掉；已被复用/沉淀出去的独立副本 id 不同、不受影响。
   */
  runDeleteAsset: (assetId: string) => ActionResult
  /** 删除角色下的一套造型；若它是当前封面则自动回落。 */
  runDeleteLook: (assetId: string, lookId: string) => ActionResult

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
   * 设封面：把某个角色的封面换成它某个造型的图（用户自选封面）。
   * v4 口径：素模是幕后锚点、不当封面；封面由用户从造型里挑一张（或上传，占位）。
   * 只改这一份资产的 cover 字段，别的都不动。
   */
  setCover: (assetId: string, coverUrl: string) => void

  /**
   * 设音色：把某个角色的音色换成挑中的预置 / 复刻音色（听觉身份锚点，恒 1 个）。
   * 只改这一份资产的 voice 字段，别的都不动。音色活在 world 里、本期不持久化。
   */
  setVoice: (assetId: string, voice: Voice) => void
  /** 清除音色：把某个角色的音色置空（回到"未设置"态）。 */
  clearVoice: (assetId: string) => void

  // ── 重新生成 / 新增造型（v6，占位式：Demo 无生图后端，只改提示词 + 给反馈）──
  /** 重新生成素模（v6）：只改这份角色的素模提示词/图，不碰任何造型。占位：更新 prompt。 */
  regenerateBaseModel: (assetId: string, newPrompt?: string) => ActionResult
  /** 重新生成某个造型（v6）：只改该 look 的提示词/图，不碰素模、不碰别的造型。占位：更新 look.prompt。 */
  regenerateLook: (charId: string, lookId: string, newPrompt?: string) => ActionResult
  /** 新增造型（v6，＋号）：用户自填提示词，挂一个新 look 到该角色下（占位图 + 提示词）。 */
  addLook: (charId: string, prompt: string, name?: string) => ActionResult
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      world: createSeedWorld(),
      currentUserId: IDS.sunny,
      applications: [],
      plazaSubmissions: [],
      notifications: [],

      setCurrentUser: (id) => set({ currentUserId: id }),
      resetDemo: () =>
        set({
          world: createSeedWorld(),
          currentUserId: IDS.sunny,
          applications: [],
          plazaSubmissions: [],
          notifications: [],
        }),

      /* ── 下面每个动作都是同一个套路：
       *    ① 找到人和资产 → ② 权限守卫 → ③ 调纯函数算结果（可能抛业务错）
       *    → ④ 不可变提交进 world → ⑤ 返回一句话给界面显示。 */

      runDirectReuse: (sourceId, targetProjectId, includeLookIds, includeVoice) => {
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
          const copy = directReuse(source, targetProjectId, includeLookIds, includeVoice)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」直接复用进「${project.name}」${lookNote(source, includeLookIds)}`)
        } catch (e) {
          return fromError(e)
        }
      },

      runFavorite: (sourceId, includeLookIds) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!user.teamId) return fail('当前账号没有团队库')
        if (!canFavorite(user)) return fail('只有主账号能收藏进团队库（子账号请用"直接复用"）')
        // 去重把关（v5 改动1）：写团队库的两条路（收藏 / 沉淀）都去重。
        // 收藏进团队库前，若团队库已有同名，挡下、提示改名（与 runDeposit 一致）。
        if (teamHasSameName(world.assets, user.teamId, source.name)) {
          return fail(`团队库已有同名「${source.name}」，请改名后再收藏进团队库`)
        }
        try {
          const copy = favorite(source, user.teamId, includeLookIds)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已收藏「${source.name}」进团队库${lookNote(source, includeLookIds)}`)
        } catch (e) {
          return fromError(e)
        }
      },

      runReuse: (sourceId, targetProjectId, includeLookIds) => {
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
          const copy = reuse(source, targetProjectId, includeLookIds)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」复用进「${project.name}」${lookNote(source, includeLookIds)}`)
        } catch (e) {
          return fromError(e)
        }
      },

      runDeposit: (sourceId, includeLookIds) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!user.teamId) return fail('当前账号没有团队库')
        if (depositMode(user) === 'none') return fail('管理员只治理，不参与沉淀')
        // 去重（v5：库内顶层资产名唯一）：项目→团队这一步，团队库同名则挡下、提示改名。
        if (libraryHasSameName(world.assets, 'team', user.teamId, source.name)) {
          return fail(`团队库已有同名「${source.name}」，请改名后再沉淀回团队库`)
        }
        try {
          const res = deposit(source, user.teamId, user, includeLookIds)
          if (res.kind === 'asset') {
            set((s) => ({ world: addAsset(s.world, res.asset) }))
            return ok(`已把「${source.name}」沉淀为团队母版`)
          }
          // 子账号：登记一条待审批申请，不直接写团队库
          set((s) => ({ applications: [...s.applications, res] }))
          return ok(`已提交「${source.name}」的沉淀申请，待主账号审批`)
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
          // 复用同一处"入库"实现，保证审批通过和主账号直接沉淀行为一致；按申请里存的勾选落库
          const master = materializeDeposit(source, appl.toTeamId, appl.includeLookIds)
          set((s) => ({
            world: addAsset(s.world, master),
            applications: s.applications.map((a) =>
              a.id === applicationId ? { ...a, status: 'approved' as const } : a,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(appl.applicantId, `你的「${appl.assetName}」沉淀申请已通过，已进团队库`),
            ],
          }))
          return ok(`已通过「${appl.assetName}」的沉淀申请，写入团队库`)
        } catch (e) {
          return fromError(e)
        }
      },

      rejectApplication: (applicationId) => {
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
            a.id === applicationId ? { ...a, status: 'rejected' as const } : a,
          ),
          notifications: [
            ...s.notifications,
            makeNotification(appl.applicantId, `你的「${appl.assetName}」沉淀申请被驳回`),
          ],
        }))
        return ok(`已驳回「${appl.assetName}」的沉淀申请`)
      },

      runContribute: (sourceId, includeLookIds = []) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!canContributeToPlaza(user, source)) return fail('你没有权限在这一层向广场投稿')
        try {
          const submission = contributeToPlaza(source, user, includeLookIds)
          set((s) => ({ plazaSubmissions: [...s.plazaSubmissions, submission] }))
          const extra = includeLookIds.length ? `（含 ${includeLookIds.length} 套造型）` : '（仅素模）'
          return ok(`已提交「${source.name}」的广场投稿${source.looks?.length ? extra : ''}，待 admin 审核`)
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
          const master = materializePlaza(source, sub.submitterId, sub.includeLookIds)
          set((s) => ({
            world: addAsset(s.world, master),
            plazaSubmissions: s.plazaSubmissions.map((x) =>
              x.id === submissionId ? { ...x, status: 'approved' as const } : x,
            ),
            notifications: [
              ...s.notifications,
              makeNotification(sub.submitterId, `你投稿的「${sub.assetName}」已通过 admin 审核，已上架素材广场`),
            ],
          }))
          return ok(`已通过「${sub.assetName}」的广场投稿，已上架`)
        } catch (e) {
          return fromError(e)
        }
      },

      rejectPlazaSubmission: (submissionId) => {
        const { world, currentUserId, plazaSubmissions } = get()
        const reviewer = findUser(world, currentUserId)
        const sub = plazaSubmissions.find((x) => x.id === submissionId)
        if (!reviewer || !sub) return fail('数据不存在')
        if (!canReviewPlaza(reviewer)) return fail('只有 admin 能审核广场投稿')
        if (sub.status !== 'pending') return fail('这条投稿已经处理过了')
        set((s) => ({
          plazaSubmissions: s.plazaSubmissions.map((x) =>
            x.id === submissionId ? { ...x, status: 'rejected' as const } : x,
          ),
          notifications: [
            ...s.notifications,
            makeNotification(sub.submitterId, `你投稿的「${sub.assetName}」被 admin 驳回`),
          ],
        }))
        return ok(`已驳回「${sub.assetName}」的广场投稿`)
      },

      runRemovePlaza: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (asset.scope !== 'plaza') return fail('只有广场素材才谈得上下架 / 删除')
        if (!canRemovePlazaAsset(user, asset)) return fail('你没有权限移除这份广场素材')

        const label = isAdmin(user) ? '下架' : '删除' // admin 是治理下架；作者是删自己投的
        // admin 下架别人投的 → 通知投稿人；作者删自己的、或官方素材（无投稿人）→ 不发通知
        const notifyContributor = asset.contributedBy && asset.contributedBy !== user.id
        set((s) => ({
          // 只把广场这份拿掉；已被复用/收藏出去的独立副本 id 不同，不受影响
          world: { ...s.world, assets: s.world.assets.filter((a) => a.id !== assetId) },
          notifications: notifyContributor
            ? [...s.notifications, makeNotification(asset.contributedBy!, `你投稿的「${asset.name}」已被 admin 下架`)]
            : s.notifications,
        }))
        return ok(`已${label}「${asset.name}」（已复用出去的副本不受影响）`)
      },

      runDeleteAsset: (assetId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限删除这份资产')

        set((s) => ({
          // 只把这一份拿掉；已被复用/沉淀出去的独立副本 id 不同，不受影响
          world: { ...s.world, assets: s.world.assets.filter((a) => a.id !== assetId) },
        }))
        return ok(`已删除「${asset.name}」（已复用出去的副本不受影响）`)
      },

      runDeleteLook: (assetId, lookId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canDeleteLibraryAsset(user, asset)) return fail('你没有权限删除这套造型')
        try {
          const next = removeLook(asset, lookId)
          set((s) => ({
            world: {
              ...s.world,
              assets: s.world.assets.map((a) => (a.id === assetId ? next : a)),
            },
          }))
          return ok('已删除该造型')
        } catch (e) {
          return fromError(e)
        }
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

      /* ── 重新生成 / 新增造型（v6）───────────────────────────────────────
       * Demo 无生图后端：这三个动作只落"提示词 + 占位反馈"，像素待接模型。
       * 都先过 canRegenerate 守卫（广场恒挡、admin 恒挡；子账号仅项目库）。
       * 沿用 setCover/setVoice 的不可变写法：assets.map 造新数组、只碰这一份。 */

      regenerateBaseModel: (assetId, newPrompt) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, assetId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限对这份资产重新生成')
        // 只改素模那份的 prompt（传了才改）；status 直接落 done（Demo 里不做生成中态）。不动 looks。
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === assetId
                ? { ...a, prompt: newPrompt !== undefined ? newPrompt : a.prompt, status: 'done' as const }
                : a,
            ),
          },
        }))
        return ok('已提交素模重新生成，接入生图模型后生效')
      },

      regenerateLook: (charId, lookId, newPrompt) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, charId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限对这份资产重新生成')
        if (!asset.looks?.some((l) => l.id === lookId)) return fail('造型不存在')
        // 只更新 looks 里那一个 look 的 prompt；不动 baseModel、不动别的 look。
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === charId
                ? {
                    ...a,
                    looks: a.looks!.map((l) =>
                      l.id === lookId
                        ? { ...l, prompt: newPrompt !== undefined ? newPrompt : l.prompt, status: 'done' as const }
                        : l,
                    ),
                  }
                : a,
            ),
          },
        }))
        return ok('已提交造型重新生成，接入生图模型后生效')
      },

      addLook: (charId, prompt, name) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const asset = findAsset(world, charId)
        if (!user || !asset) return fail('数据不存在')
        if (!canRegenerate(user, asset)) return fail('你没有权限新增造型')
        // 追加一个新 look（占位图 + 提示词），同角色 scope/scopeId；参考 applySaveOutcome 的 addLook 分支。
        const lookName = name?.trim() || `新造型 ${(asset.looks?.length ?? 0) + 1}`
        const look: Asset = {
          id: `look_${_lookSeq++}`,
          category: 'character',
          name: lookName,
          scope: asset.scope,
          scopeId: asset.scopeId,
          status: 'done',
          cover: LOOK_PLACEHOLDER,
          fields: {},
          tags: [],
          prompt,
          createdAt: Date.now(),
        }
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) =>
              a.id === charId ? { ...a, looks: [...(a.looks ?? []), look] } : a,
            ),
          },
        }))
        return ok(`已新增造型「${lookName}」，接入生图模型后出图`)
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
/** 入口一：把画布上传的产出意图不可变地提交进 world（新建顶层 / 关联到已有资产）。 */
function applySaveOutcome(world: World, outcome: SaveOutcome): World {
  switch (outcome.kind) {
    case 'add':
      return addAsset(world, outcome.asset)
    case 'link':
      return {
        ...world,
        assets: world.assets.map((a) =>
          a.id === outcome.parentId ? { ...a, looks: [...(a.looks ?? []), outcome.child] } : a,
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
      return `已把「${outcome.child.name}」关联到已有资产`
  }
}
/** 新增造型（v6）的占位图：Demo 无生图后端，新造型先用本地占位图，接模型后换真图。 */
const LOOK_PLACEHOLDER = assetUrl('assets/canvas/image-placeholder.svg')
/** 新增造型的自增 id 计数器（够 Demo 用且可预测）。 */
let _lookSeq = 1
/** 新建画布的自增 id 计数器（够 Demo 用且可预测）。 */
let _canvasSeq = 1
/** 造一条通知（自增 id，够 Demo 用且可预测）。 */
let _notiSeq = 1
function makeNotification(toUserId: string, text: string): Notification {
  return { id: `noti_${_notiSeq++}`, toUserId, text, createdAt: Date.now(), read: false }
}
/** 给复用/直接复用的结果补一句"带了哪些造型"的说明（非角色就只说独立副本）。 */
function lookNote(source: Asset, includeLookIds?: string[]): string {
  if (!source.looks?.length) return '（独立副本）'
  if (includeLookIds === undefined) return '（独立副本 · 整份带）'
  return includeLookIds.length
    ? `（独立副本 · 素模 + ${includeLookIds.length} 套造型）`
    : '（独立副本 · 仅素模）'
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
