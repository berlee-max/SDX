# 统信 UOS 20 (x86_64) 构建

> 目标：统信 UOS 桌面版 20（Debian 10 基础，**glibc 2.28**），x86_64
> 状态：构建链路已就绪并做过静态核验；**尚未在真机上验证过**（见文末）

```bash
# 需要 Docker 在跑
cd desktop && bun run build:uos-x64
# 产物：desktop/build-artifacts/uos-x64/{*.deb, *.AppImage, linux-unpacked/, BUILD_INFO.txt}
```

---

## 一、为什么必须用容器构建

**只有一个原因，但它是硬的：`node-pty` 没有 Linux 预编译产物。**

`node-pty@1.1.0` 的发布包里只有 `prebuilds/{darwin-arm64,darwin-x64,win32-arm64,win32-x64}`，
没有任何 `linux-*`。所以 Linux 构建必须用 node-gyp 从源码编译，而编译出来的 `pty.node`
会链接**构建机的** glibc。

现有 CI（`.github/workflows/release-desktop.yml`）在 `ubuntu-22.04` 上构建，那是 glibc 2.35。
这样出来的包装到 UOS 20 上，`pty.node` 会直接报 `GLIBC_2.3x not found` —— 终端功能整个挂掉。

所以构建机的 glibc **必须 ≤ 2.28**。`desktop/build/uos/Dockerfile` 用 `debian:buster-slim`
正是为此：它和 UOS 20 同源同版本。

其余组件全是预编译的，构建机版本不影响它们。

## 二、glibc 核验表

每一行都是实测的 —— 下载对应平台的二进制，扫 `.gnu.version_r` 里的符号版本，而不是查文档。

| 组件 | 版本 | 需要 glibc | 需要 libstdc++ | UOS 20 (2.28 / GLIBCXX_3.4.25) |
| --- | --- | --- | --- | --- |
| Electron 主程序 | 42.7.0 | **2.25** | — （静态链接 libc++） | ✅ |
| Electron 随包 `.so` | 42.7.0 | 2.17 | — | ✅ |
| `chrome-sandbox` | 42.7.0 | 2.4 | — | ✅ |
| Node（构建期 + electron-builder） | 22.23.2 | **2.28** | 3.4.21 | ✅ 刚好卡平 |
| bun（sidecar 运行时） | 1.3.14 | 2.17 | — | ✅ |
| `@img/sharp-linux-x64` | 0.34.5 | 2.17 | 3.4.21 | ✅ |
| `libvips-cpp.so` | 8.18.6 | **2.28** | 3.4.22 | ✅ 刚好卡平 |
| `@ngrok/ngrok-linux-x64-gnu` | 1.7.0 | 2.16 | — | ✅ |
| `node-pty` | 1.1.0 | 取决于构建机 | 取决于构建机 | ⚠️ **必须在 ≤2.28 上编译** |

两个结论：

1. **Electron 42 本身完全不是问题** —— 只要 2.25，而且不依赖系统 libstdc++。这和"新版 Electron
   跑不了老发行版"的直觉相反，所以值得写下来：不要凭印象降 Electron 版本。
2. **地板是 2.28**，由 Node 和 libvips 共同顶上去，正好等于 UOS 20 的版本。**没有任何余量** ——
   任何一个依赖将来要求 2.29，UOS 20 这条线就断了。升级依赖时请重跑本文末的核验脚本。

`build-in-container.sh` 在打包结束前会扫一遍 `linux-unpacked/` 里所有 ELF，发现任何一个
要求高于 2.28 就直接失败，不会把有问题的包交出来。

## 二点五、AVX2：国产 x86 CPU 的坑

bun 的默认 `bun-linux-x64` 构建用了 AVX2 指令。这有两处影响：

- **构建镜像**：在 Apple Silicon 上跑 amd64 模拟时，默认 bun 会直接 `Illegal instruction`
  崩掉（实测踩到了）。Dockerfile 现在先试默认版，失败就换 `bun-linux-x64-baseline`。
- **产物 sidecar**：兆芯等部分国产 x86 CPU 不支持 AVX2。好在上游在
  `desktop/scripts/build-sidecars.ts` 里已经把 `x86_64-unknown-linux-gnu` 映射到
  **`bun-linux-x64-baseline`**，所以打出来的 sidecar 本身不要求 AVX2。**改这个映射前请三思。**

## 三、deb 依赖

`desktop/package.json` 的 `build.deb.depends` 显式声明了 21 项。前 9 项是 electron-builder 26
的默认值（照抄一遍，让这份清单是完整事实），后 12 项是 Electron 42 的 Chromium 在运行期真正会
用到、但默认清单没覆盖的：

```
libgbm1 libdrm2 libasound2 libcups2
libxcomposite1 libxdamage1 libxfixes3 libxrandr2
libpango-1.0-0 libcairo2 libexpat1 libdbus-1-3
```

写进 `depends` 的意义是：缺库时在 `dpkg -i` 阶段就报出来，而不是让用户双击图标后什么都不发生。
这些包在 UOS 20 的默认桌面环境里一般都有，但精简安装或服务器版未必。

## 四、命令

```bash
cd desktop

bun run build:uos-x64                 # 完整构建
SKIP_INSTALL=1 bun run build:uos-x64  # 复用已有 node_modules，重跑更快
REBUILD_IMAGE=1 bun run build:uos-x64 # 强制重建构建镜像
bash ./scripts/build-uos-x64.sh --shell   # 进容器手动排查
```

Electron、npm、bun 的下载缓存挂在 Docker 卷 `sdx-uos-build-cache` 上，重复构建不会重新下
那 118MB 的 Electron。

**在 Apple Silicon 上会走 amd64 模拟，正确但慢。** 有 x86_64 的 Linux 机器的话，同一条命令
在上面跑会快很多。

## 五、尚未验证的部分

以上全部是静态核验 —— 证明了**二进制层面不会因为 glibc 装不上**。下面这些只有真机能回答：

1. **是否真的能跑起来**：UOS 20 的 GTK / NSS / GBM 具体版本能不能满足 Electron 42 的 Chromium。
   glibc 过关不代表这些库过关。
2. **`dpkg -i` 是否有未满足依赖**：21 项 depends 在目标机上是否都能装上。
3. **终端功能**：容器里编译的 `pty.node` 是本次改动的核心风险点，要实际开一个终端标签验证。
4. **Computer Use / 截图 / 输入注入**：macOS 走 Swift 辅助进程，Windows 走 Python helper，
   **Linux 侧的支持情况本次没有调查**，不要假定可用。
5. **中文输入法**：Electron + fcitx/ibus 在国产发行版上常有坑，需要实测。

拿到真机后请先跑：

```bash
ldd --version && cat /etc/os-release && uname -m
sudo dpkg -i SDX-*-linux-amd64.deb || sudo apt-get -f install
```

## 六、重跑核验的脚本

升级 Electron、Node、bun、sharp 或任何原生依赖之后，用这个确认地板没被抬高：

```bash
# 对任意一个 Linux 二进制
strings -a <binary> | grep -oE 'GLIBC_2\.[0-9]+' | sort -uV | tail -1
strings -a <binary> | grep -oE 'GLIBCXX_3\.4\.[0-9]+' | sort -uV | tail -1
```

构建流程里已经自动做了这件事（见 `build-in-container.sh` 末尾），但在决定升级**之前**
先手动确认一次，比构建到最后才失败省时间。

## 七、另外两端的现状

| 目标 | 状态 | 还缺什么 |
| --- | --- | --- |
| macOS (arm64 + x64) | 矩阵完整：dmg + zip、hardened runtime、公证、签名链校验 | 一张 Apple Developer ID 证书（$99/年）+ App-specific password |
| Windows 10+ (x64 + arm64) | 矩阵完整：NSIS、中文路径冒烟测试、旧版数据恢复 | 自己的代码签名（上游走 SignPath，SDX 需要申请自己的项目或买 EV 证书） |
| 统信 UOS 20 (x64) | 本文 | 真机验证 |

Electron 42 的最低要求正好是 Windows 10 1809+，与目标一致，无需降级。
