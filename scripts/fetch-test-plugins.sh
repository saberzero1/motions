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

failed=0

for i in $(seq 0 $((count - 1))); do
    repo=$(jq -r ".[$i].repo" "$MANIFEST")
    ref=$(jq -r ".[$i].ref // \"main\"" "$MANIFEST")

    # A 40-character hex ref is a commit SHA, which lives under a different
    # archive path than a branch. Specs that assert on plugin internals should
    # pin a SHA so an upstream change cannot break CI without a manifest edit.
    if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
        url="https://github.com/${repo}/archive/${ref}.tar.gz"
    else
        url="https://github.com/${repo}/archive/refs/heads/${ref}.tar.gz"
    fi

    tmpdir=$(mktemp -d)
    trap 'rm -rf "$tmpdir"' EXIT

    echo "  Fetching $repo@$ref..."
    if ! curl -sfL "$url" | tar xz -C "$tmpdir" --strip-components=1; then
        echo "    ERROR: could not fetch $repo@$ref from $url"
        failed=1
        rm -rf "$tmpdir"
        trap - EXIT
        continue
    fi

    file_count=$(jq -r ".[$i].files // [] | length" "$MANIFEST")
    for j in $(seq 0 $((file_count - 1))); do
        file=$(jq -r ".[$i].files[$j]" "$MANIFEST")
        src="$tmpdir/$file"
        dest="$VAULT_LUA/${file#lua/}"

        if [ ! -f "$src" ]; then
            echo "    ERROR: $file not found in $repo archive"
            failed=1
            continue
        fi

        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
        echo "    $file -> $dest"
    done

    # `dirs` copies a whole subtree. Enumerating every file is unworkable for
    # plugins of any size — flash.nvim is 22 files across nested directories —
    # and silently drifts when upstream adds one.
    dir_count=$(jq -r ".[$i].dirs // [] | length" "$MANIFEST")
    for j in $(seq 0 $((dir_count - 1))); do
        dir=$(jq -r ".[$i].dirs[$j]" "$MANIFEST")
        src="$tmpdir/$dir"
        dest="$VAULT_LUA/${dir#lua/}"

        if [ ! -d "$src" ]; then
            echo "    ERROR: $dir/ not found in $repo archive"
            failed=1
            continue
        fi

        rm -rf "$dest"
        mkdir -p "$(dirname "$dest")"
        cp -r "$src" "$dest"
        echo "    $dir/ -> $dest/ ($(find "$dest" -name '*.lua' | wc -l | tr -d ' ') lua files)"
    done

    rm -rf "$tmpdir"
    trap - EXIT
done

if [ "$failed" -ne 0 ]; then
    echo "Done, with errors." >&2
    exit 1
fi

echo "Done."
