/**
 * 【页面】WorkflowShell —— 工作流主控制台
 *
 * 档位（技术规划 §3）：深色落地页（左栏 + 步骤卡，参照 fancy demo index.html 340–489），
 * "生成即入库"本期只是概念、不真演（技术规划 §3、§6）。
 *
 * 只借壳不搬码（红线 6）：布局/步骤文案参照 fancy demo，代码在 React 里重写。
 */

import type { Route } from '../hooks/useHashRoute'
import { useStore } from '../store/useStore'
import { getProject } from '../services/permission'
import styles from './WorkflowShell.module.css'

/** 四步流水线的文案（参照 fancy demo 的步骤卡，去掉出图/摄像机等本期不做的部分）。 */
const STEPS: { index: string; title: string; desc: string }[] = [
  { index: '第一步', title: '剧本构建', desc: '上传剧本 → 拆解集/场/镜 → 提取角色、服装、场景、道具清单。纯文字，不出图。' },
  { index: '第二步', title: '素材草图', desc: '为每个角色/服装/场景/道具各出一张参考草图，核对 AI 描述是否符合预期。' },
  { index: '第三步', title: '融合分镜', desc: '把角色·服装·场景组装进每个镜头，形成分镜参考图。' },
  { index: '第四步', title: '视频生成准备', desc: '自动匹配镜头素材，批量生成提示词与关键帧，为后续视频生成做准备。' },
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

      {/* ── 主区：主控制台 + 四步工作流 ── */}
      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={styles.h1}>主控制台</h1>
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

      </main>
    </div>
  )
}
