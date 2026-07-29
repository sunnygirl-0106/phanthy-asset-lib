/**
 * 【画布】CanvasSidebar —— 左侧悬浮工具条（对齐截图一红框）
 *
 * 一竖排按钮：
 *   · ＋   加节点（打开媒介菜单）—— 原右上角"加节点"搬到这里
 *   · 文件夹 资产库面板（项目库 / 团队库 / 广场，可拖到画布）—— 截图里的"第二个小文件夹"
 *   · 历史 / 光标 / 键盘 —— 目前只做样式占位（技术规划：不知道的先不实现），点了无副作用
 *
 * 本组件只画按钮 + 冒泡两个开关；加节点菜单和资产面板的浮层由 CanvasShell 渲染，
 * 因为它们要用到上层的 addNode / pid 等，放在这里会把状态拆散。
 */

import styles from './CanvasSidebar.module.css'

export function CanvasSidebar({
  addActive,
  folderActive,
  onToggleAdd,
  onToggleFolder,
}: {
  addActive: boolean
  folderActive: boolean
  onToggleAdd: () => void
  onToggleFolder: () => void
}) {
  return (
    <div className={styles.bar}>
      {/* 加号收进选项条内（作为第一项，突出为主操作） */}
      <button
        className={`${styles.addBtn} ${addActive ? styles.addOn : ''}`}
        onClick={onToggleAdd}
        title="加节点"
        aria-label="加节点"
      >
        <PlusIcon />
      </button>

      <div className={styles.divider} />

      <button
        className={`${styles.iconBtn} ${folderActive ? styles.iconOn : ''}`}
        onClick={onToggleFolder}
        title="资产库"
        aria-label="资产库"
      >
        <FolderIcon />
      </button>
      {/* 以下三个目前只保样式，点了无副作用（尚未实现的功能） */}
      <button className={styles.iconBtn} title="历史记录" aria-label="历史记录">
        <HistoryIcon />
      </button>
      <button className={styles.iconBtn} title="选择工具" aria-label="选择工具">
        <CursorIcon />
      </button>
      <button className={styles.iconBtn} title="快捷键" aria-label="快捷键">
        <KeyboardIcon />
      </button>
    </div>
  )
}

/* ── 内联 SVG 图标（工程未引图标库，手写最轻）── */

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  )
}

function CursorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M5 3l14 8-6 1.5L11 19 5 3Z" />
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  )
}
