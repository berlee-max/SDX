# NOTICE

## 项目来源 / Provenance

SDX 是开源项目 **cc-haha**（<https://github.com/NanmiCoder/cc-haha>，作者 NanmiCoder，MIT 协议）的下游分支，
起点为上游桌面端 **v0.6.5**（本地快照 `cc-haha-main`，2025-09-20）。

SDX is a downstream fork of **cc-haha** (<https://github.com/NanmiCoder/cc-haha>, by NanmiCoder, MIT),
branched from upstream desktop **v0.6.5**.

上游项目本身又基于 Anthropic Claude Code 的相关实现；第三方依赖的许可证清单见
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

> ⚠️ 本仓库拿到的上游快照中没有附带 `LICENSE` 文件，根目录的 [LICENSE](LICENSE) 是按上游 README 中标注的
> MIT 徽章补充的。对外分发前请与上游仓库的 `LICENSE` 原文核对一遍。

## 已完成的重命名 / Applied renames

| 原值 (cc-haha) | 新值 (SDX) |
| --- | --- |
| 产品名 `Claude Code Haha` | `AI Agent SDX` |
| 打包显示名 `productName` | `AI Agent SDX`（决定 `AI Agent SDX.app` / `AI Agent SDX.exe` 和开始菜单项。它也决定 Electron 的 `app.getPath('userData')`，但**会话、项目、设置全在 `~/.claude`，不在那里**——userData 里只有 `app-mode.json`（便携模式开关）和 node-pty 原生缓存，所以改名的代价是「便携模式设置回落到默认、node-pty 重建一次」，不是丢数据。已实测：改名后 userData 目录压根没被创建）|
| Bundle / AppUserModelID `com.claude-code-haha.desktop` | `com.sdx.desktop` |
| Sidecar 签名标识 `com.claude-code-haha.desktop.sidecar` | `com.sdx.desktop.sidecar` |
| 安装包命名 `Claude-Code-Haha-${version}-...` | `SDX-${version}-...` |
| CLI 可执行文件 `bin/claude-haha` | `bin/sdx`（保留 `claude-haha` 作为 bin 别名） |
| npm 包名 `claude-code-local` / `claude-code-desktop` | `sdx` / `sdx-desktop` |
| 内部包名 `claude-code-haha-site` / `claude-code-im-adapters` | `sdx-site` / `sdx-im-adapters` |

短名 `SDX` 仍然是标识符：bundle id、CLI、仓库名、构建产物文件名（`SDX-${version}-${os}-${arch}`）
和站点路径 `/SDX/` 都用它。`AI Agent SDX` 只在产品自称的地方出现。

## 尚未重命名（刻意保留）/ Intentionally not renamed

这些标识符改动会破坏兼容性或需要真机验证，留到后续版本按计划处理：

- `CC_HAHA_*` 环境变量（765 处）——需要先加读旧名的兼容层。
- 用户数据目录 `~/.claude/cc-haha/`——直接改名会让老用户丢配置，需要迁移逻辑。
- macOS 原生辅助进程 `cc-haha-computer-use` 及其 SwiftPM 资源包名、TCC 标识 `dev.cchaha.cu-helper`
  ——改名会重置 macOS 录屏/辅助功能授权。
- `github.com/NanmiCoder/cc-haha` 相关链接、赞助信息、自动更新 endpoint、SignPath 签名配置
  ——在 SDX 拥有自己的仓库与签名证书之前，保持指向上游可用状态。
