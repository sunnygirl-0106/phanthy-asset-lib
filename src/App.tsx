/**
 * ═══════════════════════════════════════════════════════════════════════
 * App.tsx —— 一个"逻辑内核体检台"
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个页面故意做得很朴素。它的唯一目的：让你在浏览器里"亲眼看到"
 * 逻辑内核（权限 + 流转）真的在工作，而不用去读测试。
 *
 * 它演示了本架构最核心的一句话：
 *   「不同账号看到的世界，是同一份数据用纯函数算出来的。」
 * 下面这张表，就是把每个账号丢进 canSee()，数一数他能看到几份资产。
 *
 * 等进入下一阶段（搭真正的界面），这个文件会被替换成带路由、
 * 带右下角人物切换器的正式首页。现在它只是一个自证清白的小台子。
 * ─────────────────────────────────────────────────────────────────────── */

import { createSeedWorld } from './data/seed'
import { canSee } from './services/permission'
import { directReuse } from './services/assetService'

export function App() {
  const world = createSeedWorld()

  // 对每个用户，算一算"他能看到哪些资产"——这就是派生视图
  const rows = world.users.map((u) => {
    const visible = world.assets.filter((a) => canSee(world, u, a))
    return { user: u, visibleNames: visible.map((a) => a.name) }
  })

  // 顺手演示一个流转动作：把广场的"赛博女警"直接复用进"霓虹东京"，改名"林警官"
  const src = world.assets.find((a) => a.id === 'a_cyberpolice')!
  const copy = directReuse(src, 'proj_neon')
  copy.name = '林警官'

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '40px auto', padding: '0 20px', lineHeight: 1.6, color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 24 }}>资产库 Demo · 逻辑内核体检台</h1>
      <p style={{ color: '#555' }}>
        当前阶段：领域模型 + 权限/流转纯函数已就位（跑 <code>npm test</code> 可看到全部规则的断言）。
        下面这张表是把每个账号丢进 <code>canSee()</code> 算出来的——同一份数据，不同账号看到的世界不一样。
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>① 谁能看到哪些资产（权限层）</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={cell}>账号</th>
            <th style={cell}>角色</th>
            <th style={cell}>能看到的资产</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ user, visibleNames }) => (
            <tr key={user.id}>
              <td style={cell}>{user.name}</td>
              <td style={cell}>{roleLabel(user.role)}</td>
              <td style={cell}>{visibleNames.join('、') || '（无）'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>② 一次流转动作（流转层）</h2>
      <p style={{ fontSize: 14 }}>
        把广场的「{src.name}」直接复用进「霓虹东京」并改名「{copy.name}」：
      </p>
      <ul style={{ fontSize: 14 }}>
        <li>副本落在：{copy.scope} / {copy.scopeId}</li>
        <li>血缘 masterId：{copy.masterId}（指回广场母版）</li>
        <li>是否跟随：{String(copy.following)}（直接复用永不跟随）</li>
        <li>母版名字有没有被改动：{src.name === '赛博女警' ? '没有 ✅（名字是本地的）' : '被改了 ❌'}</li>
      </ul>
    </div>
  )
}

const cell: React.CSSProperties = { border: '1px solid #e5e7eb', padding: '8px 12px' }

function roleLabel(role: string): string {
  return role === 'admin' ? '平台管理员' : role === 'owner' ? '主账号' : '子账号'
}
