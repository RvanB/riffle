#!/usr/bin/env bash
# Strip legacy font formats from the docdash output.
#
# docdash ships every webfont format under the sun (.eot for IE8,
# .svg for legacy Safari, .ttf as a fallback). Modern browsers use
# .woff2 with .woff as a safety net; everything else is dead weight.

set -euo pipefail

docs_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs"

[[ -d "$docs_dir" ]] || { echo "prune-docs: $docs_dir does not exist" >&2; exit 1; }

find "$docs_dir/fonts" -type f \( -name "*.eot" -o -name "*.svg" -o -name "*.ttf" \) -delete
