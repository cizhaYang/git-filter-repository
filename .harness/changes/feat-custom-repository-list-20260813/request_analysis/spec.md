# Spec: 自定义（固定）仓库列表

## 背景

用户的多仓库工作区（如 `/Users/a1/dev_code/acme-ordering-preorder`）在 `originSource/` 下嵌套了大量子仓库。`Changed Repositories` 当前**全量扫描 + 逐仓库跑 Git status**（`refreshRepositories` → `refreshFromGitStatus`），嵌套仓库过多时非常卡。

**核心诉求是性能**：用户只关心少数几个仓库（如 `originSource/acme/address`、`originSource/acme/stores`），希望**只关注固定的仓库**，其它嵌套仓库不参与扫描与刷新。

因此本功能核心 = **固定仓库列表 + 只扫固定仓库的扫描模式**，而非"在现有全量基础上附加常驻显示"。

## 范围（In Scope）

1. **扫描模式开关** `scmRepositoryFilter.scanMode: 'pinned' | 'all'`，**默认 `'pinned'`**。
   - `pinned`：只对固定列表中的仓库建 `GitRepositoryLike`、跑 status、挂文件监听；**其它嵌套仓库不扫描、不刷新**。固定列表为空时视图显示空的空态提示。
   - `all`：保持现有全量递归扫描行为（兼容旧用法/需要看全部时）。
2. **固定仓库列表** `scmRepositoryFilter.pinnedRepositories: string[]`，存**匹配模式**（如 `acme/address`）。持久化在 settings.json，可手动编辑、可随项目提交。**初始为空**，用户手动添加。
3. 纯逻辑（domain）：
   - 后缀匹配：把配置模式对仓库 root 做分段后缀匹配，产出 `matched / ambiguous / notFound`。
   - 对调用的两个语义：`pinned` 模式下"固定列表 → 实际要建/刷的仓库 roots"；`all` 模式下"改动 ∪ 固定"的可见合并。
4. `Changed Repositories` 渲染：
   - `pinned` 模式：只显示固定仓库，**常驻**，零改动也显示；条目用 **pin 图标**；有改动时 description 显示**改动数角标**（如 `2 changes`），**不自动展开**文件列表。
   - `all` 模式：显示"改动 ∪ 固定"，固定条目带 pin 图标。
5. 增删交互：
   - 标题栏 `+` → `scmRepositoryFilter.pinRepository` → 输入模式。后缀唯一命中即写入配置；0 命中报错；多命中 QuickPick 消歧（存相对路径）。
   - 固定条目右键 `Unpin Repository` → `scmRepositoryFilter.unpinRepository` → 移出配置。
6. 配置变化（`onDidChangeConfiguration`）即时生效：
   - `pinnedRepositories` 变化 → 重解析 + 重扫列表。
   - `scanMode` 变化 → 切换扫描策略并重建/刷新仓库集合。
7. 空匹配/空列表是合法状态：`pinned` 模式空列表显示空态文案，不报硬错误。

## 非目标（Out of Scope）

- **不**在 `pinned` 模式下做任何全量递归扫描（性能目标就是避免它）。但**必须**仍能解析输入模式去匹配仓库——匹配所需的仓库信息从哪来是实现要点（见「风险」，倾向依赖已建仓库快照 + 可选的一次性浅扫描）。
- **不**改 `WorkspaceRepositoryScanner` 本身的 BFS 算法（`all` 模式复用现状）。
- **不**支持 glob/正则/大小写不敏感——仅大小写敏感、以 `/` 分段的后缀匹配。
- **不**做列表排序、拖拽、重命名、分组。
- **不**改 `Changed Files` 视图：选中固定仓库后沿用既有行为（`pinned` 模式下靠角标体现改动数，文件列表仍可通过选中查看）。
- **不**新增 globalState/workspaceState 通道。

## 核心场景

**场景 A（pinned 模式,默认,性能优先）**
```
激活
  → 读 scanMode = 'pinned'
  → 读 pinnedRepositories = ['acme/address','acme/stores']
  → 解析模式 → 得到固定仓库 roots
  → 只对这些 root 建 repository / 跑 status / 挂监听（并发 ≤4）
  → 渲染：固定仓库常驻，pin 图标，有改动显示 N changes 角标
  → 其它嵌套仓库完全不碰
```

**场景 B（增删）**
```
(+输入 'acme/stores' → 唯一命中 → 写配置 → 监听触发 → 该仓库被扫描并显示)
固定条目右键 Unpin → 移出配置 → 若 scanMode=pinned 则该仓库立即从视图消失（不再扫描）
```

**场景 C（all 模式,兼容旧行为）**
```
scanMode='all'
  → 全量递归扫描（现有 refreshRepositories）
  → 渲染 改动∪固定，固定条目 pin 图标 + 常驻
```

## 验收标准（可程序化校验）

1. `npm run check` 退出码 0；`npm test` 退出码 0 且 `pass > 0`。
2. domain 纯函数单测 `test/unit/pinnedRepositories.test.cjs`：
   - 后缀唯一命中 / 多命中 ambiguous / 无命中 notFound。
   - 模式解析：空白项跳过、重复去重。
   - 可见合并去重：改动∩固定只出现一次；固定零改动在可见列表。
   - 角标改动数 = `countRepositoryChanges(state)`。
3. `package.json`：
   - `contributes.configuration` 含 `scmRepositoryFilter.scanMode`（enum `['pinned','all']`, default `pinned`）与 `pinnedRepositories`（array of string, default `[]`）。
   - `contributes.commands` 含 `pinRepository`、`unpinRepository`。
   - `menus.view/title` 挂 pin 到 `changedRepositories`；`menus.view/item/context` 挂 unpin（`when: viewItem == pinnedRepository`）。
4. `extension.ts` `registerCommand` 两条命令字符串与 `package.json` 一致（`extensionManifest.test.cjs` 交叉校验）。
5. provider 单测（`test/unit/changedRepositories*.test.cjs` 现有文件扩展）覆盖：`pinned` 模式下 `getChildren` 只返回固定仓库、零改动也渲染、不触发全量扫描路径；`all` 模式返回改动∪固定。
6. `npm run harness:doctor` 通过（两条命令已登记 `wiki/architecture.md` 扩展点表 + 配置项说明）。
7. 分层红线不破：新增 domain 纯函数不 import `vscode`、无副作用、无 `child_process`；匹配不跑 Git。

## 风险与权衡

- **pinned 模式输入如何匹配仓库（关键设计点）**：
  - 方案：`pinRepository` 命令匹配时使用**已建的固定仓库快照**；若快照为空/不足以消歧，做**一次性浅层扫描**（`scan()` 复用现有 scanner，最多跑一两次）以获得当前工作区仓库 roots 候选。这不违背性能目标——浅扫描只在添加操作时发生，不是每次渲染/刷新。
  - 权衡：牺牲"输入即全量即时匹配"的即时性，换取常驻刷新阶段零全量扫描。可接受。
- **性能**：`pinned` 模式刷新只遍历固定仓库（通常几个），把每轮全量 status 的开销降到常量级；并发 ≤4，`withProgress` 背景化。
- **模式歧义**：多命中用 QuickPick 消歧，写入更具体相对路径。
- **配置脏数据**：空白/非法项跳过、计入 notFound 静默忽略，不崩溃。
- **空列表**：`pinned` 模式空固定列表合法，显示空态提示，不报错。
- **`all` 模式无全量扫描性能变化**：仅附加固定常驻,这是特定期望。
