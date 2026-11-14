#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
project_dir="$PWD"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

version="$(node -p 'require("./plugin.json").version')"
go_root="$(go env GOROOT)"
go_license="$go_root/LICENSE"
if [[ ! -f "$go_license" ]]; then
  go_license="$go_root/../LICENSE"
fi
module_cache="$(go env GOMODCACHE)"
package_dir="$stage_dir/plugin"
mkdir -p "$project_dir/dist" "$package_dir"
cp index.js plugin.json README.md THIRD_PARTY_NOTICES.md "$package_dir/"
cp -R locales "$package_dir/"

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=("$(go env GOOS)-$(go env GOARCH)")
fi

for target in "${targets[@]}"; do
  case "$target" in
    darwin-arm64|darwin-amd64|windows-arm64|windows-amd64) ;;
    *) echo "Unsupported web login build target: $target" >&2; exit 1 ;;
  esac
  platform="${target%-*}"
  arch="${target#*-}"
  helper="bin/migu-web-login-$target"
  if [[ "$platform" == windows ]]; then
    helper="$helper.exe"
  fi

  mkdir -p "$package_dir/bin" "$package_dir/licenses"
  GOOS="$platform" GOARCH="$arch" CGO_ENABLED=0 go -C native/web-login build \
    -trimpath -buildvcs=false -ldflags="-s -w" -o "$package_dir/$helper" .

  if [[ "$platform" == darwin ]]; then
    codesign --force --sign - --timestamp=none --identifier mygo.music.migu.login "$package_dir/$helper"
    codesign --verify --strict "$package_dir/$helper"
  fi

  # Copy the licenses of the modules actually linked into the executable.
  cp "$go_license" "$package_dir/licenses/Go-LICENSE"
  if [[ -f "$go_root/PATENTS" ]]; then
    cp "$go_root/PATENTS" "$package_dir/licenses/Go-PATENTS"
  fi
  go version -m "$package_dir/$helper" | while read -r kind module ver _; do
    [[ "$kind" == dep ]] || continue
    module_dir="$module_cache/$module@$ver"
    label="${module##*/}"
    cp "$module_dir/LICENSE" "$package_dir/licenses/$label-LICENSE"
    if [[ -f "$module_dir/PATENTS" ]]; then
      cp "$module_dir/PATENTS" "$package_dir/licenses/$label-PATENTS"
    fi
  done

  archive="mygo-music-migu-$version-$target.zip"
  (cd "$package_dir" && zip -q -r "$stage_dir/$archive" .)
  mv "$stage_dir/$archive" "$project_dir/dist/$archive"
  rm -r "$package_dir/bin" "$package_dir/licenses"
  echo "dist/$archive"
done
