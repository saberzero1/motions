#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
VERSION=$(tr -d '[:space:]' < "$SCRIPT_DIR/neovim-version.txt")
MIN_API_LEVEL=12
INSTALL_DIR=${1:-"${HOME}/.local/neovim-${VERSION}"}

case "$(uname -s)" in
    Linux)
        case "$(uname -m)" in
            x86_64) archive="nvim-linux-x86_64.tar.gz" ;;
            *) echo "Unsupported Linux architecture: $(uname -m)" >&2; exit 1 ;;
        esac
        ;;
    Darwin)
        case "$(uname -m)" in
            arm64) archive="nvim-macos-arm64.tar.gz" ;;
            x86_64) archive="nvim-macos-x86_64.tar.gz" ;;
            *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
        esac
        ;;
    *)
        echo "Unsupported operating system: $(uname -s)" >&2
        exit 1
        ;;
esac

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
url="https://github.com/neovim/neovim/releases/download/v${VERSION}/${archive}"

echo "Installing Neovim ${VERSION} from ${url}"
curl -fsSL "$url" -o "$tmpdir/$archive"
tar -xzf "$tmpdir/$archive" -C "$tmpdir"
extracted=$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d -name 'nvim-*' -print -quit)
if [ -z "$extracted" ]; then
    echo "Neovim archive did not contain an nvim-* directory" >&2
    exit 1
fi

rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$extracted" "$INSTALL_DIR"

NVIM_BIN="$INSTALL_DIR/bin/nvim"
"$NVIM_BIN" --version
api_level=$("$NVIM_BIN" --clean --headless -u NONE \
    -c 'lua io.write(vim.version().api_level)' \
    -c 'qa' 2>&1)
if ! [[ "$api_level" =~ ^[0-9]+$ ]] || [ "$api_level" -lt "$MIN_API_LEVEL" ]; then
    echo "Neovim API level ${api_level:-unknown} is below required level ${MIN_API_LEVEL}" >&2
    exit 1
fi
echo "Neovim API level ${api_level} satisfies required level ${MIN_API_LEVEL}"

if [ -n "${GITHUB_PATH:-}" ]; then
    echo "$INSTALL_DIR/bin" >> "$GITHUB_PATH"
fi
echo "Add $INSTALL_DIR/bin to PATH to use this Neovim installation."
