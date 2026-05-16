#!/usr/bin/env bash
# Cut a release of riffle.js.
#
# Usage:
#   ./scripts/release.sh vX.Y.Z
#
# Steps:
#   1. Validate the version arg (must look like vX.Y.Z[-prerelease]).
#   2. Verify we're on `main`, the worktree is clean, and the tag is unused.
#   3. Bump `package.json` version to match the tag (without leading `v`).
#   4. Rebuild `dist/`   (npm run build).
#   5. Rebuild `docs/`   (jsdoc + docdash via npm run docs).
#   6. Stage package.json, package-lock.json, dist/, docs/.
#   7. Create one "Release vX.Y.Z" commit.
#   8. Create an annotated tag.
#   9. Push main + tags to origin.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

die() {
  echo "release: $*" >&2
  exit 1
}

# --- 1. validate args -------------------------------------------------------

[[ $# -eq 1 ]] || die "usage: $(basename "$0") vX.Y.Z"
TAG="$1"

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  die "version must look like vX.Y.Z (got '$TAG')"
fi
PKG_VERSION="${TAG#v}"

# --- 2. environment checks --------------------------------------------------

command -v node >/dev/null || die "node not on PATH"
command -v npm  >/dev/null || die "npm not on PATH"
command -v git  >/dev/null || die "git not on PATH"

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || die "must be on main (currently on '$branch')"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short >&2
  die "working tree is not clean — commit or stash changes before releasing"
fi

git fetch --tags --quiet origin

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "tag $TAG already exists locally"
fi
if git ls-remote --tags --exit-code origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists on origin"
fi

echo "release: cutting $TAG (package.json -> $PKG_VERSION)"

# --- 3. bump package.json ---------------------------------------------------

# `npm pkg set` updates package.json and package-lock.json without creating
# a git commit (unlike `npm version`).
npm pkg set "version=$PKG_VERSION" >/dev/null
npm install --package-lock-only --silent

# --- 4. rebuild dist/ -------------------------------------------------------

echo "release: building dist/"
npm run --silent build

# --- 5. rebuild docs/ -------------------------------------------------------

echo "release: building docs/"
npm run --silent docs

# --- 6. stage --------------------------------------------------------------

git add package.json package-lock.json dist docs

if git diff --cached --quiet; then
  die "nothing to commit after build — dist/ and docs/ already match HEAD?"
fi

# --- 7. commit -------------------------------------------------------------

git commit -m "Release $TAG"

# --- 8. tag ---------------------------------------------------------------

git tag -a "$TAG" -m "Release $TAG"

# --- 9. push --------------------------------------------------------------

echo "release: pushing main and tags to origin"
git push --follow-tags origin main

echo "release: done — $TAG is live"
echo "  - GitHub Pages will republish from docs/ on the next Pages build"
echo "  - jsDelivr: https://cdn.jsdelivr.net/gh/RvanB/riffle.js@$TAG/dist/riffle.min.js"
