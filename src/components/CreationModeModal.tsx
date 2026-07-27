/**
 * 【组件】CreationModeModal —— 从创作中心进入某模式前的"选项目"弹窗
 *
 * 动线（技术规划 §4.1）：创作中心点某张入口卡（工作流 / 无限画布）→ 本弹窗选一个项目
 * → 进入该项目的对应模式（#/project/:pid/workflow 或 /canvas）。
 *
 * 只列"当前账号进得去的项目"（canSeeProjectAssets，切人物即重算）。
 * 本期不做"新建项目"（技术规划 §9），故只读列现有项目。
 * "去全自动"：入口只有工作流 / 画布两种模式（技术规划 §7）。
 */

import type { ProjectTab } from '../hooks/useHashRoute'
import { useStore, useCurrentUser } from '../store/useStore'
import { canSeeProjectAssets, getTeam } from '../services/permission'
import { Modal } from './Modal'
import styles from './CreationModeModal.module.css'

const MODE_LABEL: Record<'workflow' | 'canvas', string> = {
  workflow: '工作流',
  canvas: '无限画布',
}

export function CreationModeModal({
  mode,
  onClose,
  navigate,
}: {
  mode: 'workflow' | 'canvas'
  onClose: () => void
  navigate: (to: string) => void
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()

  const accessible = world.projects.filter((p) => {
    const team = getTeam(world, p.teamId)
    return team ? canSeeProjectAssets(user, p, team) : false
  })

  function enter(pid: string) {
    const tab: ProjectTab = mode // 'workflow' | 'canvas'
    navigate(`#/project/${pid}/${tab}`)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div className={styles.body}>
        <h2 className={styles.title}>选择项目 · 进入{MODE_LABEL[mode]}</h2>
        <p className={styles.sub}>选一个你有权限的项目，进它的{MODE_LABEL[mode]}模式开始创作。</p>

        {accessible.length === 0 ? (
          <div className={styles.empty}>当前账号没有可进入的项目。试试右下角切换到别的账号。</div>
        ) : (
          <div className={styles.list}>
            {accessible.map((p) => (
              <button key={p.id} className={styles.item} onClick={() => enter(p.id)}>
                <img className={styles.cover} src={p.cover} alt={p.name} />
                <div className={styles.itemMain}>
                  <div className={styles.name}>{p.name}</div>
                  <div className={styles.meta}>
                    {world.assets.filter((a) => a.scope === 'project' && a.scopeId === p.id).length} 项资产
                  </div>
                </div>
                <span className={styles.go} aria-hidden="true">进入 →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
