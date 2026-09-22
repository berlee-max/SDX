# SDX 首次代码审查与优化建议

> 审查对象：`/Users/ber/project/SDX`（源自 `cc-haha-main` 快照，上游桌面端 v0.6.5）
> 审查日期：2026-09-21
> 说明：所有数字均来自本次实际扫描，可复现。

---

## 一、项目是什么

一个**桌面端 AI 编程工作台**，由五块拼起来：

| 模块 | 位置 | 规模 | 作用 |
| --- | --- | --- | --- |
| CLI 内核 | `src/`（不含 server） | ~61 万行 | 从 Claude Code 源码修复而来的终端 Agent，Ink/React 渲染 TUI |
| 本地服务端 | `src/server/` | 354 文件 / 18 万行 | HTTP + WebSocket，桌面端和 H5 远程访问都连它，默认只绑 `127.0.0.1` |
| 桌面端 | `desktop/` | 918 文件 / 29 万行 | React 18 + Vite + Electron 42，**Electron 是唯一出货形态** |
| IM 接入 | `adapters/` | 126 文件 / 2.8 万行 | 飞书 / 钉钉 / 企微 / QQ / Slack / Telegram / WhatsApp |
| 原生辅助 | `native/cu-helper/`、`runtime/` | Swift 3.3 万行 + Python 3.4k 行 | macOS Computer Use 辅助进程（含签名链校验）、Windows 光标叠加 |

**总量**：3,756 个 TS/TSX 文件（其中 848 个测试文件）、约 113 万行代码。

**运行与打包链路**（这条链决定了第 5 步怎么做）：

```
bin/sdx ──> bun 运行 src/entrypoints/cli.tsx          （开发态 CLI）
desktop/sidecars/claude-sidecar.ts
   └─ bun build --compile ──> claude-sidecar-<triple>  （单文件二进制，含 bun runtime）
        └─ Electron 主进程按 server / cli / adapters 模式拉起
electron-builder ──> dmg+zip / nsis / AppImage+deb+rpm
```

**工程化水平比一般开源项目高**：有 quality-gate 体系（覆盖率棘轮 + 0.5% 回退阈值、测试隔离沙箱、打包冒烟、macOS 签名链验证、持久化升级校验）、6 条 GitHub workflow、CODEOWNERS、分层 `AGENTS.md`。Electron 安全姿势正确（`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` 全开）。

---

## 二、已完成的 SDX 化（第 2 步）

新目录 `/Users/ber/project/SDX`，已建 git 仓库，三个提交：

```
20ac321  chore: rebrand cc-haha to SDX (identity layer)
upstream-baseline  chore: import cc-haha-main snapshot as SDX baseline
```

原目录 `cc-haha-main` **完全没动**，可随时对照。重命名细节与刻意保留项见 [NOTICE.md](../../NOTICE.md)。

---

## 三、优化建议

### P0 — 挡住后续开发/发版的

**1. 本机没装 bun —— ✅ 已解决**

`packageManager` 指定 `bun@1.3.14`，`bin/sdx` 的 shebang 是 `#!/usr/bin/env -S bun`。现在已装，
版本对得上。注意这个版本号是**承重的**，不是随便写的——1.4.2 会让 `systemProxyBridge` 的竞态
测试必挂，详见 [git-workflow.md](git-workflow.md) 的工具链一节。

**2. `src/` 的 79 万行代码没有任何静态检查 —— 🟡 已能跑，尚未清零**

原始结论仍然成立，而且比当时写的更糟：根目录**根本跑不了 `tsc`**——`tsconfig.json` 里写的
`types: ["bun-types"]` 是个没安装的包（上游已改名 `@types/bun`），而且 devDependencies 里
压根没有 typescript。所以 `tsc -p tsconfig.json` 在读第一个源文件之前就失败了，没人跑得起来。

对比依然刺眼：`desktop/` 有 lint + tsc 车道，25 处 `any`；`src/` 没有车道，665 处 `any`，
外加 457 条 `eslint-disable`——因为根本没有 eslint，这些注释是死的。

已经做的（`build: make the CLI core's tooling runnable...`）：

- 装 `typescript@^5.9.3`（和 `desktop/` 对齐，两边诊断才可比）和 `@types/bun`
- 修掉 `tsconfig.json` 里那个指向不存在包的 `bun-types`
- 新增 `tsconfig.typecheck.json`（strict 关、skipLibCheck、只查 `src/**`）
- `bun run typecheck` 走棘轮：对着 `scripts/pr/typecheck-baseline.json` 里记的 **2498** 比，
  只升不降就失败，降了用 `--update` 锁进去

**2498 这个数被高估了**：其中 692 条是 TS2614「no exported member」，来自 `src/` 下
**137 个重构桩模块**（`export default stub; export const __stubMissing = true`，共 4658 行）。
从桩里 import 具名导出必然报错，这不是调用方能修的，得把桩补成真实现。

还没做：接进 PR 阻塞车道。等数字走低到大部分是真缺陷再接，否则每个不相干的 PR 都被 2498 条
噪音挡住。开 strict 更要等在这之后，一次开两个会把信号埋掉。

**3. 四个锁文件、三个包管理器并存 —— ✅ 已解决**

导入快照同时带了根目录的 `bun.lock` + `package-lock.json`，和 `desktop/` 的
`bun.lock` + `pnpm-lock.yaml`。**只有 bun 那两个在更新**，npm 和 pnpm 的文件一直冻在导入那次
提交上——所以同一份 `package.json`，取决于本地跑了哪个包管理器，会解析出不同的依赖树。
CI 全程 `bun install --frozen-lockfile`，那两个文件纯粹是等着被本地 `npm install` 捡起来的陷阱。

已删 `package-lock.json` 和 `desktop/pnpm-lock.yaml`，新增
`scripts/pr/lockfile-hygiene.test.ts`（已接入 `check:policy`）：bun 工作区里再冒出任何
非 bun 锁文件就失败。`site/package-lock.json` 保留并显式断言存在——它走
`npm --prefix site ci` 部署，是承重的。

---

### P1 — 结构与质量

**4. `desktop/src/stores/chatStore.ts` 7,986 行 / 71 个 action，测试文件 15,844 行**

`stores/` 下另外 69 个文件都是小 store，只有它是巨石。zustand 的 slice 模式在本仓库已有先例，建议按域拆：会话生命周期 / 消息流 / 工具调用与审批 / 运行时选择 / 草稿。拆分能直接改善两件事：改动冲突率、以及那个已经没人愿意读的 1.5 万行测试。

同类的还有 `desktop/src/components/chat/MessageList.tsx`（4,023 行 + 9,188 行测试）、`src/cli/print.ts`（5,830 行）、`src/utils/messages.ts`（5,782 行）、`src/screens/REPL.tsx`（5,016 行）、`src/server/ws/handler.ts`（4,953 行）。

**5. `src/utils/` 是个 765 文件 / 21.8 万行的杂物抽屉**

占全仓库代码量的 **27%**，名字却叫 "utils"。里面其实躺着完整的子系统：`bash/`（含 4,436 行的 bash 解析器）、`computerUse/`、`sessionStorage.ts`、`attachments.ts`、`hooks.ts`。建议把内聚的簇提升为有名字的领域目录（`src/shell/`、`src/session/`、`src/attachments/`），`utils/` 只留真正的无状态小工具。

**6. Agent 核心的测试覆盖率是全仓库最低的**

`scripts/quality-gate/coverage-thresholds.json` 里的现状 vs 目标：

| 区域 | 当前行覆盖 | 目标 | 差距 |
| --- | --- | --- | --- |
| `agent-utils`（`src/utils/`） | **14.42%** | 60% | −45.6 |
| `agent-tools`（`src/tools/`） | **17.10%** | 60% | −42.9 |
| `server-api` | 68.53% | 75% | −6.5 |
| `desktop` | 67.23% | 75% | −7.8 |
| `adapters` | 75.94% | 80% | −4.1 |

也就是说：最核心、最难调试、也最没有类型保护的那两块，恰好是覆盖率最低的。配合建议 2 一起补最划算。

**7. 一整套已死的 Tauri 外壳**

`desktop/src-tauri/src/` 有 3,090 行 Rust（`lib.rs` 2,774 行）、`Cargo.lock` 150KB、三份 `tauri.*.conf.json`。全仓库**没有任何** `cargo build` / `tauri build` 调用，出货的是 Electron。

麻烦的是它还没法直接删：`desktop/electron/services/sidecarManager.test.ts` 有一条 adapter flag 一致性测试，把 `src-tauri/src/lib.rs` 当成三个"启动路径"之一在读；而且 `src-tauri/` 同时是活的资源目录（`icons/` 468KB、`resources/` 228KB、`binaries/` 是 sidecar 产物路径）。

建议顺序：① 把资源移到 `desktop/build/assets/` 并改 `package.json` 的 `icon`/`files`/`asarUnpack` 路径 → ② 把 `sidecarManager.test.ts` 的三路校验改成两路 → ③ 删 `src-tauri/src/`、`Cargo.*`、`tauri.*.conf.json`、`build.rs`。

**8. 品牌收尾（本次刻意没做的部分）**

| 项 | 数量 | 为什么留着 | 怎么做 |
| --- | --- | --- | --- |
| `CC_HAHA_*` 环境变量 | 765 处 | 直接改会让所有现有配置和 CI 失效 | 加一层 `readEnv(name)`，先读 `SDX_*` 再回退 `CC_HAHA_*`，再批量改 |
| `~/.claude/cc-haha/` 用户数据目录 | — | 改名 = 老用户丢配置 | 走仓库已有的 `check:persistence-upgrade` 迁移机制 |
| `cc-haha-computer-use` + `dev.cchaha.cu-helper` | ~30 处 | 改 TCC 标识会重置 macOS 录屏/辅助功能授权 | 和一次大版本一起改，并在发版说明里提示重新授权 |
| PATH 注入标记 `# >>> SDX PATH >>>` | 已改 | 老用户 shell rc 里的旧标记块不会被新代码清理 | 在 `desktopCliLauncherService.ts` 里同时识别旧标记 |
| `github.com/NanmiCoder/cc-haha` 链接、更新 endpoint、SignPath 配置 | 215 处 | 改成不存在的仓库会让自动更新直接挂掉 | 等 SDX 有自己的仓库和证书后一次性切换 |

---

### P2 — 仓库瘦身

**9. `docs/` 图片瘦身 —— ✅ 已完成**

原状：`docs/` 99MB，其中 141 张 PNG + 12 张 JPG 占 92.6MB，最大单张 5.0MB。

已做：152 张 PNG/JPG 用 `cwebp -q 90 -m 6` 转成 webp，原图删除，**129 处引用**在
`docs/**/*.md`、两个 README 和 `site/` 里同步重写。

| | 之前 | 之后 |
| --- | ---: | ---: |
| `docs/` 图片 | 92.6 MB | 23.9 MB |
| `docs/` 整体 | 99 MB | 30 MB |

q90 的画质在 1:1 像素比对下与原图无可见差异（含流程图里的小字）。JPG 源文件收益较小
（有损再编码），PNG 流程图收益最大（2.24 MB → 134 KB）。

两个刻意的例外：

- `docs/public/images/banner.png` 保留 PNG —— 它是 `site/index.html` 的 `og:image`，
  微信、微博等平台对 webp 社交卡片支持不稳。
- `site/` 用 `/images/x.png` 这种**根路径**引用 `docs/` 下的图（见 `site/vite.config.js`
  的 docsManifestPlugin）。首轮重写漏了这条约定，由链接校验发现后补修。

验证：`npm --prefix site run check:docs` → *Documentation check passed: 99 pages,
342 local links and images, 25 bilingual app screenshot pairs.*

**关于"去重"：不需要做，而且做了也不省仓库体积。**

中英文档各存一份同样的图，转换后仍有 27 组完全重复、工作区多占 5.27 MB。但
**git 是按内容寻址的，相同内容只存一个 blob** —— 实测 `docs/internals/images/03-spawn-flow`
和 `docs/en/internals/images/03-spawn-flow` 在 git 里指向同一个对象。所以这 5.27 MB
只存在于工作区（占 1.4GB 检出的 0.4%），`.git`、clone 体积、推送流量都不受影响。

要消除它得让英文文档跨目录引用中文目录的图（`../../internals/images/...`），
而 `site/scripts/prepare-static-output.mjs` 只扫根路径形式的图片引用，跨目录相对路径
有打包漏拷的风险。**用 0.4% 的工作区空间换这个风险不划算，建议保持现状。**

**10. 根目录杂物**

`issue-triage-after-v0.5.5.md`（18KB 的临时分诊记录）建议移进 `docs/internals/` 或直接删；根目录的 `preload.ts` 只是给 CLI 注入 `MACRO` 常量，名字容易和 Electron 的 preload 混淆，建议改名 `src/bootstrap/cliMacros.ts`。

---

## 四、三端打包预检（为第 5 步铺路）

现有 release 矩阵已覆盖 6 个目标（mac arm64/x64、win x64/arm64、linux x64/arm64），底子是好的。按你要的三个版本逐个看：

### macOS — 基本就绪

`dmg` + `zip`、hardened runtime、entitlements、公证流程、签名链校验（host / sidecar / cu-helper 必须同证书同 team）全都有。**唯一硬需求是一张 Apple Developer ID 证书**（$99/年）+ App-specific password；没有的话只能出未签名包，用户首次打开要手动放行。

### Windows 10+ — 基本就绪

Electron 42 的最低要求正好是 Windows 10 1809+，与你的目标一致。NSIS 安装器已有中文路径冒烟测试、旧版数据恢复脚本。**需要替换的是签名**：当前走上游的 SignPath 项目，SDX 要么申请自己的 SignPath 开源项目，要么买 EV 代码签名证书，否则会有 SmartScreen 拦截。

### 统信 UOS — 有三个需要先确认的硬点

**a) glibc 版本（最可能踩的坑）**
CI 在 `ubuntu-22.04` 构建，对应 glibc 2.35。统信 UOS 桌面专业版 **20** 的基础是 Debian 10 一脉，glibc 是 2.28 —— 这种情况下 deb/AppImage 装上去会直接报 `GLIBC_2.3x not found`。UOS **23** 的 glibc 较新则没问题。

第一件事是在目标机器上跑：

```bash
ldd --version && cat /etc/os-release && uname -m
```

如果确实是 glibc 2.28，方案是在 Debian 10（或 UOS 官方 SDK 镜像）容器里构建 —— 这台机器已经装了 Docker 29.7.2，可以直接起。

**b) CPU 架构**
目前覆盖 x86_64 和 aarch64，对应海光/兆芯和鲲鹏/飞腾。**如果目标是龙芯 loongarch64 或申威，现在做不了**：Electron 和 bun 都没有官方 loongarch 构建，sidecar 那条 `bun build --compile` 链会直接断。这一点建议先跟需求方确认清楚再动手。

**c) 原生依赖与 deb 声明**
`node-pty`、`sharp`、`@ngrok/ngrok` 都是原生模块，必须有对应架构的预编译产物；bun 编译的 sidecar 也要按 triple 出。另外建议在 `build.linux` 里显式声明 deb 依赖（`libgtk-3-0`、`libnss3`、`libasound2`、`libxss1` 等），UOS 的默认桌面环境未必装全。

**建议**：第 5 步把 linux 目标从 `AppImage deb rpm` 收敛成 **deb 为主**（UOS 的主流分发格式）+ AppImage 作为免安装备选，rpm 暂时用不上。

---

## 五、建议的执行顺序

1. 装 bun → 跑通 `bun install` 和 `bun run verify`，拿到一份"当前基线到底绿不绿"的事实（这一步之前，上面所有改动都还没被任何测试验证过）
2. P0-2 类型检查 + P0-3 锁文件统一（一次 PR）
3. P2-9 文档图片瘦身（趁 git 历史还短）
4. P1-7 删 Tauri 死代码 → P1-4 拆 chatStore
5. UOS 目标机信息确认 → 决定容器构建方案 → 三端打包
