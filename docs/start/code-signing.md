# 代码签名说明

**当前状态：SDX 尚未配置任何代码签名。** 本页说明这对你意味着什么，以及计划怎么做。

## 现状

| 平台 | 签名状态 | 首次打开时会遇到什么 |
| --- | --- | --- |
| macOS | 未签名、未公证 | Gatekeeper 会拦截。右键点图标选「打开」，或执行 `xattr -cr /Applications/SDX.app` 后再启动 |
| Windows 10+ | 未签名 | SmartScreen 会提示「已保护你的电脑」。点「更多信息」→「仍要运行」 |
| 统信 UOS 20 | 未签名（Linux 生态本就不依赖代码签名） | 正常安装，无额外提示 |

上游项目 [cc-haha](https://github.com/NanmiCoder/cc-haha) 通过 SignPath Foundation 获得了 Windows
免费代码签名。**那份证书属于上游，与 SDX 无关**，SDX 不会也不能使用它。

## 要做正式签名，各平台需要什么

**macOS** —— Apple Developer Program 会员（99 美元/年），用于取得 Developer ID Application 证书；
公证还需要一个 App-specific password。仓库里的构建流程已经完整支持签名 + 公证 + 签名链校验
（host / sidecar / cu-helper 必须签在同一张证书上），只差证书本身。

**Windows** —— 两条路：

- 向 [SignPath Foundation](https://signpath.org) 申请开源项目免费签名，需要项目公开且有一定
  社区基础；
- 或自行购买 OV / EV 代码签名证书。EV 证书能立刻消除 SmartScreen 警告，OV 证书需要累积信誉。

仓库里 `.github/signpath/` 下的配置继承自上游，接入 SDX 自己的签名渠道时需要整体替换。

**Linux / UOS** —— deb 包可以用 GPG 签名以便进入 apt 仓库，但直接分发 `.deb` 文件不需要。

## 在签名就绪之前，怎么确认下载的包没问题

只从本项目的 [GitHub Releases](https://github.com/berlee-max/SDX/releases) 下载，并核对哈希：

```bash
# macOS / Linux
shasum -a 256 SDX-<版本>-*.dmg

# Windows PowerShell
Get-FileHash .\SDX-<版本>-win-x64.exe -Algorithm SHA256
```

发布页会附带每个产物的 SHA-256。哈希对不上就不要安装。

## 安全事件上报

如果发现构建流程、发布产物或（将来的）签名账户可能被滥用，请通过
[GitHub 私密安全报告](https://github.com/berlee-max/SDX/security/advisories/new) 或邮件
[ribbernlee@gmail.com](mailto:ribbernlee@gmail.com) 报告。

软件联网与本地数据处理方式见[隐私与联网说明](./privacy.md)。
