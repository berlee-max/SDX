# SDX 面向统信 UOS 20 (x86_64) 的构建镜像。
#
# 硬约束：node-pty 没有 Linux 预编译产物（1.1.0 只带 darwin-* 和 win32-*），必须在构建机上
# 从源码编译，而编译产物会链接构建机的 glibc。UOS 20 基于 Debian 10 一脉，glibc 2.28；在
# ubuntu-22.04（glibc 2.35）上构建出来的 pty.node 到 UOS 20 上加载失败，终端功能直接挂掉。
# 所以构建机的 glibc 必须正好是 2.28 —— 详见 docs/sdx/uos-build.md。
#
# 为什么不用 debian:buster（它才是 UOS 20 的同源发行版）：实测连撞两堵墙。
#   1. gcc 8.3 不认识 -std=gnu++20，而 Electron 42 的 node 头文件要求 C++20：
#      `unrecognized command line option '-std=gnu++20'`
#   2. Python 3.7.3 解析不了 node-gyp 12 的 gyp（用了海象运算符 :=），SyntaxError。
#
# manylinux_2_28 正是为这种"新编译器 + 老 glibc"场景存在的：AlmaLinux 8 固定在 glibc 2.28，
# 上面叠一套现代工具链。一次拿到 glibc 2.28 + GCC 14.2 + Python 3.12。
# 它是 RPM 系，所以 electron-builder 打 deb 需要的 dpkg 和 fakeroot 从 EPEL 装。
FROM quay.io/pypa/manylinux_2_28_x86_64

RUN set -eux; \
    dnf install -y epel-release; \
    dnf install -y dpkg fakeroot xz unzip zip file; \
    dnf clean all; \
    rm -rf /var/cache/dnf

# 版本与 CI 对齐：.github/workflows/release-desktop.yml 用 node 22；
# bun 版本的唯一来源是 package.json 的 packageManager（CI 通过 bun-version-file 读同一字段）。
ARG NODE_VERSION=22.23.2
ARG BUN_VERSION=1.3.14

RUN set -eux; \
    curl -fsSL -o /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
        --exclude CHANGELOG.md --exclude LICENSE --exclude README.md; \
    rm /tmp/node.tar.xz; \
    node --version; npm --version

# bun 默认的 linux-x64 构建用了 AVX2。在 Apple Silicon 上跑 amd64 模拟时会直接 SIGILL
# （实测踩到），部分国产 x86 CPU 也不支持 AVX2。-baseline 构建在哪都能跑。
RUN set -eux; \
    install_bun() { \
        curl -fsSL -o /tmp/bun.zip \
            "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64$1.zip"; \
        unzip -q -o /tmp/bun.zip -d /tmp; \
        install -m 0755 "/tmp/bun-linux-x64$1/bun" /usr/local/bin/bun; \
        rm -rf /tmp/bun.zip "/tmp/bun-linux-x64$1"; \
    }; \
    install_bun ""; \
    if ! bun --version; then \
        echo "bun-linux-x64 在本 CPU 上无法运行，改装 baseline 构建"; \
        install_bun "-baseline"; \
        bun --version; \
    fi

# manylinux 的现代工具链装在 /opt/rh/gcc-toolset-14 下，正常要 source 那个 enable 脚本。
# 这里直接写进 ENV 而不用 BASH_ENV：make 通过 `/bin/sh -c` 调 g++，而 bash 在 sh 兼容模式下
# 不读 BASH_ENV，编译子进程会悄悄退回发行版自带的 gcc 8。写成 ENV 对所有进程都生效。
ENV PATH=/opt/rh/gcc-toolset-14/root/usr/bin:$PATH \
    LD_LIBRARY_PATH=/opt/rh/gcc-toolset-14/root/usr/lib64:/opt/rh/gcc-toolset-14/root/usr/lib \
    PYTHON=/usr/bin/python3 \
    npm_config_python=/usr/bin/python3

# electron-builder 会往这些目录下载 Electron 和打包工具；挂成卷可以避免每次重跑都重新下
# 那 118MB 的 Electron。
ENV ELECTRON_CACHE=/cache/electron \
    ELECTRON_BUILDER_CACHE=/cache/electron-builder \
    npm_config_cache=/cache/npm \
    BUN_INSTALL_CACHE_DIR=/cache/bun
RUN mkdir -p /cache/electron /cache/electron-builder /cache/npm /cache/bun

WORKDIR /work
