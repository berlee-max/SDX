# SDX 开发与版本控制约定

本文是 SDX 仓库的开发流程约定。代码层面的规范（TypeScript 风格、测试要求、用户状态安全）沿用
根目录 [AGENTS.md](../../AGENTS.md) 和各目录下的嵌套 `AGENTS.md`，本文只讲 **git 怎么用** 和 **版本怎么发**。

---

## 〇、工具链

**bun 的版本必须是 `package.json` 里 `packageManager` 声明的那个**（当前 `bun@1.3.14`）。
CI 通过 `bun-version-file: package.json` 读同一个字段，所以本地和 CI 用的是同一个版本。

这不是形式主义。`brew install bun` 装的是最新版，实测 **bun 1.4.2 会让
`desktop/electron/services/systemProxyBridge.test.ts` 的 "stop races with startup"
用例超时失败**（1.3.14 下 18/18 全过）—— 那段代码依赖 bun HTTP server 的关闭语义，
源码里就有相关注释。升 bun 是一项独立任务，需要单独验证，不能顺手带上。

装指定版本：

```bash
curl -fsSL -o /tmp/bun.zip https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-darwin-aarch64.zip
unzip -o /tmp/bun.zip -d /tmp && mkdir -p ~/.bun/bin && cp /tmp/bun-darwin-aarch64/bun ~/.bun/bin/bun
```

然后把 `~/.bun/bin` 放到 `PATH` 里 homebrew 之前：

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
```

安装依赖（三个 workspace 各装各的）：

```bash
bun install && (cd desktop && bun install) && (cd adapters && bun install)
```

---

## 一、分支模型

单主干 + 短生命周期特性分支。不用 git-flow，没有长期 develop 分支。

```
main                    ← 始终可构建、可发版
 ├── feat/xxx           ← 新功能
 ├── fix/xxx            ← 缺陷修复
 ├── docs/xxx           ← 只改文档
 ├── chore/xxx          ← 构建、依赖、脚手架
 └── refactor/xxx       ← 不改行为的重构
```

规则：

- **不直接往 `main` 提交**（脚手架期和紧急修复除外）。每个改动开一个分支，合并前自测。
- 分支前缀用上面五个之一 —— 上游的 `.github/workflows/pr-triage.yml` 会按前缀和改动路径自动打
  `area:*` 标签，前缀写对了才有效。
- **不要建 `codex/` 前缀的分支**，`AGENTS.md` 明确禁止。
- 分支合并用 `--no-ff`，保留特性分支的边界；或者在 GitHub 上用 squash merge。

## 二、提交信息

Conventional Commits，主题行用祈使句、不加句号：

```
feat(desktop): 会话列表支持按项目分组
fix(server): 修复 WebSocket 重连后丢失待审批工具调用
chore: 统一锁文件到 bun
docs(sdx): 补充统信 UOS 构建说明
refactor(stores): 把 chatStore 拆成 5 个 slice
```

常用 type：`feat` / `fix` / `docs` / `chore` / `refactor` / `test` / `perf` / `build` / `release`。

正文写**为什么**，不写**改了什么**（改了什么看 diff 就知道）。涉及取舍、兼容性、已知风险的，
在正文里交代清楚。

## 三、提交前的检查

仓库自带一套分层的质量门禁，**按改动路径自动选车道**：

```bash
bun run check:impact     # 看这次改动需要跑哪些检查（路径 + import 图分析）
bun run verify           # 跑上面选中的全部车道，等同 quality:pr
bun run quality:push     # 同上但跳过覆盖率，适合推分支前快速过一遍
```

`check:impact` 默认拿 `origin/main` 当基线，**在还没有 remote 的时候它会报 "Changed files: 0"**。
本地比较用环境变量指定基线：

```bash
PR_BASE_REF=main bun run check:impact
```

单项车道（调试失败时用，比全量快得多）：

| 命令 | 覆盖范围 |
| --- | --- |
| `bun run check:server` | `src/server/` 的接口与 WebSocket 测试 |
| `bun run check:desktop` | desktop 的 lint + vitest + vite build |
| `bun run check:electron` | Electron 主进程的 tsc + 测试 |
| `bun run check:adapters` | IM adapters |
| `bun run check:policy` | CI 策略脚本自身的测试 |
| `bun run check:coverage` | 覆盖率棘轮（回退超过 0.5% 就失败） |

装上仓库自带的 pre-push 钩子（目前是**非阻塞提醒**，不会拦住 push）：

```bash
bun run hooks:install
```

**硬性要求**（来自 `AGENTS.md`）：`src/`、`desktop/src/`、`adapters/` 下的可执行 JS/TS 改动，
必须配同区域的回归测试。修 bug 时先写一个会失败的测试，再修。

## 四、版本与发版

**版本号的唯一来源是 `desktop/package.json` 的 `version`**，`scripts/release.ts` 只认它。
SDX 的版本线从 **0.1.0** 开始，与上游的 0.6.5 无关。

发一个版本：

```bash
# 1. 先写发版说明（没有这个文件，release.ts 会直接退出）
vim release-notes/v0.2.0.md

# 2. 预演，确认要改哪些文件
bun run scripts/release.ts minor --dry

# 3. 实际执行：改版本号 + 建 commit + 打 tag（不会自动 push）
bun run scripts/release.ts minor

# 4. 确认无误后推送，tag 会触发 release-desktop workflow
git push origin main --tags
```

版本递增约定：

- `patch`（0.1.0 → 0.1.1）：只有修复，没有新功能
- `minor`（0.1.0 → 0.2.0）：有新功能，向后兼容
- `major`（0.x.y → 1.0.0）：不兼容变更，或者认为产品成熟了

**持久化变更的额外要求**：任何改动了落盘 JSON、`localStorage`、应用配置结构的版本，
必须写前向迁移 + 旧数据 fixture 的回归测试，并跑 `bun run check:persistence-upgrade`。
这条不遵守，用户升级时会丢数据。

### 签名与公证：发版前必须先配好的 5 个 secret

`release-desktop.yml` 的 macOS 任务在打包前会先检查凭据，缺任何一个就直接退出——这是
刻意的，一次发版里一半产物签了一半没签，比整个失败更难收拾。

目前仓库里**一个 secret 都没配**，所以从 tag 触发的发版会停在这一步。需要在
Settings → Secrets and variables → Actions 里加：

| Secret | 是什么 |
| --- | --- |
| `MACOS_CERTIFICATE` | Developer ID Application 证书导出的 `.p12`，base64 之后的内容 |
| `MACOS_CERTIFICATE_PASSWORD` | 导出那个 `.p12` 时设的密码 |
| `APPLE_ID` | 开发者账号邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → 登录与安全 → App 专用密码 |
| `APPLE_TEAM_ID` | 10 位 Team ID |

`SIGNPATH_API_TOKEN` 是 Windows 签名用的，那条路还没走通（见
[代码签名说明](../start/code-signing.md)），没有它 Windows 产物就是未签名的，不影响发版本身。

本地打一个签名 + 公证的包（凭据从 `.env` 读，`.env` 在 `.gitignore` 第一行）：

```bash
set -a && . ./.env && set +a
NOTARIZE=1 bash desktop/scripts/build-macos-arm64.sh
```

`NOTARIZE=1` 会走两趟 Apple 队列：一趟给 `.app`，一趟给 `.dmg`。第二趟是必要的——
`electron-builder` 只公证 `.app`，它产出的 `.dmg` 是未签名的，`spctl` 对它的判定是
`no usable signature`。脚本跑完会自己用 `stapler validate` 和 `spctl` 验一遍，验不过就失败。

首次提交给 Apple 的那一次可能要等 40 分钟以上，之后同一个 team 通常几分钟就回来。

## 五、接远程仓库

本仓库当前**只有本地历史**。接 GitHub 私有仓库：

```bash
gh auth login                                    # 交互式，需要你自己跑
gh repo create SDX --private --source=. --remote=origin
git push -u origin main
```

推之前留意两件事：

1. **仓库体积**。已在首次 push 前完成图片瘦身（`docs/` 99MB → 30MB，见
   [optimization-review.md](optimization-review.md) P2-9）。以后往 `docs/` 加图请直接提交
   webp：`cwebp -q 90 -m 6 in.png -o out.webp`。
2. **上游残留的发布配置**。`desktop/package.json` 的 `publish` 段、`build.linux.maintainer`、
   `homepage`、以及 `.github/signpath/` 仍指向上游的仓库和签名项目。自动更新和代码签名要能用，
   得换成 SDX 自己的（见 [NOTICE.md](../../NOTICE.md) 末节）。

## 六、忽略规则

`.gitignore` 沿用上游，有几条值得知道：

- `CLAUDE.md`、`.claude/` 被忽略 —— 本仓库的 agent 指令放在 `AGENTS.md` 系列里，是刻意的
- `desktop/build-artifacts/`、`desktop/dist/`、`desktop/electron-dist/` 是构建产物，不入库
- `.env` 不入库，只提交 `.env.example`
- `*.pem` / `*.key` / `*.p12` / `credentials*.json` 一律忽略，签名证书绝不能提交
