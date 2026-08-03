# 改动任务 · 把画布「保存到资产库」的三个弹窗统一成一个（方案二）

> 这是一次**交互重构**，不改任何业务规则、不改权限、不改数据流向。
> 目的：把当前按媒介分叉的三种保存形态，收敛成一个统一的心智模型。
> 这一版是**给产品同学做 A/B 对比用的**，请务必先开分支。

---

## 0. 第一步：开分支

```bash
git switch -c feat/unified-save-modal
```

产品同学要在这个分支和 `main` 之间来回切着看效果，所以：
- 不要动 `main`；
- 不要删除现有的 `UploadToLibraryModal.tsx` / `SaveAudioModal.tsx` 文件（新组件另起一个文件，旧的留在原地不引用即可，方便对比和回退）。

---

## 1. 为什么要统一（读懂这段，后面的规格就是自然结论）

现在画布上右键「保存到资产库」，会因为节点媒介不同出现三种完全不一样的界面：

| 节点媒介 | 现在看到的 |
|---|---|
| 图片 | 类目瓷砖弹窗（角色/道具/服装/场景 + 其他），选完类目还要选「新建 / 关联已有」 |
| 音频 | 完全不同的二选一弹窗（音频素材 / 角色音色），各带各的表单 |
| 视频、文本 | 简版命名弹窗（只有名称输入） |

用户要学三次。而这三件事本质上问的是同一个问题：

> **「这个东西叫什么名字，要存到哪儿去。」**

关键洞察是：**「角色音色」和「关联已有」其实是同一个形状**——都是"把这个东西挂到一个已经存在的资产身上"。

- 图片 + 关联已有 → 挂到某个角色/场景下，成为它的一张造型/样式
- 音频 + 角色音色 → 挂到某个角色上，成为它的音色

既然形状相同，就该长得一样。统一后用户只需要学一次：**填名字 → 选去处 →（如果这个去处需要）挑一个挂载目标。**

---

## 2. 统一后的交互规格

### 2.1 弹窗结构（永远是这三段）

```
┌────────────────────────────────────┐
│ 保存到资产库                    ✕  │
├────────────────────────────────────┤
│ ① 名称 *        [____________]     │
│                                    │
│ ② 存到哪里                          │
│    [ 瓷砖 ] [ 瓷砖 ] [ 瓷砖 ] …     │
│                                    │
│ ③ （选中的去处需要挂载目标时）       │
│    浮层里挑一个已有资产              │
├────────────────────────────────────┤
│                  [取消]  [确认添加] │
└────────────────────────────────────┘
```

### 2.2 「存到哪里」按媒介给出不同去处

| 节点媒介 | 可选去处 |
|---|---|
| 图片 | 角色 / 道具 / 服装 / 场景 ⎸ 其他 |
| 音频 | 音频素材 ⎸ 角色音色 |
| 视频 | 其他（唯一） |
| 文本 | 其他（唯一） |

**「其他」和「角色音色」都要在视觉上与前面的项拉开**（分隔线或独立成行），因为它们是"另一层东西"：前者是创作留存物、不参与流转，后者根本不产生资产。沿用 `UploadToLibraryModal.module.css` 里已有的 `tileWrapOther` / `otherHint` 那套做法即可。

**去处唯一时不问**（这条规则已在 `main` 上实现，务必保留）：视频/文本只有「其他」一个去处，此时**不渲染瓷砖区**，标题写「保存到资产库 · 其他」，直接填名字。

### 2.3 每个去处选完之后要不要二级选择

| 去处 | 二级 | 说明 |
|---|---|---|
| 角色 / 道具 / 服装 / 场景 | 新建 ⎸ 关联已有 | 选「关联已有」再挑同类目的已有资产（现状逻辑，不变） |
| 其他 | 无 | 直接视为新建（没有子资产概念） |
| 音频素材 | 无 | 直接视为新建（音频的「关联已有」已废弃，服务层有守卫） |
| **角色音色** | **必选目标角色** | 形状同「关联已有」，只是目标限定为本项目的角色 |

### 2.4 名称字段的语义随去处变

- 去处 = 角色音色 → label 显示「音色名称」，placeholder `如：男主 · 磁性低音`
- 去处 = 其他 → placeholder `如：第一幕分镜 / 追逐戏片段 / 开场台词`
- 其余 → 保持现有文案

预填规则沿用现状：去处唯一时预填 `node.name`，否则留空。

### 2.5 角色音色必须保留的两条提示（从 SaveAudioModal 原样搬过来，别丢）

- **防呆**：若 `node.source?.assetId === 选中的角色 id`，说明这段音频本来就是该角色音色生成的，显示「这段音频由该角色的音色生成，无需再设为音色」，并禁用确认按钮；
- **替换提示**：若所选角色已有音色，显示「将替换现有音色「{voice.name}」。」

---

## 3. 代码契约

### 3.1 新增：去处的单一真相（放进 `src/services/canvasService.ts`）

```ts
/**
 * 去处 = 类目 + 一个特殊项 'voice'（角色音色，不产生资产、只挂到角色身上）。
 * 这是 UI 的"存到哪里"瓷砖的唯一真相，与 categoriesForMedia 并列。
 */
export type Destination = Category | 'voice'

export function destinationsForMedia(media: Media): Destination[] {
  if (media === 'image') return ['character', 'prop', 'costume', 'scene', 'other']
  if (media === 'audio') return ['audio', 'voice']
  if (media === 'video') return ['other']
  if (media === 'text') return ['other']
  return []
}
```

> 判断依据写进注释：**一个媒介能去哪儿，看它有没有属于自己的类目**。音频有「音频」类目，所以永远不进「其他」；视频和文本没有，所以只能进「其他」。

### 3.2 新增组件 `src/components/SaveToLibraryModal.tsx`

只负责收集用户选择，**不直接调 store**，通过一个可辨识联合把意图交给上层（与现有两个弹窗的职责边界一致）：

```ts
export type SaveIntent =
  | { kind: 'asset'; spec: SaveSpec }                    // → runSaveToProject
  | { kind: 'voice'; roleId: string; voice: Voice }      // → setVoice
```

Props：

```ts
{
  node: CanvasNode
  projectAssets: Asset[]      // 「关联已有」按类目挑目标
  characters: Asset[]         // 「角色音色」挑目标角色
  onConfirm: (intent: SaveIntent) => void
  onClose: () => void
}
```

内部要原样搬运的既有逻辑（**不要重写，照抄**）：
- `otherExtraFields()`：「其他」落库时把 `media` / `text` / `videoUrl` 写进 `fields`（来自 `UploadToLibraryModal`）；
- 构造 cloned `Voice` 的那段（`id: cloned_${Date.now()}`、`previewUrl`/`sampleUrl` 取 `node.content`、`providerVoiceId: undefined`）（来自 `SaveAudioModal`）。

### 3.3 `src/pages/CanvasShell.tsx`

- 删掉 `uploadNode` / `audioNode` 两个 state，合并为一个 `saveNode`；
- `openSaveFor(node)` 简化为 `setSaveNode(node)`（不再按媒介分流——统一了就没有分流这回事了）；
- 新增 `confirmSave(intent: SaveIntent)`，按 `intent.kind` 分派到原有的 `runSaveToProject` / `setVoice`，**成功提示与"展开左侧资产库面板"的行为原样保留**（现在两条路径各有一份，合并时别丢）。

---

## 4. 不要改的

- `src/services/permission.ts`、`assetService.ts` 的任何规则
- `categoriesForMedia` 的返回值（`destinationsForMedia` 是**新增**，不是替换；服务层校验仍走 `categoriesForMedia`）
- 音频不进「其他」这条约束
- `saveCanvasNodeToProject` 里的三条守卫（媒介↔类目相容、音频不许 link、其他不许 link）
- 库页面（团队库 / 项目库 / 广场）的任何代码

---

## 5. 验收清单

- [ ] 图片节点：弹窗出现 5 个去处，前四个可选「新建/关联已有」，「其他」直接新建且视觉上与前四个隔开
- [ ] 音频节点：弹窗出现「音频素材」「角色音色」两个去处，**样式与图片节点那套瓷砖完全一致**（这是本次重构的核心观感目标）
- [ ] 选「角色音色」→ 浮层里挑角色，交互形状与「关联已有」挑目标一致
- [ ] 角色已有音色时出现替换提示；音频来源就是该角色时出现防呆提示且不能确认
- [ ] 存为角色音色**不产生 audio 资产**，角色详情音色栏正确更新
- [ ] 视频 / 文本节点：不出现瓷砖区，标题「保存到资产库 · 其他」，只填名字
- [ ] 节点上的「上传」按钮与右键菜单「保存到资产库」进入**同一个弹窗**
- [ ] 存完之后左侧资产库面板自动展开、能当场看到新资产（两条路径都要）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 通过；`src/tests/canvas-entry.test.ts` 补 2 条：`destinationsForMedia` 对四种媒介的返回值、音频的去处里不含 `'other'`

---

## 6. 做完之后

在终端打印一句对比指引给产品同学：

```
方案一（现状）：git switch main
方案二（本分支）：git switch feat/unified-save-modal
演示动线：画布 → 左侧「+」加一个图片节点 / 音频节点 / 视频节点 → 右键「保存到资产库」，对比三种媒介下弹窗的一致性。
```
