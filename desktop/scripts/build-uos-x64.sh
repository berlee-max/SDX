#!/bin/bash
# Host-side entry point: build the SDX desktop app for 统信 UOS 20 (x86_64).
#
# Runs the real build inside a Debian 10 container because node-pty has no Linux
# prebuild and must be compiled against glibc <= 2.28. See desktop/build/uos/Dockerfile
# and docs/sdx/uos-build.md.
#
# Works from macOS, Linux, or CI — only Docker is required on the host.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DESKTOP_DIR}/.." && pwd)"

IMAGE_TAG="${UOS_IMAGE_TAG:-sdx-uos20-builder:latest}"
CACHE_VOLUME="${UOS_CACHE_VOLUME:-sdx-uos-build-cache}"
NM_ROOT_VOLUME="${UOS_NM_ROOT_VOLUME:-sdx-uos-nm-root}"
NM_DESKTOP_VOLUME="${UOS_NM_DESKTOP_VOLUME:-sdx-uos-nm-desktop}"
NM_ADAPTERS_VOLUME="${UOS_NM_ADAPTERS_VOLUME:-sdx-uos-nm-adapters}"
OUTPUT_DIR="${DESKTOP_DIR}/build-artifacts/uos-x64"

usage() {
  cat <<'EOF'
Build SDX desktop for 统信 UOS 20 (x86_64) in a Debian 10 container.

Usage:
  ./desktop/scripts/build-uos-x64.sh [--shell]

Options:
  --shell            Drop into a shell in the builder image instead of building.

Environment:
  SKIP_INSTALL=1     Reuse the container's node_modules volumes (faster reruns).
  UOS_IMAGE_TAG      Builder image tag. Default: sdx-uos20-builder:latest
  UOS_CACHE_VOLUME   Docker volume for the Electron/npm/bun caches.
  REBUILD_IMAGE=1    Rebuild the builder image even if it already exists.

Output:
  desktop/build-artifacts/uos-x64/  (.deb, .AppImage, linux-unpacked/, BUILD_INFO.txt)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[uos] Docker is required but was not found on PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[uos] The Docker daemon is not reachable. Start Docker Desktop (or dockerd) and retry." >&2
  exit 1
fi

# The image is x86_64 on purpose; on Apple Silicon this runs under emulation, which
# is slow but produces the right binaries. Building natively on an x86_64 Linux host
# is considerably faster if that is an option.
host_arch="$(uname -m)"
if [[ "${host_arch}" != "x86_64" && "${host_arch}" != "amd64" ]]; then
  echo "[uos] Host is ${host_arch}; the linux/amd64 builder will run under emulation (slow but correct)."
fi

if [[ "${REBUILD_IMAGE:-0}" == "1" ]] || ! docker image inspect "${IMAGE_TAG}" >/dev/null 2>&1; then
  echo "[uos] Building builder image ${IMAGE_TAG}..."
  docker build --platform linux/amd64 -t "${IMAGE_TAG}" "${DESKTOP_DIR}/build/uos"
else
  echo "[uos] Reusing builder image ${IMAGE_TAG} (REBUILD_IMAGE=1 to rebuild)."
fi

for volume in "${CACHE_VOLUME}" "${NM_ROOT_VOLUME}" "${NM_DESKTOP_VOLUME}" "${NM_ADAPTERS_VOLUME}"; do
  docker volume create "${volume}" >/dev/null
done

if [[ "${1:-}" == "--shell" ]]; then
  exec docker run --rm -it --platform linux/amd64 \
    -v "${REPO_ROOT}:/work" \
    -v "${CACHE_VOLUME}:/cache" \
    -v "${NM_ROOT_VOLUME}:/work/node_modules" \
    -v "${NM_DESKTOP_VOLUME}:/work/desktop/node_modules" \
    -v "${NM_ADAPTERS_VOLUME}:/work/adapters/node_modules" \
    -w /work "${IMAGE_TAG}" bash
fi

rm -rf "${OUTPUT_DIR}"

# The repo is bind-mounted, so the container would otherwise install linux-x64
# native modules straight over the host's darwin ones and quietly break local
# development. Named volumes shadow every node_modules directory: the container
# gets its own Linux tree, persisted across runs so SKIP_INSTALL still helps.
echo "[uos] Building in container..."
docker run --rm --platform linux/amd64 \
  -v "${REPO_ROOT}:/work" \
  -v "${CACHE_VOLUME}:/cache" \
  -v "${NM_ROOT_VOLUME}:/work/node_modules" \
  -v "${NM_DESKTOP_VOLUME}:/work/desktop/node_modules" \
  -v "${NM_ADAPTERS_VOLUME}:/work/adapters/node_modules" \
  -e "SKIP_INSTALL=${SKIP_INSTALL:-0}" \
  -w /work "${IMAGE_TAG}" \
  bash /work/desktop/build/uos/build-in-container.sh

echo
echo "[uos] Artifacts:"
ls -la "${OUTPUT_DIR}"
echo
echo "[uos] Verify on a real UOS 20 machine before shipping:"
echo "  sudo dpkg -i SDX-*-linux-amd64.deb || sudo apt-get -f install"
echo "  sdx  # or launch it from the application menu"
