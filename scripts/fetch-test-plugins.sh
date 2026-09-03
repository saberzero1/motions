#!/bin/bash
set -euo pipefail

MANIFEST="test/fixtures/test-plugins.json"
VAULT_LUA="test-vault/lua"

if [ ! -f "$MANIFEST" ]; then
    echo "No plugin manifest found at $MANIFEST"
    exit 0
fi

count=$(jq length "$MANIFEST")
echo "Fetching $count test plugin(s)..."

for i in $(seq 0 $((count - 1))); do
    repo=$(jq -r ".[$i].repo" "$MANIFEST")
    ref=$(jq -r ".[$i].ref // \"main\"" "$MANIFEST")

    owner="${repo%%/*}"
    name="${repo##*/}"
    url="https://github.com/${repo}/archive/refs/heads/${ref}.tar.gz"

    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" EXIT

    echo "  Fetching $repo@$ref..."
    curl -sL "$url" | tar xz -C "$tmpdir" --strip-components=1

    file_count=$(jq -r ".[$i].files | length" "$MANIFEST")
    for j in $(seq 0 $((file_count - 1))); do
        file=$(jq -r ".[$i].files[$j]" "$MANIFEST")
        src="$tmpdir/$file"
        dest="$VAULT_LUA/${file#lua/}"

        if [ ! -f "$src" ]; then
            echo "    WARNING: $file not found in $repo archive"
            continue
        fi

        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
        echo "    $file -> $dest"
    done

    rm -rf "$tmpdir"
    trap - EXIT
done

echo "Done."
