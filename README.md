# 资产库 Demo · PhantyMovie

「资产库 & 素材广场」的前端 Demo。走**逻辑内核优先**的路线：
先把最重、最容易错的**权限规则**和**资产流转规则**写成干净可测的纯函数（"没有服务器的后端"），
再在它上面搭界面。

---

## 怎么跑起来

需要本机装了 Node（建议 18 以上）。在仓库根目录：

```bash
npm install       # 第一次：装依赖
npm run dev       # 启动，浏览器打开它给的地址
npm test          # 跑规则测试
npm run typecheck # 只做类型检查
npm run build     # 生产构建
```

打开后，**右下角切换不同账号**，看各层库里的资产跟着变。
切到子账号「小林」再看项目资产库，会发现她只看得到被分配的那个项目 —— 权限规则在界面上活起来了。

---

## 核心概念：三层两世界

| 层 | `Scope` | 是什么 |
|---|---|---|
| 素材广场 | `plaza` | 世界一 · 官方货架，全网可见。上架后不可编辑，只能删/下架/重传 |
| 团队资产库 | `team` | 世界二 · 团队跨项目的常驻母版库。**不能在这里生成**，只能从项目存入 |
| 项目资产库 | `project` | 世界二 · 单个项目在用的资产池。**唯一能生成图的地方** |

层与层之间是**纯拷贝**：`masterId` 只记录血缘（"我从哪来"），不挂任何同步/跟随行为。

**6 个类目**：`character` 角色 / `costume` 服装 / `scene` 场景 / `prop` 道具 / `audio` 音频 / `other` 其他。
前 5 类是可复用的生产要素，三层库结构一致；`other`（分镜图/视频/剧本文本）只存在于项目库，不向上流转。

**资产状态机**：`empty` 空壳 → `generating` 生成中 → `pending` 待定稿 → `done` 成品（/ `failed` 失败）。
红线：**只有 `done` 才能被复用 / 存入 / 贡献**。

---

## 代码结构（按"数据 → 服务 → 状态 → 界面"分层）

```
public/assets/           图片与音频资源，按三层库 + 项目分文件夹
src/
  data/                  【数据层】数据长什么样
    types.ts               全部 TS 类型 = 活文档（先读它）
    seed.ts                假数据 World：账号 / 项目 / 画布 / 资产
    presetVoices.ts        预置音色
    plazaWorks.ts          广场作品流
    pricing.ts             计费占位
    reviewReasons.ts       审核驳回/下架理由
  services/              【服务层】模拟后端：规则都在这里，纯函数
    permission.ts          权限：谁能看/能改/能流转
    assetService.ts        流转：复用 / 存入 / 贡献 / 生成
    canvasService.ts       画布节点模型
  store/                 【状态层】
    useStore.ts            currentUser + world（Zustand，切账号=改一个指针）
  layout/                  AppShell / TopBar / AvatarMenu
  pages/                   HomePage / PlazaPage / ProjectsPage / ProjectShell /
                           TeamLibraryPage / ReviewCenterPage / CanvasShell / WorkflowShell
  components/              AssetCard / AssetDetail / ProjectAssetLibrary /
                           各类弹窗 + canvas/ 画布组件
  tests/                   规则断言（vitest）
doc/
  archive/               历史文档与会议逐字稿（只读留档，不代表现行规格）
```

**推荐阅读顺序**：`types.ts` → `permission.ts` → `assetService.ts` → `tests/logic-core.test.ts`
（这四个是"后端逻辑"），再看 `store/useStore.ts` → `pages/ProjectShell.tsx`（界面怎么用逻辑）。

---

## 关于素材

图片放在 `public/assets/`，通过 `assetUrl()` 生成 URL，本地根路径与 GitHub Pages 子路径都能访问。

霓虹东京项目正在按「一份资产 4 张候选图」重做，目录结构见
`doc/霓虹东京-素材需求清单.md`。

`_to_delete/` 是清理时挪进来的孤儿文件暂存区（已 gitignore），确认无误后整个删掉。

---

## 当前进度

- ✅ 逻辑内核：领域模型 + 权限/流转纯函数 + 规则测试
- ✅ 三层库浏览、资产详情、流转动作（复用 / 存入 / 贡献）、改名
- ✅ 审核中心：广场投稿审核 + 下架/重新上架；子账号存入审批
- ✅ 项目工作流外壳 + 无限画布（节点、资产面板、保存回资产库）
- ✅ 候选池 / 定稿图结构（0803）
- 🚧 进行中：霓虹东京演示动线重做 —— 三步生成（剧本分析 → 资产生成 → 批量生成造型），
  每份资产 4 张候选、首张默认定稿、"必须有定稿"不变量

## 下一步

- 演员表裁到只剩霓虹东京，演示脚手架从 `seed.ts` 剥离
- 一次生成 4 张候选 + 首张自动定稿
- 角色造型参考图自动挂载（角色定稿 + 服装定稿）
- 真后端：把 `services/` 内部换成真实接口调用，页面不用动
