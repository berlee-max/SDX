# SDX builder image for 统信 UOS 20 (x86_64).
#
# WHY DEBIAN 10: UOS 20 桌面版的基础是 Debian 10 一脉，glibc 2.28。本仓库的原生依赖里
# 只有 node-pty 没有 Linux 预编译产物（1.1.0 只带 darwin-* 和 win32-*），必须在构建机上
# 用 node-gyp 从源码编译 —— 编译产物会链接构建机的 glibc。在 ubuntu-22.04（glibc 2.35）
# 上构建出来的 pty.node 到 UOS 20 上会直接报 GLIBC_2.3x not found。
#
# 其余组件都是预编译的，实测要求（见 docs/sdx/uos-build.md 的核验表）最高是 glibc 2.28
# （Node 22 与 libvips），正好等于 UOS 20 的版本 —— 没有余量，所以构建机必须压到 2.28，
# 不能更高。
FROM debian:buster-slim

# buster 已 EOL，官方镜像源下线，全部切到 archive。
RUN set -eux; \
    printf 'deb http://archive.debian.org/debian buster main\n\
deb http://archive.debian.org/debian-security buster/updates main\n' > /etc/apt/sources.list; \
    printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils unzip zip git \
        build-essential python3 pkg-config \
        fakeroot dpkg-dev file \
        libsecret-1-dev \
    ; \
    rm -rf /var/lib/apt/lists/*

# 版本与 CI 对齐：.github/workflows/release-desktop.yml 用 node 22，
# package.json 的 packageManager 声明 bun@1.3.14（CI 通过 bun-version-file 读同一字段）。
ARG NODE_VERSION=22.23.2
ARG BUN_VERSION=1.3.14

RUN set -eux; \
    curl -fsSL -o /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
        --exclude CHANGELOG.md --exclude LICENSE --exclude README.md; \
    rm /tmp/node.tar.xz; \
    node --version; npm --version

# bun's default linux-x64 build uses AVX2. Under Docker's amd64 emulation on Apple
# Silicon that faults with SIGILL, and some domestic x86 CPUs paired with UOS lack
# AVX2 too. The -baseline build targets pre-AVX2 CPUs and runs everywhere, so it is
# the correct choice for a UOS builder; try the fast one first and fall back.
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
        echo "bun-linux-x64 faulted on this CPU; installing the baseline build"; \
        install_bun "-baseline"; \
        bun --version; \
    fi

# electron-builder 会往 ~/.cache/electron 和 ~/.cache/electron-builder 下载 Electron 和
# 打包工具。挂成卷可以避免每次重建都重新下 118MB。
ENV ELECTRON_CACHE=/cache/electron \
    ELECTRON_BUILDER_CACHE=/cache/electron-builder \
    npm_config_cache=/cache/npm \
    BUN_INSTALL_CACHE_DIR=/cache/bun
RUN mkdir -p /cache/electron /cache/electron-builder /cache/npm /cache/bun

WORKDIR /work
