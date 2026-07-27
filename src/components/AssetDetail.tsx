/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【组件】AssetDetail —— 资产详情 + 流转动作
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 点开一份资产看到的东西：封面大图、字段、血缘、素模、造型，
 * 以及"这份资产在这一层、由当前这个账号能做的流转动作"。
 *
 * 关键点：这里的按钮出现与否，完全由 asset.scope（在哪一层）+ 当前账号权限决定。
 *   · 广场的资产 → 直接复用 / 收藏（主账号）
 *   · 团队库的资产 → 复用到项目
 *   · 项目里的资产 → 沉淀到团队库
 * 点下去真的会往对应的库里加一份副本——切到那个库就能看到它。
 * 组件自己不算规则，只调用 store 的动作；规则在 permission.ts / assetService.ts。
 *
 * 【v4 · 素模锚点 + 用户自选封面】角色的展示分三层：
 *   · 封面（顶部大图）：用户自选的展示图，默认用定妆照；可在"造型"里点"设为封面"切换，或上传（占位）。
 *   · 素模（基础形象）：幕后身份锚点，穿白衣、始终在详情里展示，但从不当封面。
 *   · 造型（N 个）：角色×服装/妆 生的成品图，挂在角色下；封面就是从这里挑出来的一张。
 * ─────────────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import type { Category } from '../data/types'
import { useStore, useCurrentUser, type ActionResult } from '../store/useStore'
import { canDirectReuse, canFavorite, canReuseFromTeam, canRemovePlazaAsset, isAdmin } from '../services/permission'
import styles from './AssetDetail.module.css'

const CATEGORY_LABEL: Record<Category, string> = {
  character: '角色', costume: '服装', scene: '场景', prop: '道具', audio: '音频',
}
const FIELD_LABEL: Record<string, string> = { gender: '性别', age: '年龄', style: '风格' }
const SCOPE_LABEL = { plaza: '素材广场', team: '团队资产库', project: '项目资产库' }

// 弹出的"目标选择"面板处于哪种模式
type PickerMode = 'directReuse' | 'reuse' | 'favorite' | 'contribute' | null

export function AssetDetail({ assetId, onClose }: { assetId: string; onClose?: () => void }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const runDirectReuse = useStore((s) => s.runDirectReuse)
  const runFavorite = useStore((s) => s.runFavorite)
  const runReuse = useStore((s) => s.runReuse)
  const runDeposit = useStore((s) => s.runDeposit)
  const runContribute = useStore((s) => s.runContribute)
  const runRemovePlaza = useStore((s) => s.runRemovePlaza)
  const renameAsset = useStore((s) => s.renameAsset)
  const setCover = useStore((s) => s.setCover)

  // 从 world 里取最新的这份资产（改名后能立即反映）
  const asset = world.assets.find((a) => a.id === assetId)

  const [picker, setPicker] = useState<PickerMode>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [nameDraft, setNameDraft] = useState(asset?.name ?? '')
  // 复用/直接复用/贡献 角色时，勾选要一起带上的造型 id（素模始终带上，不在这里选）
  const [pickedLooks, setPickedLooks] = useState<string[]>([])
  const toggleLook = (id: string, on: boolean) =>
    setPickedLooks((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))

  if (!asset) return null

  // 当前账号能作为"目标"的项目
  const projectsForDirect = world.projects.filter((p) => canDirectReuse(user, p))
  const projectsForReuse = world.projects.filter((p) => canReuseFromTeam(user, p))

  // 能不能改这份资产的封面：
  //   · 只有"角色"（有造型可挑）才谈得上选封面；
  //   · 广场是官方素材、上架后不可编辑（v4），所以广场资产不给改；
  //   · admin 只治理不创作，也不改。
  const hasLooks = !!(asset.looks && asset.looks.length > 0)
  const canEditCover = hasLooks && asset.scope !== 'plaza' && !isAdmin(user)

  // 执行一个动作后：记录结果、收起选择面板
  function done(r: ActionResult) {
    setResult(r)
    setPicker(null)
  }

  const master = asset.masterId ? world.assets.find((a) => a.id === asset.masterId) : undefined

  return (
    <div className={styles.body}>
      <div className={styles.top}>
        <div className={styles.coverWrap}>
          <img className={styles.cover} src={asset.cover} alt={asset.name} />
          {hasLooks && <div className={styles.coverCaption}>封面（用户自选 · 默认定妆照）</div>}
        </div>
        <div className={styles.info}>
          <h2 className={styles.name}>{asset.name}</h2>
          <p className={styles.sub}>
            {CATEGORY_LABEL[asset.category]} · 在「{SCOPE_LABEL[asset.scope]}」
          </p>

          {/* 血缘 / 字段 */}
          <div className={styles.chips}>
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

      {/* 素模（基础形象）：角色的身份锚点，始终展示，但从不当封面 */}
      {asset.baseModel && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>素模（基础形象）· 角色身份锚点，穿白衣做参考图用</p>
          <div className={styles.baseModelRow}>
            <img className={styles.baseModel} src={asset.baseModel} alt={`${asset.name}·素模`} loading="lazy" />
            <p className={styles.note}>
              这是角色的"本体"：先定高矮胖瘦、神情，做参考图用。它始终在这里展示，<b>不作封面</b>——
              封面请到下面的"造型"里挑一张。
            </p>
          </div>
        </div>
      )}

      {/* 造型（角色×服装/妆 的成品图）；封面就是从这里挑出来的一张 */}
      {hasLooks && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>
            造型（{asset.looks!.length}）· 挂在角色下的子资产 · 封面从中选一张
          </p>
          <div className={styles.looks}>
            {asset.looks!.map((look) => {
              const isCover = look.cover === asset.cover
              return (
                <div key={look.id} className={styles.lookItem}>
                  <img
                    className={`${styles.lookImg} ${isCover ? styles.lookImgActive : ''}`}
                    src={look.cover}
                    alt={look.name}
                    loading="lazy"
                  />
                  <div className={styles.lookName}>{look.name}</div>
                  {isCover ? (
                    <span className={styles.lookCoverBadge}>✓ 当前封面</span>
                  ) : canEditCover ? (
                    <button className={styles.lookSetBtn} onClick={() => setCover(asset.id, look.cover)}>
                      设为封面
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
          {canEditCover && (
            <button className={`${styles.btnGhost} ${styles.uploadCoverBtn}`} disabled title="待接入上传">
              ＋ 上传自定义封面（待接入）
            </button>
          )}
          {!canEditCover && asset.scope === 'plaza' && (
            <p className={styles.note}>广场素材是官方货架、上架后不可编辑，封面由投稿方设定。</p>
          )}
        </div>
      )}

      {/* 流转动作 / 治理 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>可做的动作</p>

        {/* 广场素材：官方货架，上架后不可编辑（v4）——先给一句说明 */}
        {asset.scope === 'plaza' && (
          <p className={styles.note}>官方素材 · 上架后不可编辑（只能删 / 下架 / 重传）。</p>
        )}

        {isAdmin(user) ? (
          asset.scope !== 'plaza' && (
            <p className={styles.note}>管理员只治理，不参与创作与流转。</p>
          )
        ) : (
          <>
            <div className={styles.actions}>
              {asset.scope === 'plaza' && (
                <>
                  <button className={styles.btn} onClick={() => { setPickedLooks([]); setPicker('directReuse') }}>直接复用到项目</button>
                  {canFavorite(user) && (
                    <button className={styles.btnGhost} onClick={() => setPicker('favorite')}>收藏进团队库</button>
                  )}
                </>
              )}
              {asset.scope === 'team' && (
                <button className={styles.btn} onClick={() => { setPickedLooks([]); setPicker('reuse') }}>复用到项目</button>
              )}
              {asset.scope === 'project' && (
                <button className={styles.btn} onClick={() => done(runDeposit(asset.id))}>沉淀到团队库</button>
              )}
              {/* 贡献到广场：团队库/项目资产都能投；审核方是 admin（主账号、子账号都能发起）。
                  角色要先勾选带哪些造型（素模必带）；非角色直接投。*/}
              {(asset.scope === 'team' || asset.scope === 'project') && (
                <button
                  className={styles.btnGhost}
                  onClick={() => {
                    if (hasLooks) {
                      setPickedLooks([])
                      setPicker('contribute')
                    } else {
                      done(runContribute(asset.id))
                    }
                  }}
                >
                  贡献到素材广场
                </button>
              )}
            </div>

            {/* 目标选择面板 */}
            {picker === 'directReuse' && (
              <div className={styles.picker}>
                {hasLooks && (
                  <>
                    <p className={styles.pickerTitle}>
                      <b>素模（角色本体）一定会带上</b>；勾选要一起带进项目的造型（可不选，就只带素模）：
                    </p>
                    <LookCheckboxes looks={asset.looks!} picked={pickedLooks} onToggle={toggleLook} />
                  </>
                )}
                <p className={styles.pickerTitle}>选一个项目（直接复用 = 拉一份独立副本进项目）：</p>
                <ProjectChips
                  projects={projectsForDirect}
                  onPick={(pid) => done(runDirectReuse(asset.id, pid, hasLooks ? pickedLooks : undefined))}
                />
              </div>
            )}

            {picker === 'reuse' && (
              <div className={styles.picker}>
                {hasLooks && (
                  <>
                    <p className={styles.pickerTitle}>
                      <b>素模（角色本体）一定会带上</b>；勾选要一起带进项目的造型（可不选，就只带素模）：
                    </p>
                    <LookCheckboxes looks={asset.looks!} picked={pickedLooks} onToggle={toggleLook} />
                  </>
                )}
                <p className={styles.pickerTitle}>选一个项目：</p>
                <ProjectChips
                  projects={projectsForReuse}
                  onPick={(pid) => done(runReuse(asset.id, pid, hasLooks ? pickedLooks : undefined))}
                />
              </div>
            )}

            {picker === 'favorite' && (
              <div className={styles.picker}>
                <p className={styles.pickerTitle}>收藏 = 拷一份独立副本进团队库：</p>
                <button className={styles.btn} onClick={() => done(runFavorite(asset.id))}>确认收藏</button>
              </div>
            )}

            {picker === 'contribute' && (
              <div className={styles.picker}>
                <p className={styles.pickerTitle}>
                  贡献到广场：<b>素模（角色本体）一定会带上</b>；勾选要一起贡献的造型（可不选，就只贡献素模）：
                </p>
                <LookCheckboxes looks={asset.looks!} picked={pickedLooks} onToggle={toggleLook} />
                <button className={styles.btn} onClick={() => done(runContribute(asset.id, pickedLooks))}>
                  确认贡献{pickedLooks.length ? `（素模 + ${pickedLooks.length} 套造型）` : '（仅素模）'}
                </button>
              </div>
            )}
          </>
        )}

        {/* 广场治理：admin 下架任何一份；投稿作者删自己投的那份。删/下架不影响已复用的副本 */}
        {canRemovePlazaAsset(user, asset) && (
          <div className={styles.governRow}>
            <button
              className={styles.btnDanger}
              onClick={() => {
                const r = runRemovePlaza(asset.id)
                setResult(r)
                if (r.ok) onClose?.() // 这份没了，关掉详情弹窗
              }}
            >
              {isAdmin(user) ? '下架该素材' : '删除我投稿的这份'}
            </button>
            <span className={styles.note}>
              {isAdmin(user)
                ? '从广场移除；已被复用出去的副本不受影响。'
                : '删掉你投稿的这份；别人已复用的副本不受影响。'}
            </span>
          </div>
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
          <p className={styles.note}>名字是本地的：改了只改这份副本，不影响母版。</p>
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

/** 一组造型缩略图勾选框，供"复用/直接复用/贡献时选带哪些造型"用（素模不在这里选、一律带上）。 */
function LookCheckboxes({
  looks,
  picked,
  onToggle,
}: {
  looks: { id: string; name: string; cover: string }[]
  picked: string[]
  onToggle: (lookId: string, on: boolean) => void
}) {
  return (
    <div className={styles.contribLooks}>
      {looks.map((look) => {
        const checked = picked.includes(look.id)
        return (
          <label key={look.id} className={`${styles.contribLook} ${checked ? styles.contribLookOn : ''}`}>
            <input type="checkbox" checked={checked} onChange={(e) => onToggle(look.id, e.target.checked)} />
            <img className={styles.contribLookImg} src={look.cover} alt={look.name} loading="lazy" />
            <span className={styles.contribLookName}>{look.name}</span>
          </label>
        )
      })}
    </div>
  )
}
