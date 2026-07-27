/**
 * 【画布 · 入口二】CanvasAssetPanel —— 左侧资产库面板（三层可拖）
 *
 * 展示范围（技术规划 §2.2）：本项目的 项目库 + 团队库 + 素材广场，三层都可见可拖。
 * 把资产拖到画布只是"拿来用/比划"，不进项目库、不产生副本（副本只在"上传"那一刻产生）。
 * 角色的挂载单位是造型：拖角色时可拖它的素模或某一个造型（各自是一个可拖项）。
 *
 * 拖拽用 HTML5 DnD：这里只在 dragstart 往 dataTransfer 塞一个载荷；
 * 落到画布（CanvasStage 的 onDrop）时再由上层据此造一个节点。
 */

import { useState } from 'react'
import type { Scope, Asset } from '../../data/types'
import type { Media } from '../../services/canvasService'
import { useStore, useCurrentUser } from '../../store/useStore'
import { canSee } from '../../services/permission'
import styles from './CanvasAssetPanel.module.css'

/** 拖拽载荷：落到画布时用它造节点。 */
export interface DragPayload {
  scope: Scope
  assetId: string
  media: Media
  name: string
  cover?: string
}

export const DRAG_MIME = 'application/x-phanty-asset'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'project', label: '项目库' },
  { key: 'team', label: '团队库' },
  { key: 'plaza', label: '广场' },
]

function mediaOf(asset: Asset): Media {
  return asset.category === 'audio' ? 'audio' : 'image'
}

export function CanvasAssetPanel({ pid }: { pid: string }) {
  const world = useStore((s) => s.world)
  const user = useCurrentUser()
  const [scope, setScope] = useState<Scope>('project')

  const items = world.assets
    .filter((a) => canSee(world, user, a))
    .filter((a) => {
      if (scope === 'project') return a.scope === 'project' && a.scopeId === pid
      return a.scope === scope
    })

  function startDrag(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.scopes}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            className={`${styles.scopeBtn} ${scope === s.key ? styles.scopeOn : ''}`}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className={styles.tip}>拖资产到画布 = 拿来用（不入库、不产副本）</p>

      <div className={styles.list}>
        {items.length === 0 && <div className={styles.empty}>这一层暂无可见资产</div>}

        {items.map((a) =>
          a.category === 'character' ? (
            <CharacterGroup key={a.id} char={a} scope={scope} onDrag={startDrag} />
          ) : (
            <div
              key={a.id}
              className={styles.item}
              draggable
              onDragStart={(e) => startDrag(e, { scope, assetId: a.id, media: mediaOf(a), name: a.name, cover: a.cover })}
            >
              <img className={styles.thumb} src={a.cover} alt={a.name} />
              <span className={styles.itemName}>{a.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** 角色组：素模 + 各造型，每个都是独立可拖项（挂载单位是造型）。 */
function CharacterGroup({
  char,
  scope,
  onDrag,
}: {
  char: Asset
  scope: Scope
  onDrag: (e: React.DragEvent, payload: DragPayload) => void
}) {
  const [open, setOpen] = useState(false)
  const looks = char.looks ?? []

  return (
    <div className={styles.charGroup}>
      <button className={styles.charHead} onClick={() => setOpen((v) => !v)}>
        <img className={styles.thumb} src={char.cover} alt={char.name} />
        <span className={styles.itemName}>{char.name}</span>
        <span className={styles.caret}>{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className={styles.subList}>
          {/* 素模 */}
          <div
            className={styles.subItem}
            draggable
            onDragStart={(e) =>
              onDrag(e, { scope, assetId: char.id, media: 'image', name: `${char.name}·素模`, cover: char.baseModel ?? char.cover })
            }
          >
            <img className={styles.subThumb} src={char.baseModel ?? char.cover} alt="素模" />
            <span className={styles.subName}>素模</span>
          </div>
          {/* 各造型 */}
          {looks.map((l) => (
            <div
              key={l.id}
              className={styles.subItem}
              draggable
              onDragStart={(e) => onDrag(e, { scope, assetId: char.id, media: 'image', name: l.name, cover: l.cover })}
            >
              <img className={styles.subThumb} src={l.cover} alt={l.name} />
              <span className={styles.subName}>{l.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
