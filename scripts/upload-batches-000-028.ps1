param(
  [Parameter(Mandatory=$true)][string]$Repo,
  [Parameter(Mandatory=$true)][string]$BatchesDir,
  [int]$MaxParallel = 2
)

$ErrorActionPreference = "Stop"

function Release-Exists($tag) {
  try {
    & gh release view $tag --repo $Repo 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Ensure-Release($tag) {
  if (Release-Exists $tag) {
    Write-Host "Release exists: $tag"
    return
  }

  Write-Host "Creating release: $tag"
  try {
    & gh release create $tag --repo $Repo --title $tag --notes "Auto uploaded $tag" 1>$null 2>$null
  } catch {
    Write-Host "Release create error (likely already exists). Continuing..."
  }
}

function Get-RemoteAssets($tag) {
  try {
    $json = & gh release view $tag --repo $Repo --json assets 2>$null
    if (!$json) { return @{} }
    $obj = $json | ConvertFrom-Json
    $set = @{}
    foreach ($a in $obj.assets) { $set[$a.name] = $true }
    return $set
  } catch {
    return @{}
  }
}

function RunningCount($list) {
  $c = 0
  foreach ($j in $list) {
    if ($j -and $j.State -eq "Running") { $c++ }
  }
  return $c
}

if (!(Test-Path $BatchesDir)) { throw "BatchesDir not found: $BatchesDir" }

& gh auth status | Out-Null

# Use a real list to avoid '+=' array coercion issues
$jobs = New-Object System.Collections.Generic.List[object]
$totalQueued = 0

for ($i = 0; $i -le 28; $i++) {
  $tag = ("files-{0:D3}" -f $i)
  $folderPath = Join-Path $BatchesDir $tag

  if (!(Test-Path $folderPath)) {
    Write-Host "Skipping $tag (folder missing)"
    continue
  }

  Write-Host ""
  Write-Host "==> Processing $tag"
  Ensure-Release $tag

  $remote = Get-RemoteAssets $tag
  $zips = Get-ChildItem -Path $folderPath -Filter *.zip -File | Sort-Object Name
  if ($zips.Count -eq 0) {
    Write-Host "  No zips in $tag"
    continue
  }

  foreach ($z in $zips) {
    if ($remote.ContainsKey($z.Name)) { continue }

    while (RunningCount $jobs -ge $MaxParallel) {
      $done = Wait-Job -Job ($jobs.ToArray()) -Any
      if ($done) {
        Receive-Job $done | Out-Null
        Remove-Job $done
        # remove it from list
        for ($k = $jobs.Count - 1; $k -ge 0; $k--) {
          if ($jobs[$k].Id -eq $done.Id) { $jobs.RemoveAt($k) }
        }
      }
    }

    Write-Host "  Upload: $($z.Name)"

    $job = Start-Job -ScriptBlock {
      param($Tag, $FilePath, $RepoName)
      & gh release upload $Tag $FilePath --repo $RepoName --clobber 1>$null 2>$null
    } -ArgumentList $tag, $z.FullName, $Repo

    $jobs.Add($job) | Out-Null
    $totalQueued++
  }
}

if ($jobs.Count -gt 0) {
  Write-Host ""
  Write-Host "Waiting for remaining uploads..."
  while ($jobs.Count -gt 0) {
    $done = Wait-Job -Job ($jobs.ToArray()) -Any
    if ($done) {
      Receive-Job $done | Out-Null
      Remove-Job $done
      for ($k = $jobs.Count - 1; $k -ge 0; $k--) {
        if ($jobs[$k].Id -eq $done.Id) { $jobs.RemoveAt($k) }
      }
    }
  }
}

Write-Host ""
Write-Host "Done."
Write-Host "Queued uploads this run: $totalQueued"
