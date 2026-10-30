$ErrorActionPreference = 'Stop'

$Version = (Get-Content (Join-Path $PSScriptRoot 'neovim-version.txt') -Raw).Trim()
$MinApiLevel = 14
$InstallDir = if ($args.Count -gt 0) {
    $args[0]
} else {
    Join-Path $env:LOCALAPPDATA "nvim-$Version"
}
$Archive = 'nvim-win64.zip'
$Url = "https://github.com/neovim/neovim/releases/download/v$Version/$Archive"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "vim-motions-nvim-$PID"

# GitHub's release download sometimes never answers, and Invoke-WebRequest's
# own -MaximumRetryCount retries HTTP error codes only, not a connection that
# times out: one such timeout failed a whole Windows shard before any test
# ran ("A connection attempt failed because the connected party did not
# properly respond"). Retry the request itself, backing off between tries.
function Get-Archive([string]$Uri, [string]$Path, [int]$Attempts = 4) {
    for ($Attempt = 1; ; $Attempt++) {
        try {
            Invoke-WebRequest -Uri $Uri -OutFile $Path
            return
        } catch {
            if ($Attempt -ge $Attempts) { throw }
            Write-Host "::warning::Neovim download attempt $Attempt of $Attempts failed: $($_.Exception.Message)"
            Start-Sleep -Seconds (5 * $Attempt)
        }
    }
}

try {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
    $ArchivePath = Join-Path $TempDir $Archive
    Write-Host "Installing Neovim $Version from $Url"
    Get-Archive -Uri $Url -Path $ArchivePath
    Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force

    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path $InstallDir) -Force | Out-Null
    Move-Item (Join-Path $TempDir 'nvim-win64') $InstallDir

    $NvimBin = Join-Path $InstallDir 'bin/nvim.exe'
    & $NvimBin --version
    # stdout only: headless Neovim writes every message to stderr, and the
    # workflow's POSIX $NVIM_LOG_FILE is unusable on Windows, so VimEnter
    # defers `log: "..." not accessible, logging to: "..."` by 100 ms. A probe
    # slow enough to outlive that timer had the warning merged into the level
    # by `2>&1` and threw on a perfectly good Neovim. Only io.write is stdout.
    $ApiLevel = (& $NvimBin --clean --headless -u NONE -c 'lua io.write(vim.version().api_level)' -c 'qa' | Out-String).Trim()
    if ($ApiLevel -notmatch '^\d+$' -or [int]$ApiLevel -lt $MinApiLevel) {
        $Reported = if ($ApiLevel) { $ApiLevel } else { 'unknown' }
        throw "Neovim API level $Reported is below required level $MinApiLevel"
    }
    Write-Host "Neovim API level $ApiLevel satisfies required level $MinApiLevel"

    $BinDir = Join-Path $InstallDir 'bin'
    $env:PATH = "$BinDir;$env:PATH"
    if ($env:GITHUB_PATH) {
        Add-Content -Path $env:GITHUB_PATH -Value $BinDir
    }
} finally {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
