/**
 * 【页面】CanvasShell —— 无限画布（沉浸式整页，对齐截图一）
 *
 * 布局：自带顶栏（项目名 · 画布名 · 同步态 · 会员超市 / ∞ / 头像）+ 左侧悬浮工具条 + 画板。
 * 工具条（CanvasSidebar）：＋ 加节点、文件夹 资产库面板（项目库/团队库/广场，可拖）、
 * 历史/光标/键盘（样式占位）。原右上角"加节点"与整条左侧资产库都收进了这条工具条。
 *
 * 画布 = 草稿台（技术规划 §2、红线 3）：拖到画布不入库、不产副本；右键成品节点才上传。
 * 两入口不变：
 *   · 入口一：右键成品图片/音频节点 →「上传到项目资产库」→ UploadToLibraryModal → runSaveToProject
 *   · 入口二：资产面板三层可拖 → 拖到 CanvasStage → 造一个带来源的节点
 */

import { useRef, useState } from 'react'
import type { Route } from '../hooks/useHashRoute'
import type { Media, CanvasNode as Node, SaveSpec } from '../services/canvasService'
import type { Voice } from '../data/types'
import { useStore, useCurrentUser } from '../store/useStore'
import { getProject, getTeam, canSeeProjectAssets } from '../services/permission'
import { CanvasStage } from '../components/canvas/CanvasStage'
import { CanvasSidebar } from '../components/canvas/CanvasSidebar'
import { CanvasAssetPanel, type DragPayload } from '../components/canvas/CanvasAssetPanel'
import { NodeContextMenu } from '../components/canvas/NodeContextMenu'
import { UploadToLibraryModal } from '../components/UploadToLibraryModal'
import { SaveAudioModal } from '../components/SaveAudioModal'
import { assetUrl } from '../utils/assets'
import styles from './CanvasShell.module.css'

const ADD_MEDIA: { media: Media; label: string }[] = [
  { media: 'text', label: '文本' },
  { media: 'image', label: '图片' },
  { media: 'video', label: '视频' },
  { media: 'audio', label: '音频' },
]

/**
 * 新建图片节点用的占位图（本 Demo 不接真实生成）。
 * 已把真实人像照下载进工程本地目录 → 不依赖联网、不受浏览器拦截缓存影响、离线也能演示。
 * 按序取图 → 同一节点每次同一张、上传进资产库后各层看到的也一致。
 */
const PLACEHOLDER_POOL = [
  assetUrl('assets/canvas/portraits/portrait-1.jpg'),
  assetUrl('assets/canvas/portraits/portrait-2.jpg'),
  assetUrl('assets/canvas/portraits/portrait-3.jpg'),
  assetUrl('assets/canvas/portraits/portrait-4.jpg'),
  assetUrl('assets/canvas/portraits/portrait-5.jpg'),
  assetUrl('assets/canvas/portraits/portrait-6.jpg'),
]

/** 新建音频节点的占位音源：Demo 无真实录音，复用预置音色 mp3，能真的点开试听、也能存进库/设为音色。 */
const AUDIO_PLACEHOLDER_SRC = assetUrl('assets/voices/preset_voice_female.mp3')

/** 左侧悬浮工具条上唯一“开着”的浮层：加节点菜单 / 资产面板 / 都关。 */
type Flyout = 'add' | 'folder' | null

export function CanvasShell({
  pid,
  cid,
  navigate,
}: {
  pid: string
  cid: string
  navigate: (to: Route | string) => void
}) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const runSaveToProject = useStore((s) => s.runSaveToProject)
  const setVoice = useStore((s) => s.setVoice)

  const project = getProject(world, pid)
  const team = project ? getTeam(world, project.teamId) : undefined
  const allowed = project && team ? canSeeProjectAssets(user, project, team) : false
  const canvas = world.canvases.find((c) => c.id === cid && c.projectId === pid)

  const [nodes, setNodes] = useState<Node[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(null)
  const [uploadNode, setUploadNode] = useState<Node | null>(null)
  const [audioNode, setAudioNode] = useState<Node | null>(null)
  const [previewNode, setPreviewNode] = useState<Node | null>(null)
  const [flyout, setFlyout] = useState<Flyout>(null)
  const [zoom, setZoom] = useState(100)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const seq = useRef(1)

  if (!project || !allowed || !canvas) {
    return (
      <div className={styles.blocked}>
        {canvas ? '当前账号无法进入该项目的画布。' : '画布不存在或已被删除。'}
        <br />
        <button className={styles.linkBtn} onClick={() => navigate(`#/project/${pid}`)}>← 返回画布列表</button>
      </div>
    )
  }

  // 本项目已有资产（供上传弹窗「关联已有」按类目挑关联目标）。
  const projectAssets = world.assets.filter(
    (a) => a.scope === 'project' && a.scopeId === pid,
  )
  // 本项目角色（供音频弹窗「关联角色」/「设为音色」下拉）。
  const projectCharacters = projectAssets.filter((a) => a.category === 'character')

  function nextId(prefix: string): string {
    return `${prefix}_${seq.current++}`
  }

  function showToast(ok: boolean, text: string) {
    setToast({ ok, text })
    window.setTimeout(() => setToast(null), 2600)
  }

  /* ── 加一个新节点 ──
   * 图片 / 音频节点直接给占位内容、置为"成品"，右键第一栏即可「保存到资产库」（对齐演示动线：
   *   图片走保存弹窗、音频走 R4 的「音频素材 / 角色音色」二选一弹窗）；
   * 文本 / 视频仍是"生成中"，需右键"标记为成品"后才可上传（沿用原规则，不擅自改动）。 */
  function addNode(media: Media) {
    const isImage = media === 'image'
    const isAudio = media === 'audio'
    const n: Node = {
      id: nextId('node'),
      media,
      status: isImage || isAudio ? 'done' : 'generating',
      x: 60 + (nodes.length % 5) * 40,
      y: 60 + (nodes.length % 5) * 40,
      name: `新${media === 'text' ? '文本' : media === 'image' ? '图片' : media === 'video' ? '视频' : '音频'}`,
      cover: isImage ? PLACEHOLDER_POOL[nodes.length % PLACEHOLDER_POOL.length] : undefined,
      // 音频节点带上可试听的占位音源（存库 / 设音色都靠它）；文本节点给一段占位文字。
      content: media === 'text' ? '在这里写提示词 / 描述…' : isAudio ? AUDIO_PLACEHOLDER_SRC : undefined,
    }
    setNodes((prev) => [...prev, n])
    setSelectedId(n.id)
    setFlyout(null)
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
      content: p.content, // 音色 / 音频节点带上可播放音源 url
      source: { scope: p.scope, assetId: p.assetId },
    }
    setNodes((prev) => [...prev, n])
    setSelectedId(n.id)
  }

  /* ── 入口二·点「使用」：等价于拖拽，把资产放到画布可见区域中间（略避开左侧面板，逐张错开不重叠）── */
  function onUseAsset(p: DragPayload) {
    const x = 680 + (nodes.length % 5) * 36
    const y = 200 + (nodes.length % 5) * 36
    onDropAsset(p, x, y)
  }

  /* ── 拖动节点：把新坐标不可变写回（右键菜单/选中都不受影响）── */
  function moveNode(id: string, x: number, y: number) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)))
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
      // 展开左侧资产库面板（默认落在"项目库"）→ 让刚上传的资产当场出现在库里（演示流转）。
      setFlyout('folder')
    }
    setUploadNode(null)
  }

  /* ── 入口一 · 音频（R4 ①）：存为音频素材 → 落项目库 audio 类目（可选带 roleId）── */
  function confirmSaveAudioAsset(spec: SaveSpec) {
    if (!audioNode) return
    const r = runSaveToProject(audioNode, pid, spec)
    showToast(r.ok, r.message)
    if (r.ok) {
      setNodes((prev) =>
        prev.map((n) => (n.id === audioNode.id ? { ...n, source: { scope: 'project', assetId: 'uploaded' } } : n)),
      )
      setFlyout('folder') // 展开资产库面板，让刚存的音频当场出现在库里
    }
    setAudioNode(null)
  }

  /* ── 入口一 · 音频（R4 ②）：设为角色音色 → setVoice 落到该角色，不产生 audio 资产 ── */
  function confirmSetVoice(roleId: string, voice: Voice) {
    setVoice(roleId, voice)
    const role = projectCharacters.find((c) => c.id === roleId)
    showToast(true, `已设为「${role?.name ?? '角色'}」的音色，复刻将在接入语音模型后生效`)
    setAudioNode(null)
  }

  function toggleFlyout(which: Exclude<Flyout, null>) {
    setFlyout((v) => (v === which ? null : which))
  }

  return (
    <div className={styles.wrap}>
      {/* ── 顶栏 ── */}
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <button className={styles.backBtn} onClick={() => navigate(`#/project/${pid}`)} aria-label="返回画布列表">
            ‹
          </button>
          <span className={styles.projName}>{project.name}</span>
          <span className={styles.sep}>|</span>
          <span className={styles.canvasName}>{canvas.name}</span>
          <span className={styles.syncDot} />
          <span className={styles.members}>👤 1</span>
          <span className={styles.syncTag}>已同步</span>
        </div>
        <div className={styles.topRight}>
          <button className={styles.memberShop}>🎁 会员超市</button>
          <span className={styles.infinity}>∞</span>
          <img className={styles.avatar} src={user.avatar} alt={user.name} />
        </div>
      </header>

      {/* ── 画板（铺满剩余空间） ── */}
      <div className={styles.stageArea}>
        <CanvasStage
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStageClick={() => {
            setSelectedId(null)
            setFlyout(null)
          }}
          onNodeMove={moveNode}
          onNodeUpload={(node) => setUploadNode(node)}
          onNodePreview={(node) => setPreviewNode(node)}
          onNodeContextMenu={(node, x, y) => setMenu({ node, x, y })}
          onDropAsset={onDropAsset}
        />

        {/* 左侧悬浮工具条 + 浮层 */}
        <div className={styles.dock}>
          <CanvasSidebar
            addActive={flyout === 'add'}
            folderActive={flyout === 'folder'}
            onToggleAdd={() => toggleFlyout('add')}
            onToggleFolder={() => toggleFlyout('folder')}
          />

          {flyout === 'add' && (
            <div className={styles.addMenu}>
              {ADD_MEDIA.map((m) => (
                <button key={m.media} className={styles.addItem} onClick={() => addNode(m.media)}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {flyout === 'folder' && (
            <div className={styles.panelFlyout}>
              <CanvasAssetPanel pid={pid} projectName={project.name} onUse={onUseAsset} onClose={() => setFlyout(null)} />
            </div>
          )}
        </div>

        {/* 底部缩放条（样式对齐截图，缩放为演示级：只改显示比例） */}
        <div className={styles.zoomBar}>
          <button className={styles.zoomIcon} title="定位" aria-label="定位">⊕</button>
          <button className={styles.zoomIcon} title="网格" aria-label="网格">▦</button>
          <span className={styles.zoomDivider} />
          <button className={styles.zoomIcon} onClick={() => setZoom((z) => Math.max(20, z - 10))} aria-label="缩小">－</button>
          <span className={styles.zoomVal}>{zoom}%</span>
          <button className={styles.zoomIcon} onClick={() => setZoom((z) => Math.min(400, z + 10))} aria-label="放大">＋</button>
        </div>
      </div>

      {/* 右键菜单（入口一闸门） */}
      {menu && (
        <NodeContextMenu
          node={menu.node}
          x={menu.x}
          y={menu.y}
          onSave={() => {
            // 音频节点走用途二选一弹窗（R4）；图片等其它媒介仍走原「保存到资产库」弹窗。
            if (menu.node.media === 'audio') setAudioNode(menu.node)
            else setUploadNode(menu.node)
            setMenu(null)
          }}
          onDelete={() => deleteNode(menu.node.id)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* 上传弹窗（入口一 · 图片等） */}
      {uploadNode && (
        <UploadToLibraryModal
          node={uploadNode}
          projectAssets={projectAssets}
          onConfirm={confirmUpload}
          onClose={() => setUploadNode(null)}
        />
      )}

      {/* 音频保存弹窗（入口一 · 音频 · R4：音频素材 / 角色音色 二选一） */}
      {audioNode && (
        <SaveAudioModal
          node={audioNode}
          characters={projectCharacters}
          onSaveAsset={confirmSaveAudioAsset}
          onSetVoice={confirmSetVoice}
          onClose={() => setAudioNode(null)}
        />
      )}

      {/* 预览灯箱：点节点右下角「预览」放大看图 */}
      {previewNode?.cover && (
        <div className={styles.lightbox} onClick={() => setPreviewNode(null)}>
          <img className={styles.lightboxImg} src={previewNode.cover} alt={previewNode.name} onClick={(e) => e.stopPropagation()} />
          <button className={styles.lightboxClose} onClick={() => setPreviewNode(null)} aria-label="关闭预览">×</button>
        </div>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>{toast.text}</div>
      )}
    </div>
  )
}
