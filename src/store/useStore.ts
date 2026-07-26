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
import type { World, User, Asset } from '../data/types'
import { createSeedWorld, IDS } from '../data/seed'
import {
  directReuse,
  favorite,
  reuse,
  deposit,
  AssetRuleError,
  type DepositApplication,
} from '../services/assetService'
import { canDirectReuse, canFavorite, canReuseFromTeam, depositMode } from '../services/permission'

/** 流转动作的统一返回：ok + 一句给用户看的话。 */
export interface ActionResult {
  ok: boolean
  message: string
}

interface StoreState {
  world: World
  currentUserId: string
  /** 子账号提交的沉淀申请（本期只登记 + 提示，审批中心留待下一里程碑）。 */
  applications: DepositApplication[]

  setCurrentUser: (id: string) => void
  resetDemo: () => void

  // ── 流转动作（点按钮时调用）──
  runDirectReuse: (sourceId: string, targetProjectId: string) => ActionResult
  runFavorite: (sourceId: string, follow: boolean) => ActionResult
  runReuse: (sourceId: string, targetProjectId: string, follow: boolean) => ActionResult
  runDeposit: (sourceId: string) => ActionResult
  /** 改名：名字是本地的，改了不影响母版、也不断链。 */
  renameAsset: (assetId: string, newName: string) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      world: createSeedWorld(),
      currentUserId: IDS.sunny,
      applications: [],

      setCurrentUser: (id) => set({ currentUserId: id }),
      resetDemo: () => set({ world: createSeedWorld(), currentUserId: IDS.sunny, applications: [] }),

      /* ── 下面每个动作都是同一个套路：
       *    ① 找到人和资产 → ② 权限守卫 → ③ 调纯函数算结果（可能抛业务错）
       *    → ④ 不可变提交进 world → ⑤ 返回一句话给界面显示。 */

      runDirectReuse: (sourceId, targetProjectId) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        const project = world.projects.find((p) => p.id === targetProjectId)
        if (!user || !source || !project) return fail('数据不存在')
        if (!canDirectReuse(user, project)) return fail('你没有权限在该项目里直接复用')
        try {
          const copy = directReuse(source, targetProjectId)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」直接复用进「${project.name}」（独立快照，不跟随）`)
        } catch (e) {
          return fromError(e)
        }
      },

      runFavorite: (sourceId, follow) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        if (!user || !source) return fail('数据不存在')
        if (!user.teamId) return fail('当前账号没有团队库')
        if (!canFavorite(user)) return fail('只有主账号能收藏进团队库（子账号请用"直接复用"）')
        try {
          const copy = favorite(source, user.teamId, follow)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已收藏「${source.name}」进团队库${follow ? '（跟随官方母版）' : '（不跟随）'}`)
        } catch (e) {
          return fromError(e)
        }
      },

      runReuse: (sourceId, targetProjectId, follow) => {
        const { world, currentUserId } = get()
        const user = findUser(world, currentUserId)
        const source = findAsset(world, sourceId)
        const project = world.projects.find((p) => p.id === targetProjectId)
        if (!user || !source || !project) return fail('数据不存在')
        if (!canReuseFromTeam(user, project)) return fail('你没有权限把它复用进该项目')
        try {
          const copy = reuse(source, targetProjectId, follow)
          set((s) => ({ world: addAsset(s.world, copy) }))
          return ok(`已把「${source.name}」复用进「${project.name}」${follow ? '（跟随中）' : '（不跟随）'}`)
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
        if (depositMode(user) === 'none') return fail('管理员只治理，不参与沉淀')
        try {
          const res = deposit(source, user.teamId, user)
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

      renameAsset: (assetId, newName) => {
        set((s) => ({
          world: {
            ...s.world,
            assets: s.world.assets.map((a) => (a.id === assetId ? { ...a, name: newName } : a)),
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
