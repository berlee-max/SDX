# SDX 基线验证状态

> 环境：macOS 15（Darwin 24.6.0，arm64）· bun 1.3.14（= `packageManager` 声明的版本）· node v26.8.1
> 分支：`main` · 日期：2026-09-21 · 上游基线：tag `upstream-baseline`

这份文档记录 **SDX 刚建仓时各条质量车道的真实状态**。目的只有一个：
以后有人看到某个测试是红的，能立刻分清"我刚改坏的"还是"本来就红的"，
不用再从头对照上游。

判定方法：对 `upstream-baseline`（未经任何改动的上游快照）建 git worktree，
共用同一份 `node_modules`，同一条命令在两边各跑一次，比较失败数。

> `upstream-baseline` 是个 **tag**，不是 commit hash。首次 push 前仓库做过一次
> `git filter-repo`（把 92.6MB 的原始文档图片从历史里剔除），所有 commit hash 都换了；
> 用 tag 引用就不会再被这类操作打断。

---

## 一、总览

| 车道 | 命令 | 结果 |
| --- | --- | --- |
| 策略与打包 | `bun run check:policy` | ✅ 330 pass / 0 fail |
| IM adapters | `bun run check:adapters` | ✅ 747 pass / 0 fail |
| 桌面端 | `bun run check:desktop` | ✅ eslint + tsc + vitest + vite build 全绿 |
| Electron 主进程 | `bun run check:electron` | ✅ tsc + 575 tests + bundle 全绿 |
| CLI / 服务端 | `bun run check:server` | ⚠️ 447 文件 / 5489 pass / **27 fail（10 个文件）** |

**结论：唯一的红是 `check:server` 里 27 个失败，全部继承自上游，与 SDX 改名无关。**

## 二、改名造成的回归（已全部修复）

建仓过程中改名一共引入 3 处回归，都被仓库自带的门禁抓到了：

| 文件 | 问题 | 提交 |
| --- | --- | --- |
| `scripts/quality-gate/package-smoke/index.test.ts` | 测试靠"带空格的产品名"与"带连字符的安装包名"不同来模拟"更新元数据指向缺失文件"；单词产品名让两者塌缩成同一个字符串，断言失效 | `chore: establish SDX 0.1.0 version line and dev workflow` |
| `src/server/__tests__/mac-installed-apps.test.ts` | 断言的是按显示名排序的列表；`Claude Code Haha` 排第一，`SDX` 排到了 `Notes` 之后 | `fix(test): restore sorted order in the macOS installed-app expectation` |
| `package.json` `packageManager` | 把 bun 提到 1.4.2 导致 `systemProxyBridge` 竞态用例超时；1.3.14 下全绿。已回退并写进 [git-workflow.md](git-workflow.md) | `revert: keep bun pinned at 1.3.14` |

顺带修掉一个继承的缺陷：`src/vendor/computer-use-mcp/toolCalls.test.ts` 重复 import 了
`bindSessionContext`，Bun 转译器拒绝该文件，导致 `check:policy` 的死代码分析器把它判为
"无法分析"而整条车道失败（`fix: unbreak the dead-import analyser on the computer-use vendor tests`）。

## 三、继承的失败清单（27 个 / 10 个文件）

下面每一条都已确认在 `upstream-baseline` 上以**完全相同的数量**失败。

| 文件 | 失败数 | 表现 |
| --- | ---: | --- |
| `src/server/__tests__/searchService.sessions.test.ts` | 9 | 搜索结果条数与内容不符预期 |
| `src/server/__tests__/e2e/business-flow.test.ts` | 5 | Agent 创建 / 列举流程断言失败 |
| `src/utils/permissions/PermissionUpdate.test.ts` | 3 | `permissionSetupModule.transitionPermissionMode is not a function` |
| `src/server/__tests__/e2e/full-flow.test.ts` | 2 | 同上，Agent 创建链路 |
| `src/server/__tests__/sessions.test.ts` | 2 | slash-command 合并；另有 `simulated unlink failure` |
| `src/server/services/workspaceWatch.test.ts` | 2 | `Timed out waiting for filesystem event`（2s 超时，疑似 macOS FSEvents 环境相关） |
| `src/tools/AgentTool/loadAgentsDir.cache.test.ts` | 1 | `toContainEqual` 不匹配 |
| `src/tools/AgentTool/loadAgentsDir.effort.test.ts` | 1 | 同上 |
| `src/tools/AgentTool/loadAgentsDir.protocol.test.ts` | 1 | 同上 |
| `src/server/__tests__/settings.test.ts` | 1 | output-styles 列表不含预期项 |

看起来至少有两簇共同根因，值得当成两个独立任务处理：

1. **Agent 目录加载**：`loadAgentsDir.*`（3）+ `business-flow`（5）+ `full-flow`（2）= 10 个失败
   都围绕 agent 的创建与枚举，很可能是同一处回归。
2. **`transitionPermissionMode` 缺失**：3 个失败指向同一个不存在的导出，像是重构后没跟上的 mock。

剩下的 `searchService`（9）、`workspaceWatch`（2）、`settings`（1）、`sessions`（2）需要各自定位。

## 三点五、历史重写记录

首次 push 前后各做过一次 `git filter-repo`，两次都把 commit hash 全换了：

1. 剔除 92.6MB 原始文档图片（webp 转换后的死重量）
2. 剔除一个 55.37MB 的 `.bun-build` 构建临时文件 —— 它在 `fix: unbreak the dead-import
   analyser on the computer-use vendor tests` 里被 `git add -A` 误收进来，而忽略规则是下一个
   提交才加的。这一个文件曾占整个仓库的 67%。

**所以本文档一律用 tag 和提交标题引用，不用 hash。** 往仓库根目录跑 `bun build` 会留下
`.<hash>-00000000.bun-build`，`.gitignore` 已覆盖，但提交前还是看一眼 `git status`。

## 四、复现对照的方法

```bash
# 建一个上游原始快照的 worktree，共用 node_modules
git worktree add --detach /tmp/baseline-wt upstream-baseline
ln -s "$PWD/node_modules" /tmp/baseline-wt/node_modules

# 同一个文件两边各跑一次
bun test src/server/__tests__/settings.test.ts
(cd /tmp/baseline-wt && bun test src/server/__tests__/settings.test.ts)

# 用完清理
git worktree remove --force /tmp/baseline-wt
```

## 五、尚未跑过的车道

这些需要额外条件，建仓时没跑，不在上面的结论范围内：

| 车道 | 缺什么 |
| --- | --- |
| `check:swift` | 需要在 macOS 上编译 `native/cu-helper`（本机有 Swift 6.2.4，只是没跑） |
| `check:native` | 需要完整的 sidecar 编译 + electron 打包，耗时较长 |
| `check:coverage` | 覆盖率棘轮，需要先跑完整测试收集覆盖率数据 |
| `check:docs` | 需要 `npm --prefix site ci` |
| `quality:providers` / `quality:smoke` | 需要真实模型凭据，属于维护者手动验证 |
