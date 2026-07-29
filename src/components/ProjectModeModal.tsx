/**
 * 【组件】ProjectModeModal —— 点开某个项目后弹出的"创作模式"选择弹窗
 *
 * 动线（对齐截图）：项目管理点任意项目卡 → 居中弹窗 → 选一种模式进入。
 *   · 工作流       → #/project/:pid/workflow（流水线整页）
 *   · 全自动 AI 生成 → 即将开放（占位，不可进入）
 *   · 无限画布      → #/project/:pid（该项目的画布列表，再挑/建一张画布）
 *
 * 同一项目下三种模式共享同一份项目资产池（红线 4：都读同一份 world）。
 * 自带遮罩 + 面板（比通用 Modal 宽，容三张卡横排），Esc / 点遮罩 / × 均可关。
 */

import { useEffect } from 'react'
import type { Project } from '../data/types'
import type { Route } from '../hooks/useHashRoute'
import { assetUrl } from '../utils/assets'
import styles from './ProjectModeModal.module.css'

interface Mode {
  key: 'workflow' | 'auto' | 'canvas'
  icon: string
  title: string
  desc: string
  to?: string // 有 = 可进入；无 = 即将开放
  cta: string
}

export function ProjectModeModal({
  project,
  onClose,
  navigate,
}: {
  project: Project
  onClose: () => void
  navigate: (to: Route | string) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modes: Mode[] = [
    {
      key: 'workflow',
      icon: assetUrl('assets/home/home-workflow.svg'),
      title: '工作流',
      desc: '适合流程化拆解与自动化生成，强调创作链路与环节衔接。',
      to: `#/project/${project.id}/workflow`,
      cta: '立即进入',
    },
    {
      key: 'auto',
      icon: assetUrl('assets/home/home-auto.svg'),
      title: '全自动 AI 生成',
      desc: '适合自动拆图、批量出图与生成，偏向高效率批处理制作。',
      cta: '即将开放',
    },
    {
      key: 'canvas',
      icon: assetUrl('assets/home/home-canvas.svg'),
      title: '无限画布',
      desc: '进入画布列表，使用节点式创作方式组织镜头、图片与全景生成。',
      to: `#/project/${project.id}`,
      cta: '立即进入',
    },
  ]

  function enter(m: Mode) {
    if (!m.to) return
    navigate(m.to)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="关闭">×</button>

        <h2 className={styles.title}>创作模式</h2>
        <p className={styles.sub}>同一项目下共享项目资产数据。请选择一种模式开始你的创作之旅。</p>

        <div className={styles.grid}>
          {modes.map((m) => {
            const disabled = !m.to
            return (
              <div
                key={m.key}
                className={`${styles.card} ${disabled ? styles.cardDisabled : ''}`}
                onClick={() => enter(m)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && enter(m)}
              >
                <div className={styles.iconWrap}>
                  <img className={styles.icon} src={m.icon} alt="" aria-hidden="true" />
                </div>
                <div className={styles.cardTitle}>{m.title}</div>
                <p className={styles.cardDesc}>{m.desc}</p>
                <span className={`${styles.cta} ${disabled ? styles.ctaMuted : ''}`}>{m.cta}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
