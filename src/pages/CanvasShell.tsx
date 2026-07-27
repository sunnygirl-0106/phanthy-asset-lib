/**
 * 【页面】CanvasShell —— 无限画布（第二档 + 两个真入口）
 *
 * 画布 = 草稿台（技术规划 §2、红线 3）：拖到画布不入库、不产副本；右键成品节点才上传。
 * 本页把两入口缝起来：
 *   · 入口一：右键成品图片/音频节点 →「上传到项目资产库」→ UploadToLibraryModal → runSaveToProject
 *   · 入口二：左侧 CanvasAssetPanel 三层可拖 → 拖到 CanvasStage → 造一个带来源的节点
 * 其余（720/切分/擦除/摄像机/真实生成）一律不做（技术规划 §2.4）。
 */

import { useRef, useState } from 'react'
import type { Route } from '../hooks/useHashRoute'
import type { Media, CanvasNode as Node, SaveSpec } from '../services/canvasService'
import { useStore, useCurrentUser } from '../store/useStore'
import { getProject, getTeam, canSeeProjectAssets } from '../services/permission'
import { CanvasStage } from '../components/canvas/CanvasStage'
import { CanvasAssetPanel, type DragPayload } from '../components/canvas/CanvasAssetPanel'
import { NodeContextMenu } from '../components/canvas/NodeContextMenu'
import { UploadToLibraryModal } from '../components/UploadToLibraryModal'
import styles from './CanvasShell.module.css'

const ADD_MEDIA: { media: Media; label: string }[] = [
  { media: 'text', label: '文本' },
  { media: 'image', label: '图片' },
  { media: 'video', label: '视频' },
  { media: 'audio', label: '音频' },
]

export function CanvasShell({ pid, navigate }: { pid: string; navigate: (to: Route | string) => void }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const runSaveToProject = useStore((s) => s.runSaveToProject)

  const project = getProject(world, pid)
  const team = project ? getTeam(world, project.teamId) : undefined
  const allowed = project && team ? canSeeProjectAssets(user, project, team) : false

  const [nodes, setNodes] = useState<Node[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null)
  const [uploadNode, setUploadNode] = useState<Node | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const seq = useRef(1)

  if (!project || !allowed) {
    return (
      <div className={styles.blocked}>
        当前账号无法进入该项目的画布。
        <br />
        <button className={styles.linkBtn} onClick={() => navigate('#/projects')}>← 返回项目管理</button>
      </div>
    )
  }

  // 本项目已有角色（供上传弹窗"替换素模/追加造型"选择）。
  const projectCharacters = world.assets.filter(
    (a) => a.scope === 'project' && a.scopeId === pid && a.category === 'character',
  )

  function nextId(prefix: string): string {
    return `${prefix}_${seq.current++}`
  }

  function showToast(ok: boolean, text: string) {
    setToast({ ok, text })
    window.setTimeout(() => setToast(null), 2600)
  }

  /* ── 加一个新生成节点（生成中态；右键"标记为成品"后才能上传）── */
  function addNode(media: Media) {
    const n: Node = {
      id: nextId('node'),
      media,
      status: 'generating',
      x: 60 + (nodes.length % 5) * 40,
      y: 60 + (nodes.length % 5) * 40,
      name: `新${media === 'text' ? '文本' : media === 'image' ? '图片' : media === 'video' ? '视频' : '音频'}`,
      content: media === 'text' ? '在这里写提示词 / 描述…' : undefined,
    }
    setNodes((prev) => [...prev, n])
    setSelectedId(n.id)
    setAddOpen(false)
  }

  /* ── 入口二：从面板拖一个资产落到画布 → 造一个"带来源"的成品节点（不入库、不产副本）── */
  function onDropAsset(p: DragPayload, x: number, y: number) {
    const n: Node = {
      id: nextId('node'),
      media: p.media,
      status: 'done', // 从库里拖来的是现成成品
      x,
      y,
      name: p.name,
      cover: p.cover,
      source: { scope: p.scope, assetId: p.assetId },
    }
    setNodes((prev) => [...prev, n])
    setSelectedId(n.id)
  }

  function markDone(id: string) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'done' } : n)))
    setMenu(null)
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    if (selectedId === id) setSelectedId(null)
    setMenu(null)
  }

  /* ── 入口一：确认上传 → 调 store.runSaveToProject ── */
  function confirmUpload(spec: SaveSpec) {
    if (!uploadNode) return
    const r = runSaveToProject(uploadNode, pid, spec)
    showToast(r.ok, r.message)
    if (r.ok) {
      // 上传成功后，这个节点已经是项目资产了 → 标记来源为 project，右键不再给"上传"入口。
      setNodes((prev) =>
        prev.map((n) => (n.id === uploadNode.id ? { ...n, source: { scope: 'project', assetId: 'uploaded' } } : n)),
      )
    }
    setUploadNode(null)
  }

  return (
    <div className={styles.wrap}>
      {/* 顶部工具条 */}
      <div className={styles.toolbar}>
        <button className={styles.linkBtn} onClick={() => navigate(`#/project/${pid}`)}>← {project.name}</button>
        <span className={styles.modeTag}>无限画布</span>
        <button className={styles.ghostBtn} onClick={() => navigate(`#/project/${pid}/workflow`)}>切到工作流</button>

        <div className={styles.addWrap}>
          <button className={styles.addBtn} onClick={() => setAddOpen((v) => !v)}>+ 加节点</button>
          {addOpen && (
            <div className={styles.addMenu}>
              {ADD_MEDIA.map((m) => (
                <button key={m.media} className={styles.addItem} onClick={() => addNode(m.media)}>{m.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 主体：左面板（入口二） + 画板 */}
      <div className={styles.main}>
        <CanvasAssetPanel pid={pid} />
        <CanvasStage
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStageClick={() => setSelectedId(null)}
          onNodeContextMenu={(node, x, y) => setMenu({ node, x, y })}
          onDropAsset={onDropAsset}
        />
      </div>

      {/* 右键菜单（入口一闸门） */}
      {menu && (
        <NodeContextMenu
          node={menu.node}
          x={menu.x}
          y={menu.y}
          onMarkDone={() => markDone(menu.node.id)}
          onUpload={() => {
            setUploadNode(menu.node)
            setMenu(null)
          }}
          onDelete={() => deleteNode(menu.node.id)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* 上传弹窗（入口一） */}
      {uploadNode && (
        <UploadToLibraryModal
          node={uploadNode}
          projectCharacters={projectCharacters}
          onConfirm={confirmUpload}
          onClose={() => setUploadNode(null)}
        />
      )}

      {/* 轻提示 */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>{toast.text}</div>
      )}
    </div>
  )
}
