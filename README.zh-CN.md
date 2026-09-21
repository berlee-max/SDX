# SDX

<div align="center">

**SDX — 桌面端 AI 编程工作台**

[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%2010%2B%20%7C%20统信UOS-FF7A00)](#)

**简体中文** · [English](README.md)

</div>

> **关于本项目**：SDX 基于开源项目 [cc-haha](https://github.com/NanmiCoder/cc-haha)（MIT 协议，作者 NanmiCoder）
> 二次开发，起始于上游桌面端 v0.6.5。本仓库保留上游版权与许可声明，详见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。
> 下文大部分内容继承自上游文档，会随 SDX 的开发逐步替换。上游的赞助、打赏、交流群和作者联系方式已全部移除；
> 文中仅剩的 `github.com/NanmiCoder/cc-haha` 链接是出于许可要求保留的来源标注。
>
> 界面截图仍是上游版本（侧边栏显示 `cc-haha`），需要重新截图后替换，暂未纳入 README。

SDX 是一个**桌面端 Claude Code 工作台**：多会话与全局搜索、分支 / Worktree 启动、Diff 审阅、内置浏览器预览、图形化权限审批、模型自选（Claude / ChatGPT / Grok / 预设 / 本地端点）、图片生成、MCP 与 SubAgent 可视化管理、Agent Teams 协作工作台、动态 Workflow 编排、模型请求追踪、Computer Use、技能市场、多主题、桌面宠物、H5 远程访问、IM 接入和定时任务，集中在一个 macOS / Windows / Linux APP 里。

<p align="center">
  <a href="#安装桌面端">安装桌面端</a> · <a href="#从源码启动-cli">从源码启动 CLI</a> · <a href="#桌面端亮点">桌面端亮点</a> · <a href="#更多文档">更多文档</a>
</p>

## 安装桌面端

1. 前往 [Releases](https://github.com/berlee-max/SDX/releases) 下载安装包（macOS / Windows 10+ / 统信 UOS 20）。
   **SDX 尚未发布任何版本**，当前请按下文从源码构建。
2. 首次启动后，在桌面端设置里配置模型提供商、API Key 和默认模型。
3. 正式 macOS Release 需要经过签名和公证；如果安装的是 draft/unsigned 临时包，首次打开可能仍需手动放行。Windows 未签名安装包可能出现 SmartScreen 提示，点「更多信息」→「仍要运行」即可。详见 [桌面端安装指南](docs/start/install.md)。

发布可信度与隐私：[Code signing policy](docs/start/code-signing.md) · [隐私与联网说明](docs/start/privacy.md)

## 从源码启动 CLI

适合想调试底层 CLI、服务端或自行开发的用户：

```bash
bun install
cp .env.example .env
./bin/sdx
```

更多配置见 [环境变量](docs/cli/env.md) 和 [命令行安装与启动](docs/cli/index.md)。

## 桌面端亮点

- **多会话工作台**：标签页、项目切换、终端入口和会话历史集中管理，侧边栏宽度可拖拽。
- **全局搜索**：按 Cmd+K 跨所有会话全文搜索，一键跳到命中位置。
- **分支 / Worktree 启动**：新会话可以选择仓库分支，并决定用当前工作树还是隔离 Worktree。
- **改动逐个文件审阅**：右侧工作区列出本轮改动，点开就是带语法高亮的 Diff，整轮可撤销。
- **内置浏览器预览**：Agent 刚改完的页面直接在应用内渲染，登录态和 Cookie 真实可用。
- **五档权限模式**：从「询问权限」到「跳过权限」，危险命令、工具调用和 AI 反问都在桌面端审批。
- **模型自选**：Claude / ChatGPT / Grok 官方账号可直接登录；DeepSeek、Kimi、智谱 GLM 等第三方 API 有现成预设；LM Studio、Ollama 的本地模型也接得上。
- **图片生成**：聊天中直接生成和编辑图片——ChatGPT / Grok 授权登录即可使用，也支持接入任意 OpenAI 兼容的 Images API。
- **MCP 图形化管理**：界面化增删改 MCP Server，支持 STDIO / Streamable HTTP / SSE 三种传输方式与项目私有、共享、全局三种作用域。
- **六套配色主题**：纯白、纸墨、经典暖色、青瓷、墨夜、墨夜蓝，可跟随系统深浅色自动切换。
- **技能市场**：发现、预览、安装 ClawHub / SkillHub 的第三方技能，来源和安全状态摆在明处。
- **会话活动面板**：集中查看任务进度、后台任务、SubAgent 与来源。
- **可视化 SubAgent 管理**：图形界面创建和调校子代理，选择模型、工具与权限模式。
- **Agent Teams 协作工作台**：桌面端可视化多 Agent 协作团队——成员、任务、通信流和依赖泳道一目了然。
- **动态 Workflow 编排**：模型当场编写并运行编排脚本，并发或流水线调度多个子代理，支持阶段视图、中断与断点续跑。
- **模型请求追踪**：本地记录每轮模型请求的状态与耗时，可搜索筛选，快速定位卡死或失败调用。
- **Computer Use**：让 Agent 在授权后截图、点击、输入并控制桌面应用。
- **桌面宠物**：搭搭、弧弧、补补、回回随任务状态换动作，也能自己做一只（默认关闭）。
- **H5 远程访问**：扫码用手机浏览器接入当前会话，锁屏切后台都不打断正在跑的任务。
- **IM 接入**：通过 Telegram / 飞书 / 微信 / 钉钉 / WhatsApp / 企业微信 / QQ / Slack 远程对话、切换项目和审批权限。
- **定时任务与用量统计**：创建计划任务在独立会话执行，并查看本机 Token 使用趋势。

---

## 更多文档

完整文档站：<https://berlee-max.github.io/SDX/>

| 分区 | 文档 |
|------|------|
| **开始使用** | [这是什么](docs/start/index.md) · [下载与安装](docs/start/install.md) · [连接模型服务](docs/start/models.md) · [跑通第一条会话](docs/start/first-session.md) · [故障排查](docs/start/troubleshooting.md) |
| **桌面端功能** | [功能总览](docs/desktop/index.md) · [Computer Use](docs/desktop/computer-use.md) · [桌面宠物](docs/desktop/pets.md) · [手机 H5 与 IM 接力](docs/desktop/remote.md) |
| **IM 接入** | [总览与配对流程](docs/im/index.md) · [飞书](docs/im/feishu.md) · [Telegram](docs/im/telegram.md) · [微信](docs/im/wechat.md) · [钉钉](docs/im/dingtalk.md) · [WhatsApp](docs/im/whatsapp.md) · [企业微信](docs/im/wecom.md) · [QQ](docs/im/qq.md) · [Slack](docs/im/slack.md) |
| **命令行** | [安装与启动](docs/cli/index.md) · [命令参考](docs/cli/reference.md) · [环境变量](docs/cli/env.md) |
| **深入原理** | [桌面端架构](docs/internals/desktop.md) · [多 Agent 系统](docs/internals/agent.md) · [Skills 系统](docs/internals/skills.md) · [记忆系统](docs/internals/memory.md) · [Computer Use 架构](docs/internals/computer-use.md) · [本地 Server 与 API](docs/internals/server.md) · [Channel 系统](docs/internals/channel.md) · [项目结构](docs/internals/structure.md) · [参与贡献与质量门禁](docs/internals/contributing.md) |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 桌面 APP | Electron |
| 桌面 UI | React + Vite |
| 本地运行时 | [Bun](https://bun.sh) |
| 终端 UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI 解析 | Commander.js |
| API | Anthropic SDK |
| 协议 | MCP, LSP |

## 致谢

感谢以下开源项目和社区实践为本项目提供参考与启发：

- [React](https://github.com/facebook/react)：前端工程与组件化 UI 生态。
- [Electron](https://github.com/electron/electron)：跨端桌面应用能力与工程实践。
- [cc-switch](https://github.com/farion1231/cc-switch)：模型供应商配置能力参考。
- [LINUX DO](https://linux.do/)：新的理想型开发者社区。
- [cc-haha](https://github.com/NanmiCoder/cc-haha)：本项目的上游，SDX 从它的 v0.6.5 分叉而来。
