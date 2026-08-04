/**
 * useHashRoute —— 自写的极简 hash 路由（不引 react-router）
 *
 * 思路（学习注解，对齐技术规划 §4.2）：
 *   把"当前在哪一页 / 哪个项目 / 哪种模式"提取成 URL 里的 hash（#/... 那一段），
 *   这样它就可刷新、可后退、可分享，组件也更薄——组件只管"读当前 route 渲染对应页"，
 *   不用各自存一份 view 状态。将来页面变复杂，再平滑换成 react-router 也只换这一个 hook。
 *
 * 路由表（技术规划 §4.2）：
 *   #/home                      创作中心
 *   #/projects                  项目管理
 *   #/team                      团队资产库
 *   #/plaza                     素材广场
 *   #/project/:pid              项目工作台 · 画布列表（默认）
 *   #/project/:pid/assets       项目资产库
 *   #/project/:pid/workflow     工作流
 *   #/project/:pid/canvas/:cid  某一张无限画布（沉浸式整页）
 *   #/team/deposits             团队资产库 + 「资产存入申请」抽屉展开（主账号从通知/边栏进）
 *   #/review                    审核中心（仅 admin，头像菜单进入：作品 / 素材）
 */

import { useSyncExternalStore, useCallback } from 'react'

/** 项目工作台左栏的子页签。canvases = 画布列表；assets = 项目资产库；workflow = 工作流模式。 */
export type ProjectTab = 'canvases' | 'assets' | 'workflow'

/** 解析后的结构化路由。用可辨识联合，页面 switch 起来类型安全。 */
export type Route =
  | { name: 'home' }
  | { name: 'projects' }
  /**
   * 团队资产库。drawer 段用于从别处（通知铃铛 / 边栏入口）直接唤起覆盖在页面上的抽屉——
   * 抽屉是页面的一种状态，不是另一个页面，所以做成 team 的子段而不是独立路由。
   *   #/team            纯团队库
   *   #/team/deposits   团队库 + 「资产存入申请」抽屉展开
   */
  | { name: 'team'; drawer?: 'deposits' }
  | { name: 'plaza' }
  | { name: 'review' }
  | { name: 'project'; pid: string; tab: ProjectTab }
  | { name: 'canvas'; pid: string; cid: string }

/** 默认落地页：创作中心。 */
const DEFAULT_ROUTE: Route = { name: 'home' }

/** 把 window.location.hash 解析成结构化 Route。认不出的一律回落到首页。 */
export function parseHash(hash: string): Route {
  // 去掉开头的 '#'，再按 '/' 切段；'#/team' → ['', 'team'] → ['team']
  const path = hash.replace(/^#/, '')
  const seg = path.split('/').filter(Boolean)

  if (seg.length === 0) return DEFAULT_ROUTE

  switch (seg[0]) {
    case 'home':
      return { name: 'home' }
    case 'projects':
      return { name: 'projects' }
    case 'team':
      // #/team/deposits → 团队库上覆盖「资产存入申请」抽屉；其它/缺省 → 纯团队库。
      return { name: 'team', drawer: seg[1] === 'deposits' ? 'deposits' : undefined }
    case 'plaza':
      return { name: 'plaza' }
    case 'review':
      return { name: 'review' }
    case 'project': {
      const pid = seg[1]
      if (!pid) return DEFAULT_ROUTE
      const sub = seg[2]
      // #/project/:pid/canvas/:cid → 具体某张画布（沉浸式整页）。缺 cid 时回落到画布列表。
      if (sub === 'canvas') {
        const cid = seg[3]
        return cid ? { name: 'canvas', pid, cid } : { name: 'project', pid, tab: 'canvases' }
      }
      const tab: ProjectTab = sub === 'assets' || sub === 'workflow' ? sub : 'canvases'
      return { name: 'project', pid, tab }
    }
    default:
      return DEFAULT_ROUTE
  }
}

/** 把结构化 Route 拼回 hash 字符串（导航时用）。 */
export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'canvas':
      return `#/project/${route.pid}/canvas/${route.cid}`
    case 'project':
      return route.tab === 'canvases' ? `#/project/${route.pid}` : `#/project/${route.pid}/${route.tab}`
    case 'team':
      return route.drawer ? `#/team/${route.drawer}` : '#/team'
    default:
      return `#/${route.name}`
  }
}

/* ── useSyncExternalStore 的三件套：订阅、取快照、服务端快照 ── */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getSnapshot(): string {
  return window.location.hash
}

/**
 * 读取当前路由 + 提供 navigate。
 * 用 useSyncExternalStore 订阅 hashchange，hash 一变组件就重渲染。
 */
export function useHashRoute(): { route: Route; navigate: (to: Route | string) => void } {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '')
  const route = parseHash(hash)

  const navigate = useCallback((to: Route | string) => {
    const nextHash = typeof to === 'string' ? to : routeToHash(to)
    // 直接改 hash，浏览器发 hashchange，上面的订阅就会触发重渲染。
    window.location.hash = nextHash
  }, [])

  return { route, navigate }
}
