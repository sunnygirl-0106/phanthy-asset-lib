<div align="center">

# 🎬 资产库 & 素材广场 · Demo

**面向 AIGC 影视创作的资产管理前端原型**
—— 从「权限规则」和「资产流转」这两块最硬的骨头啃起，先写一个*没有服务器的后端*，再在它上面搭界面。

[![Live Demo](https://img.shields.io/badge/在线预览-Live%20Demo-4cc2c4?style=for-the-badge)](https://sunnygirl-0106.github.io/phanthy-asset-lib/)

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/State-Zustand-443e38)
![Tests](https://img.shields.io/badge/tests-167%20passing-3fb950?logo=vitest&logoColor=white)

</div>

---

## 这是什么

一个「三层两世界」的数字资产库：**素材广场**（官方公开货架）、**团队资产库**（团队常驻母版）、**项目资产库**（单个项目在用的资产池）。用户在项目里用 AI 生成角色 / 服装 / 场景 / 道具，沉淀到团队库，再贡献到广场——资产在三层之间**只做拷贝**，权限、流转、审核都由一套可测的纯函数说了算。

> 🧪 **逻辑内核优先**：最重、最容易错的规则（谁能看 / 能改 / 能流转、生成顺序、成环检测）全部写成不碰 UI 的纯函数，用 **167 个断言**焊死；界面只是这套规则的"派生视图"。接真后端时，只需把 `services/` 内部换成接口调用，页面一行不动。

## ✨ 亮点

- **三层两世界 + 纯拷贝血缘**：`masterId` 只记"我从哪来"，不挂任何跟随/同步，副本天然独立。
- **流转的最小单位是图，不是资产**（0810）：上行出库携带图片快照，源资产事后改名/删图都不影响在途的那张。
- **参考槽两分**（0812）：参考分「图级槽」（用户挑的一张死图）和「资产级槽」（指向一份资产、随其定稿变化）。生成顺序不再是写死的流程，而是**依赖关系推导出的结果**——批量生成按拓扑分波，被参考的先出图。
- **生成前确认**：一个弹窗统一三个入口，参考状态用三态 pill 一眼讲清"为什么这行没被默认勾选"，不靠说教文案。
- **完整的账号 / 审核体系**：主账号 / 子账号 / 平台管理员三种角色，广场投稿审核、下架/重新上架、子账号存入审批全通。

## 🚀 在线预览

👉 **[sunnygirl-0106.github.io/phanthy-asset-lib](https://sunnygirl-0106.github.io/phanthy-asset-lib/)**

打开后**右下角切换账号**，看各层库随权限变化：切到子账号「小林」，她只看得到被分配的那个项目。
项目里角色初始为 0，点**左下角「演示」控件**跑三步动线即可长出资产：
`① 剧本分析 → ② 资产生成 → ③ 批量生成造型`。

## 🛠 本地跑起来

需要 Node 18+。

```bash
npm install       # 装依赖
npm run dev       # 启动开发服务器
npm test          # 跑 167 个规则断言
npm run typecheck # 只做类型检查
npm run build     # 生产构建
```

## 🧩 核心概念

**三层两世界**

| 层 | `Scope` | 是什么 |
|---|---|---|
| 素材广场 | `plaza` | 世界一 · 官方货架，全网可见。上架后不可编辑，只能删/下架/重传 |
| 团队资产库 | `team` | 世界二 · 团队跨项目的常驻母版库。**不能在这里生成**，只能从项目存入 |
| 项目资产库 | `project` | 世界二 · 单个项目在用的资产池。**唯一能生成图的地方** |

层与层之间是**纯拷贝**：`masterId` 只记录血缘，不挂任何同步/跟随行为。

**六个类目**：`character` 角色 / `costume` 服装 / `scene` 场景 / `prop` 道具 / `audio` 音频 / `other` 其他。前 5 类是可复用的生产要素，三层库结构一致；`other`（分镜 / 视频 / 剧本文本）只存在于项目库、不向上流转。

**资产状态机**（0810 简化）：`empty` 空壳 → `generating` 生成中 → `done` 成品（/ `failed` 失败）。
核心不变量：**图片列表非空 ⇔ 有且仅有一张定稿**——不存在"有图却没定稿"的中间态。

**参考槽两分**（0812）：

| | 指向 | 显示名字 | 会不会变 | 谁能建 |
|---|---|---|---|---|
| 图级槽 `image` | 一张具体的图 | 否 | 死的，永不变 | 仅用户 |
| 资产级槽 `asset` | 一份资产 | 是 | 活的，随上游定稿走 | 仅工作流 |

## 🏗 代码结构（数据 → 服务 → 状态 → 界面）

```
src/
  data/          【数据层】数据长什么样（TS 类型 = 活文档）
    types.ts       全部领域类型，含 AssetRef 参考槽（先读它）
    seed.ts        假数据 World：账号 / 团队 / 项目 / 资产
    demoProject.ts 演示脚手架「都市日常」8 份资产（交付时移除）
  services/      【服务层】模拟后端，规则都在这里，纯函数
    permission.ts    权限：谁能看 / 能改 / 能流转
    assetService.ts  流转 + 参考槽解析（resolveRefs / wouldCycle …）
    canvasService.ts 画布节点模型
  store/         【状态层】Zustand，currentUser + world，切账号 = 改一个指针
    useStore.ts      流转动作 + 批量生成（拓扑分波）
  pages/         Home / Plaza / Projects / TeamLibrary / ReviewCenter / Canvas / Workflow
  components/    AssetCard / AssetDetail / ProjectAssetLibrary / BatchGenerateModal / …
  tests/         5 个文件 · 167 个断言（vitest）
```

**推荐阅读顺序**：`types.ts` → `permission.ts` → `assetService.ts` → `tests/logic-core.test.ts`（这四个是"后端逻辑"），再看 `store/useStore.ts` → `pages/ProjectShell.tsx`（界面怎么用逻辑）。

## ✅ 测试

```bash
npm test
```

规则即测试：每个 `it("……")` 里的中文，就是它焊死的那条产品规则——权限矩阵、流转守卫、状态机不变量、参考槽两分、拓扑分波、成环检测、上游删除降级……全绿代表逻辑内核站得住。

## 📦 技术栈 & 部署

- **React 18 + TypeScript(strict) + Vite 5**，状态用 **Zustand**，测试用 **Vitest**，零 UI 框架（纯 CSS Modules）。
- 部署走 **GitHub Pages**（`.github/workflows/deploy.yml`，推 `master` 自动构建发布）。
  Vite `base` 从 CI 的 `GITHUB_REPOSITORY` 自动取仓库名，同一份代码推到不同仓库都能拿到正确子路径。

---

<div align="center">
<sub>PhantyMovie · 资产库设计原型 · 逻辑先行，界面随行</sub>
</div>
