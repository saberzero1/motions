$ErrorActionPreference = 'Stop'

$Version = (Get-Content (Join-Path $PSScriptRoot 'neovim-version.txt') -Raw).Trim()
$MinApiLevel = 12
$InstallDir = if ($args.Count -gt 0) {
    $args[0]
} else {
    Join-Path $env:LOCALAPPDATA "nvim-$Version"
}
$Archive = 'nvim-win64.zip'
$Url = "https://github.com/neovim/neovim/releases/download/v$Version/$Archive"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "vim-motions-nvim-$PID"

try {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
    $ArchivePath = Join-Path $TempDir $Archive
    Write-Host "Installing Neovim $Version from $Url"
    Invoke-WebRequest -Uri $Url -OutFile $ArchivePath
    Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force

    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path $InstallDir) -Force | Out-Null
    Move-Item (Join-Path $TempDir 'nvim-win64') $InstallDir

    $NvimBin = Join-Path $InstallDir 'bin/nvim.exe'
    & $NvimBin --version
    $ApiLevel = (& $NvimBin --clean --headless -u NONE -c 'lua io.write(vim.version().api_level)' -c 'qa' 2>&1 | Out-String).Trim()
    if ($ApiLevel -notmatch '^\d+$' -or [int]$ApiLevel -lt $MinApiLevel) {
        throw "Neovim API level $ApiLevel is below required level $MinApiLevel"
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
