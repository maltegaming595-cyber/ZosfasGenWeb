param(
  [Parameter(Mandatory=$true)][string]$BatchesDir,   # contains files-000, files-001...
  [string]$OutFile = "..\manifest.json",             # writes to repo root by default
  [int]$MaxBatch = 3                                 # generate up to files-003
)

$ErrorActionPreference = "Stop"

$map = @{}
$total = 0

for ($i = 0; $i -le $MaxBatch; $i++) {
  $tag = ("files-{0:D3}" -f $i)
  $folder = Join-Path $BatchesDir $tag
  if (!(Test-Path $folder)) {
    Write-Host "Skipping $tag (folder missing)"
    continue
  }

  Write-Host "Scanning $tag..."
  Get-ChildItem -Path $folder -Filter *.zip -File | ForEach-Object {
    $appid = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    if ($appid -match '^\d+$') {
      $map[$appid] = $tag
      $total++
    }
  }
}

$OutFile = Join-Path (Get-Location) $OutFile
($map | ConvertTo-Json -Depth 2) | Set-Content -Path $OutFile -Encoding UTF8

Write-Host "Done. Added $($map.Count) unique appids from 0..$MaxBatch"
Write-Host "Manifest written to: $OutFile"
