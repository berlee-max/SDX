#!/bin/bash
# Runs INSIDE the Debian 10 builder image (see Dockerfile). The repo is bind-mounted
# at /work; artifacts are written to desktop/build-artifacts/uos-x64 on the host.
#
# Do not run this on the host — it assumes glibc 2.28 and will happily produce a
# node-pty that cannot load on UOS 20 if run anywhere newer.
set -euo pipefail

REPO_ROOT=/work
DESKTOP_DIR="${REPO_ROOT}/desktop"
ELECTRON_OUTPUT_DIR="${DESKTOP_DIR}/build-artifacts/electron"
CANONICAL_OUTPUT_DIR="${DESKTOP_DIR}/build-artifacts/uos-x64"
TARGET_TRIPLE="x86_64-unknown-linux-gnu"

log() { echo "[uos-build] $*"; }

log "host glibc: $(ldd --version | head -1)"
log "node $(node --version) · bun $(bun --version)"

# Fail loudly rather than silently shipping an incompatible binary.
host_glibc=$(ldd --version | head -1 | grep -oE '[0-9]+\.[0-9]+$')
if [ "$(printf '%s\n2.28\n' "$host_glibc" | sort -V | tail -1)" != "2.28" ]; then
  echo "[uos-build] FATAL: builder glibc is ${host_glibc}, newer than UOS 20's 2.28." >&2
  echo "[uos-build] node-pty is compiled from source here and would not load on the target." >&2
  exit 1
fi

cd "${REPO_ROOT}"

if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  log "installing root dependencies"
  bun install --frozen-lockfile
  log "installing desktop dependencies"
  (cd "${DESKTOP_DIR}" && bun install --frozen-lockfile)
  # The sidecar bundles the IM adapters, so their dependencies have to be present
  # before build:sidecars — CI installs these in a step of its own.
  log "installing adapter dependencies"
  (cd "${REPO_ROOT}/adapters" && bun install --frozen-lockfile)
fi

log "cleaning stale output"
rm -rf "${DESKTOP_DIR}/dist" "${DESKTOP_DIR}/electron-dist" \
       "${ELECTRON_OUTPUT_DIR}" "${CANONICAL_OUTPUT_DIR}" \
       "${DESKTOP_DIR}/tsconfig.tsbuildinfo"
rm -rf "${DESKTOP_DIR}"/src-tauri/binaries/claude-sidecar-*

# node-pty ships no Linux prebuild, so electron-builder has to rebuild it against
# the Electron ABI here, inside glibc 2.28.
log "rebuilding native modules for the Electron ABI"
(cd "${DESKTOP_DIR}" && npx --yes electron-builder install-app-deps)

log "building sidecars for ${TARGET_TRIPLE}"
(cd "${DESKTOP_DIR}" && SIDECAR_TARGET_TRIPLE="${TARGET_TRIPLE}" bun run build:sidecars)

log "building renderer and Electron bundles"
(cd "${DESKTOP_DIR}" && bun run build && bun run build:electron)

log "packaging deb + AppImage"
(cd "${DESKTOP_DIR}" && npx --yes electron-builder --linux deb AppImage --x64 --publish never)

mkdir -p "${CANONICAL_OUTPUT_DIR}"
if [ -d "${ELECTRON_OUTPUT_DIR}/linux-unpacked" ]; then
  cp -R "${ELECTRON_OUTPUT_DIR}/linux-unpacked" "${CANONICAL_OUTPUT_DIR}/"
fi
find "${ELECTRON_OUTPUT_DIR}" -maxdepth 1 -type f \
  \( -name '*.deb' -o -name '*.AppImage' -o -name '*.blockmap' -o -name 'latest-linux*.yml' \) \
  -exec cp -f {} "${CANONICAL_OUTPUT_DIR}/" \;

# The whole point of this image is the glibc floor, so prove it on the way out
# instead of discovering it on the target machine.
log "verifying glibc floor of every shipped ELF"
worst="0.0"; worst_file="-"
while IFS= read -r f; do
  head -c4 "$f" 2>/dev/null | grep -q $'\x7fELF' || continue
  v=$(strings -a "$f" 2>/dev/null | grep -oE 'GLIBC_2\.[0-9]+' | sed 's/GLIBC_//' | sort -V | tail -1)
  [ -n "$v" ] || continue
  if [ "$(printf '%s\n%s\n' "$worst" "$v" | sort -V | tail -1)" = "$v" ] && [ "$v" != "$worst" ]; then
    worst="$v"; worst_file="${f#${CANONICAL_OUTPUT_DIR}/}"
  fi
done < <(find "${CANONICAL_OUTPUT_DIR}/linux-unpacked" -type f 2>/dev/null)

log "highest glibc requirement in the package: ${worst}  (${worst_file})"
if [ "$(printf '%s\n2.28\n' "$worst" | sort -V | tail -1)" != "2.28" ]; then
  echo "[uos-build] FATAL: ${worst_file} needs glibc ${worst}, UOS 20 only has 2.28." >&2
  exit 1
fi

cat > "${CANONICAL_OUTPUT_DIR}/BUILD_INFO.txt" <<EOF
Target:            统信 UOS 20 (Debian 10 base), x86_64
Target triple:     ${TARGET_TRIPLE}
Builder glibc:     ${host_glibc}
Node:              $(node --version)
Bun:               $(bun --version)
Highest glibc req: ${worst} (${worst_file})
Built at:          $(date '+%Y-%m-%d %H:%M:%S %z')
EOF

log "done — artifacts in desktop/build-artifacts/uos-x64"
ls -la "${CANONICAL_OUTPUT_DIR}"
