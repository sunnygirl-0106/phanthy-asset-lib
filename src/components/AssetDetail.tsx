/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】AssetDetail —— 资产详情 + 流转动作
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 点开一份资产看到的东西：大图、字段、血缘/跟随状态、造型变体，
 * 以及"这份资产在这一层、由当前这个账号能做的流转动作"。
 *
 * 关键点：这里的按钮出现与否，完全由 asset.scope（在哪一层）+ 当前账号权限决定。
 *   · 广场的资产 → 直接复用 / 收藏（主账号）
 *   · 团队库的资产 → 复用到项目
 *   · 项目里的资产 → 沉淀到团队库
 * 点下去真的会往对应的库里加一份副本——切到那个库就能看到它。
 * 组件自己不算规则，只调用 store 的动作；规则在 permission.ts / assetService.ts。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import type { Category } from '../data/types'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { canDirectReuse, canFavorite, canReuseFromTeam, isAdmin } from '../services/permission'
import styles from './AssetDetail.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频',
}
const FIELD_LABEL: Record<string, string> = { gender: '性别', age: '年龄', style: '风格' }
const SCOPE_LABEL = { plaza: '素材广场', team: '团队资产库', project: '项目资产库' }

// 弹出的"目标选择"面板处于哪种模式
type PickerMode = 'directReuse' | 'reuse' | 'favorite' | null

export function AssetDetail({ assetId }: { assetId: string }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const runDirectReuse = useStore((s) => s.runDirectReuse)
  const runFavorite = useStore((s) => s.runFavorite)
  const runReuse = useStore((s) => s.runReuse)
  const runDeposit = useStore((s) => s.runDeposit)
  const renameAsset = useStore((s) => s.renameAsset)

  // 从 world 里取最新的这份资产（改名后能立即反映）
  const asset = world.assets.find((a) => a.id === assetId)

  const [picker, setPicker] = useState<PickerMode>(null)
  const [follow, setFollow] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [nameDraft, setNameDraft] = useState(asset?.name ?? '')

  if (!asset) return null

  // 当前账号能作为"目标"的项目
  const projectsForDirect = world.projects.filter((p) => canDirectReuse(user, p))
  const projectsForReuse = world.projects.filter((p) => canReuseFromTeam(user, p))

  // 执行一个动作后：记录结果、收起选择面板
  function done(r: ActionResult) {
    setResult(r)
    setPicker(null)
  }

  const master = asset.masterId ? world.assets.find((a) => a.id === asset.masterId) : undefined

  return (
    <div className={styles.body}>
      <div className={styles.top}>
        <img className={styles.cover} src={asset.cover} alt={asset.name} />
        <div className={styles.info}>
          <h2 className={styles.name}>{asset.name}</h2>
          <p className={styles.sub}>
            {CATEGORY_LABEL[asset.category]} · 在「{SCOPE_LABEL[asset.scope]}」
          </p>

          {/* 血缘 / 跟随 / 字段 */}
          <div className={styles.chips}>
            {asset.following && <span className={`${styles.chip} ${styles.chipFollow}`}>跟随中</span>}
            {asset.masterId && (
              <span className={`${styles.chip} ${styles.chipCopy}`}>副本 · 源自「{master?.name ?? '母版'}」</span>
            )}
            {Object.entries(asset.fields)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className={styles.chip}>
                  {(FIELD_LABEL[k] ?? k)}：{String(v)}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* 造型变体（仅角色且有造型时）*/}
      {asset.looks && asset.looks.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>造型变体（{asset.looks.length}）· 挂在角色下的子资产</p>
          <div className={styles.looks}>
            {asset.looks.map((look) => (
              <div key={look.id} className={styles.lookItem}>
                <img className={styles.lookImg} src={look.cover} alt={look.name} loading="lazy" />
                <div className={styles.lookName}>{look.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 流转动作 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>可做的动作</p>

        {isAdmin(user) ? (
          <p className={styles.note}>管理员只治理，不参与创作与流转。</p>
        ) : (
          <>
            <div className={styles.actions}>
              {asset.scope === 'plaza' && (
                <>
                  <button className={styles.btn} onClick={() => setPicker('directReuse')}>直接复用到项目</button>
                  {canFavorite(user) && (
                    <button className={styles.btnGhost} onClick={() => setPicker('favorite')}>收藏进团队库</button>
                  )}
                </>
              )}
              {asset.scope === 'team' && (
                <button className={styles.btn} onClick={() => setPicker('reuse')}>复用到项目</button>
              )}
              {asset.scope === 'project' && (
                <button className={styles.btn} onClick={() => done(runDeposit(asset.id))}>沉淀到团队库</button>
              )}
            </div>

            {/* 目标选择面板 */}
            {picker === 'directReuse' && (
              <div className={styles.picker}>
                <p className={styles.pickerTitle}>选一个项目（直接复用只给快照、不跟随）：</p>
                <ProjectChips
                  projects={projectsForDirect}
                  onPick={(pid) => done(runDirectReuse(asset.id, pid))}
                />
              </div>
            )}

            {picker === 'reuse' && (
              <div className={styles.picker}>
                <label className={styles.followRow}>
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                  跟随母版（母版更新时提示同步）
                </label>
                <p className={styles.pickerTitle}>选一个项目：</p>
                <ProjectChips
                  projects={projectsForReuse}
                  onPick={(pid) => done(runReuse(asset.id, pid, follow))}
                />
              </div>
            )}

            {picker === 'favorite' && (
              <div className={styles.picker}>
                <label className={styles.followRow}>
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                  跟随官方母版
                </label>
                <button className={styles.btn} onClick={() => done(runFavorite(asset.id, follow))}>确认收藏</button>
              </div>
            )}
          </>
        )}

        {result && (
          <div className={`${styles.result} ${result.ok ? styles.resultOk : styles.resultErr}`}>
            {result.ok ? '✅ ' : '⚠️ '}
            {result.message}
          </div>
        )}
      </div>

      {/* 改名（名字是本地的，不影响母版、不断链）—— 官方广场资产不给改 */}
      {asset.scope !== 'plaza' && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>改名</p>
          <div className={styles.renameRow}>
            <input
              className={styles.input}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <button
              className={styles.btnGhost}
              onClick={() => nameDraft.trim() && renameAsset(asset.id, nameDraft.trim())}
            >
              保存
            </button>
          </div>
          <p className={styles.note}>名字是本地的：改了不影响母版、也不会断开跟随。</p>
        </div>
      )}
    </div>
  )
}

/** 一排项目按钮，供"选目标项目"用。 */
function ProjectChips({
  projects,
  onPick,
}: {
  projects: { id: string; name: string }[]
  onPick: (projectId: string) => void
}) {
  if (projects.length === 0) return <p className={styles.note}>当前账号没有可作为目标的项目。</p>
  return (
    <div className={styles.pickerChips}>
      {projects.map((p) => (
        <button key={p.id} className={styles.btnGhost} onClick={() => onPick(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  )
}
