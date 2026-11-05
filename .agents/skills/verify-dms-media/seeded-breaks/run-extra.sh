#!/usr/bin/env bash
set -euo pipefail

feature=${1:?usage: run-extra.sh <feature> <break id>}
id=${2:?usage: run-extra.sh <feature> <break id>}
skill=$(cd "$(dirname "$0")/.." && pwd)
repo=$(git -C "$skill" rev-parse --show-toplevel)
relative=${skill#"$repo"/}
patch=$skill/seeded-breaks/extra/$id.patch
[ -f "$patch" ] || { echo "no $patch" >&2; exit 2; }

scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch" >/dev/null 2>&1 || true' EXIT
git -C "$repo" worktree add -q --detach --force "$scratch" HEAD
rm -rf "${scratch:?}/$relative"
cp -a "$skill" "$scratch/$relative"
cp "$patch" "$scratch/$relative/seeded-breaks/$feature.patch"

pnpm --dir "$repo/packages/dms-media" exec dms-control seeded "$feature" --skill "$scratch/$relative"
