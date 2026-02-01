param(
  [Parameter(Mandatory=$true)][string]$Repo,          # "maltegaming595-cyber/ZosfasGenLocal"
  [Parameter(Mandatory=$true)][string]$ZipDir,        # "C:\path\to\zips"
  [int]$BatchSize = 1000,                             # assets per release tag
  [int]$ChunkSize = 100                               # files per gh upload call (50-200 is good)
)

$ErrorActionPreference = "Stop"

function New-TagName($i) { return ("files-{0:D3}" -f $i) }

function Ensure-Release($tag) {
  & gh release create $tag --repo $Repo --title $tag --notes "Auto upload $tag" 2>$null | Out-Null
}

function Upload-Chunk($tag, $paths) {
  # retry loop on throttling/timeouts
  $try = 0
  while ($true) {
    $try++
    try {
      & gh release upload $tag @paths --repo $Repo --clobber | Out-Null
      return
    } catch {
      $sleep = [Math]::Min(300, 5 * $try * $try) # 5,20,45,80... up to 300s
      Write-Host "Upload chunk failed (try $try). Sleeping $sleep sec..."
      Start-Sleep -Seconds $sleep
      if ($try -ge 10) { throw }
    }
  }
}

if (!(Test-Path $ZipDir)) { throw "ZipDir not found: $ZipDir" }

$zips = Get-ChildItem -Path $ZipDir -Filter *.zip | Sort-Object Name
if ($zips.Count -eq 0) { throw "No .zip files found in $ZipDir" }

$manifest = @{}
$manifestPath = Join-Path $PSScriptRoot "manifest.json"

Write-Host "Found $($zips.Count) zips."

$batchIndex = 0
$inBatch = 0
$tag = ""

# buffer for current chunk
$chunk = New-Object System.Collections.Generic.List[string]

foreach ($z in $zips) {
  if ($inBatch -eq 0 -and $chunk.Count -eq 0) {
    $tag = New-TagName $batchIndex
    Write-Host "==> Using release tag $tag"
    Ensure-Release $tag
  }

  $appid = [System.IO.Path]::GetFileNameWithoutExtension($z.Name)
  if ($appid -notmatch '^\d+$') { continue }

  $manifest[$appid] = $tag
  $chunk.Add($z.FullName)

  $inBatch++

  # upload chunk when full
  if ($chunk.Count -ge $ChunkSize) {
    Write-Host "Uploading chunk ($($chunk.Count)) -> $tag"
    Upload-Chunk $tag $chunk.ToArray()
    $chunk.Clear()

    # save manifest periodically
    if (($manifest.Count % 500) -eq 0) {
      $manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
      Write-Host "Saved manifest progress ($($manifest.Count) entries)"
    }
  }

  # roll to next release tag after BatchSize assets
  if ($inBatch -ge $BatchSize) {
    # flush remaining chunk for this tag
    if ($chunk.Count -gt 0) {
      Write-Host "Uploading final chunk ($($chunk.Count)) -> $tag"
      Upload-Chunk $tag $chunk.ToArray()
      $chunk.Clear()
    }
    $batchIndex++
    $inBatch = 0
  }
}

# flush remaining chunk
if ($chunk.Count -gt 0) {
  Write-Host "Uploading final chunk ($($chunk.Count)) -> $tag"
  Upload-Chunk $tag $chunk.ToArray()
  $chunk.Clear()
}

$manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "==> Manifest written to $manifestPath"
