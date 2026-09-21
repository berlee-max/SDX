# 配置模型服务商（开发/测试用）

SDX 的 CLI 和桌面端走两条不同的接入路径，同一家服务商往往要填不同的地址。本文以
**千问AI平台**（`platform.qianwenai.com`）为例，它两套接口都提供，正好把差异说清楚。

> 注意：这家 `platform.qianwenai.com` 不是阿里云官方的通义千问（那是
> `dashscope.aliyuncs.com` / `bailian.console.aliyun.com`），是第三方聚合平台。

---

## 一、两套端点

| 格式 | Base URL | 谁用 |
| --- | --- | --- |
| **Anthropic 兼容** | `https://maas.qianwenaiapi.com/apps/anthropic` | CLI（`bin/sdx`），桌面端选 `anthropic` 时 |
| **OpenAI 兼容** | `https://maas.qianwenaiapi.com/compatible-mode/v1` | 桌面端选 `openai_chat` 时 |

CLI 只认 Anthropic 格式，会自己往 base URL 后面接 `/v1/messages`。**填 base URL 时不要带
`/v1/messages`**，否则路径会变成 `.../v1/messages/v1/messages`。

实测记录（2026-09-21）：

```
GET  /compatible-mode/v1/models          200
POST /compatible-mode/v1/chat/completions 200
POST /apps/anthropic/v1/messages          200   ← CLI 用这个
POST /apps/anthropic/messages             404   （必须带 /v1）
POST /anthropic/v1/messages               404
POST /v1/messages                         404
```

常用模型：`qwen3.8-max`（复杂推理/编程）、`qwen3.7-plus`（均衡）、`qwen3.8-flash`（快、便宜）。
`qwen3.8-max` 是推理模型，响应里会带 `thinking` 块，`max_tokens` 给小了会在思考阶段就被截断。

## 二、CLI 配置

`.env`（**在 `.gitignore` 第一行，不会入库**）：

```bash
ANTHROPIC_AUTH_TOKEN=<你的 key>
ANTHROPIC_BASE_URL=https://maas.qianwenaiapi.com/apps/anthropic
ANTHROPIC_MODEL=qwen3.8-max
ANTHROPIC_DEFAULT_OPUS_MODEL=qwen3.8-max
ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3.7-plus
ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3.8-flash
API_TIMEOUT_MS=3000000
```

验证：

```bash
./bin/sdx -p "用一句中文回答：1+1 等于几？"
```

## 三、⚠️ 在 Claude Code 会话里测试会失败

**这个坑会浪费你很多时间。** Claude Code 自己的会话环境里带着：

```
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_CODE_OAUTH_SCOPES=...
CLAUDECODE=1
```

两个后果：

1. **`bun --env-file` 不会覆盖已存在的环境变量**，所以 `.env` 里的 `ANTHROPIC_BASE_URL` 被
   外层的 `api.anthropic.com` 压掉 —— 你的第三方 key 会被发往 Anthropic 官方。
2. `CLAUDE_CODE_OAUTH_*` 让 CLI 判定自己处于托管 OAuth 上下文，即使 `ANTHROPIC_AUTH_TOKEN`
   已设置也直接报 **`Not logged in · Run /login`**。

第 2 条实际上挡住了第 1 条的后果（请求在发出前就被拦下），但它会让人误以为是配置写错了。

在普通终端里测就没这个问题。如果一定要在 Claude Code 会话里测：

```bash
env -u ANTHROPIC_BASE_URL -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
    -u CLAUDE_CODE_OAUTH_SCOPES -u CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH \
    ./bin/sdx -p "测试"
```

## 四、桌面端配置

桌面端不读 `.env`，在应用内「设置 → 模型服务商 → 添加」里填，两种格式都支持：

| 字段 | Anthropic 格式 | OpenAI 格式 |
| --- | --- | --- |
| Base URL | `https://maas.qianwenaiapi.com/apps/anthropic` | `https://maas.qianwenaiapi.com/compatible-mode/v1` |
| API 格式 | `anthropic` | `openai_chat` |
| 模型 | `qwen3.8-max` | `qwen3.8-max` |

## 五、密钥卫生

- `.env` 在 `.gitignore` 第一行，但**提交前还是扫一眼**：
  `git grep -l 'sk-' -- . | grep -v '\.example'`
- 仓库里的其它密钥模式（`*.pem` / `*.key` / `*.p12` / `credentials*.json`）也已在忽略列表里。
- **不要把 key 贴进聊天、issue 或提交信息**。贴过的就当已泄露，去服务商后台撤销重发。
