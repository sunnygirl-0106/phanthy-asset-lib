/**
 * 【页面】WorkflowShell —— 工作流落地页（灌数据，不空占位）
 *
 * 档位（技术规划 §3）：深色落地页（左栏 + 步骤卡，参照 fancy demo index.html 340–489），
 * 并把 seed 的项目资产按 5 类目陈列出来——数据与画布共享同一个项目资产池
 * （都读 world.assets 里 scope=project & scopeId=pid 那批）。
 * "生成即入库"本期只是概念、不真演（技术规划 §3、§6）。
 *
 * 只借壳不搬码（红线 6）：布局/步骤文案参照 fancy demo，代码在 React 里重写。
 */

import type { Category } from '../data/types'
import type { Route } from '../hooks/useHashRoute'
import { useStore } from '../store/useStore'
import { getProject } from '../services/permission'
import { AssetCard } from '../components/AssetCard'
import styles from './WorkflowShell.module.css'

/** 四步流水线的文案（参照 fancy demo 的步骤卡，去掉出图/摄像机等本期不做的部分）。 */
const STEPS: { index: string; title: string; desc: string }[] = [
  { index: '第一步', title: '剧本构建', desc: '上传剧本 → 拆解集/场/镜 → 提取角色、服装、场景、道具清单。纯文字，不出图。' },
  { index: '第二步', title: '素材草图', desc: '为每个角色/服装/场景/道具各出一张参考草图，核对 AI 描述是否符合预期。' },
  { index: '第三步', title: '融合分镜', desc: '把角色·服装·场景组装进每个镜头，形成分镜参考图。' },
  { index: '第四步', title: '视频生成准备', desc: '自动匹配镜头素材，批量生成提示词与关键帧，为后续视频生成做准备。' },
]

/** 5 类目的陈列顺序与中文名（与资产库口径一致：角色/服装/场景/道具/音频）。 */
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'character', label: '角色' },
  { key: 'costume', label: '服装' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
  { key: 'audio', label: '音频' },
]

export function WorkflowShell({
  pid,
  navigate,
}: {
  pid: string
  navigate: (to: Route | string) => void
}) {
  const world = useStore((s) => s.world)
  const project = getProject(world, pid)

  // 本项目的资产池（与画布共享同一批数据）。
  const projectAssets = world.assets.filter((a) => a.scope === 'project' && a.scopeId === pid)

  if (!project) {
    return <div className={styles.missing}>项目不存在或无权限。</div>
  }

  return (
    <div className={styles.wrap}>
      {/* ── 左栏：项目头 + 当前模式 + 菜单 ── */}
      <aside className={styles.sidebar}>
        <button className={styles.back} onClick={() => navigate(`#/project/${pid}`)}>
          ← 项目工作台
        </button>
        <div className={styles.projName}>{project.name}</div>

        <div className={styles.modePanel}>
          <span className={styles.modeLabel}>当前模式</span>
          <div className={styles.modeRow}>
            <strong>工作流</strong>
            <button className={styles.modeSwitch} onClick={() => navigate(`#/project/${pid}/canvas`)}>
              切到画布
            </button>
          </div>
        </div>

        <nav className={styles.nav}>
          <button className={`${styles.navItem} ${styles.navActive}`}>主控制台</button>
          <button className={styles.navItem} onClick={() => navigate(`#/project/${pid}/assets`)}>
            项目资产库
          </button>
          <button className={styles.navItem} disabled>剧本拆解</button>
          <button className={styles.navItem} disabled>拍摄台</button>
          <button className={styles.navItem} disabled>视频工坊</button>
        </nav>
      </aside>

      {/* ── 主区：标题 + 步骤卡 + 5 类目项目资产陈列 ── */}
      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={styles.h1}>主控制台</h1>
          <p className={styles.headSub}>流水线式创作 · {project.name}</p>
        </div>

        <section className={styles.stepGrid} aria-label="工作流步骤">
          {STEPS.map((s) => (
            <article key={s.index} className={styles.stepCard}>
              <span className={styles.stepIndex}>{s.index}</span>
              <h2 className={styles.stepTitle}>{s.title}</h2>
              <p className={styles.stepDesc}>{s.desc}</p>
            </article>
          ))}
        </section>

        {/* 项目资产陈列：按 5 类目分区。这批数据与画布共享。 */}
        <section className={styles.shelf} aria-label="项目资产">
          <div className={styles.shelfHead}>
            <h2 className={styles.shelfTitle}>项目资产</h2>
            <span className={styles.shelfNote}>共 {projectAssets.length} 项 · 与画布共享同一资产池</span>
          </div>

          {CATEGORIES.map(({ key, label }) => {
            const items = projectAssets.filter((a) => a.category === key)
            return (
              <div key={key} className={styles.catBlock}>
                <div className={styles.catHead}>
                  <span className={styles.catName}>{label}</span>
                  <span className={styles.catCount}>{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className={styles.catEmpty}>该类目暂无资产</div>
                ) : (
                  <div className={styles.catGrid}>
                    {items.map((a) => (
                      <AssetCard key={a.id} asset={a} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <footer className={styles.statusBar}>
          <span>后端状态：</span>
          <strong>演示模式（不真连生成）</strong>
        </footer>
      </main>
    </div>
  )
}
