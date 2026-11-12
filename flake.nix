{
    description = "Development environment for vim-motions with E2E testing support";

    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
        flake-utils.url = "github:numtide/flake-utils";
    };

    outputs =
        {
            self,
            nixpkgs,
            flake-utils,
        }:
        flake-utils.lib.eachDefaultSystem (
            system:
            let
                pkgs = import nixpkgs {
                    inherit system;
                    config = {
                        allowUnfree = true;
                    };
                };

                linuxLibraries = (
                    if pkgs.stdenv.isLinux then
                        with pkgs;
                        [
                            libdrm
                            alsa-lib
                            udev
                            libx11
                            libxcomposite
                            libxdamage
                            libxext
                            libxfixes
                            libxrandr
                            libxcb
                            libxcursor
                            libxi
                            libxrender
                            libxtst
                            libxscrnsaver
                            gtk3
                            gtk4
                            libGL
                            libgbm
                            fontconfig
                            freetype
                            libuuid
                            systemd
                            wayland
                            libnotify
                            libappindicator-gtk3
                            libdbusmenu
                        ]
                    else
                        [ ]
                );

                libraries =
                    with pkgs;
                    [
                        stdenv.cc.cc.lib
                        zlib
                        glib
                        nss
                        nspr
                        atk
                        cups
                        dbus
                        dbus.lib
                        expat
                        libxkbcommon
                        pango
                        cairo
                        mesa
                        at-spi2-atk
                        at-spi2-core
                        curl
                        wget
                    ]
                    ++ linuxLibraries;

                nix-ld-libraries = pkgs.lib.makeLibraryPath libraries;

                # `e2e-headless <command>` runs a command on a private Xvfb
                # display, so the Obsidian windows the specs launch never open
                # on the desktop or take its focus. Linux CI does the same in
                # its Docker image. Without a command it runs `npm run test:e2e`.
                #
                #   * A window manager is required: Chromium starves
                #     requestAnimationFrame for unmapped windows, and specs that
                #     press real keys need a focused window.
                #   * Electron prefers Wayland when it finds a compositor
                #     socket, which would put the window back on the desktop,
                #     so the Wayland variables are cleared.
                #   * A server killed without cleanup leaves `/tmp/.X<n>-lock`
                #     with no process behind it, and the next Xvfb refuses that
                #     display, so a stale lock is removed and the teardown runs
                #     from a trap.
                #   * `-dpi 96`: at Xvfb's default resolution Chromium reports
                #     a device pixel ratio of 1.046875, so glyph edges fall on
                #     fractional pixels and measurements that are exact at 1
                #     land a column off.
                e2eHeadless =
                    if pkgs.stdenv.isLinux then
                        [
                            (pkgs.writeShellScriptBin "e2e-headless" ''
                                set -euo pipefail

                                DISPLAY_NUM=""
                                for n in $(${pkgs.coreutils}/bin/seq 90 99); do
                                    if [ -e "/tmp/.X''${n}-lock" ] &&
                                        ! ${pkgs.procps}/bin/pgrep -f "Xvfb :''${n}( |$)" >/dev/null 2>&1; then
                                        rm -f "/tmp/.X''${n}-lock" "/tmp/.X11-unix/X''${n}" 2>/dev/null || true
                                    fi
                                    if [ ! -e "/tmp/.X''${n}-lock" ]; then DISPLAY_NUM="''${n}"; break; fi
                                done
                                if [ -z "''${DISPLAY_NUM}" ]; then
                                    echo "e2e-headless: displays :90-:99 are all taken" >&2
                                    exit 1
                                fi

                                XVFB_PID=""
                                WM_PID=""
                                cleanup() {
                                    [ -n "''${WM_PID}" ] && kill -9 "''${WM_PID}" 2>/dev/null || true
                                    [ -n "''${XVFB_PID}" ] && kill -9 "''${XVFB_PID}" 2>/dev/null || true
                                    rm -f "/tmp/.X''${DISPLAY_NUM}-lock" \
                                        "/tmp/.X11-unix/X''${DISPLAY_NUM}" 2>/dev/null || true
                                }
                                trap cleanup EXIT INT TERM

                                export DISPLAY=":''${DISPLAY_NUM}"
                                unset WAYLAND_DISPLAY
                                export XDG_SESSION_TYPE=x11
                                export ELECTRON_OZONE_PLATFORM_HINT=x11

                                ${pkgs.xvfb}/bin/Xvfb "''${DISPLAY}" \
                                    -screen 0 1280x1024x24 -dpi 96 +extension GLX -noreset >/dev/null 2>&1 &
                                XVFB_PID=$!
                                for _ in $(${pkgs.coreutils}/bin/seq 1 80); do
                                    ${pkgs.xdpyinfo}/bin/xdpyinfo -display "''${DISPLAY}" \
                                        >/dev/null 2>&1 && break
                                    sleep 0.25
                                done

                                ${pkgs.herbstluftwm}/bin/herbstluftwm >/dev/null 2>&1 &
                                WM_PID=$!
                                sleep 2

                                echo "e2e-headless: running on ''${DISPLAY}"
                                if [ "$#" -eq 0 ]; then
                                    npm run test:e2e
                                else
                                    "$@"
                                fi
                            '')
                        ]
                    else
                        [ ];
            in
            {
                devShells.default = pkgs.mkShell {
                    buildInputs =
                        with pkgs;
                        [
                            nodejs_26
                            git
                            python3
                        ]
                        ++ libraries
                        ++ e2eHeadless;

                    NIX_LD_LIBRARY_PATH = nix-ld-libraries;
                    NIX_LD = pkgs.lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

                    shellHook = ''
                        echo "vim-motions development environment loaded"
                        echo "Node.js version: $(node --version)"
                        echo "NPM version: $(npm --version)"
                        echo ""
                        echo "Run 'npm install' to install dependencies"
                        echo "Run 'npm run build' to build the plugin"
                        echo "Run 'npm run test:e2e' to run E2E tests"
                        echo "Run 'e2e-headless [command]' to run them on a private display"
                    '';
                };
            }
        );
}
