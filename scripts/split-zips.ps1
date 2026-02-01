param(
  [Parameter(Mandatory=$true)][string]$ZipDir,    # folder with all zips
  [string]$OutDir = "output",                     # where to create groups
  [int]$GroupSize = 1000
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ZipDir)) {
  throw "ZipDir not found: $ZipDir"
}

$zips = Get-ChildItem -Path $ZipDir -Filter *.zip | Sort-Object Name
if ($zips.Count -eq 0) {
  throw "No .zip files found in $ZipDir"
}

$OutDir = Resolve-Path (New-Item -ItemType Directory -Path $OutDir -Force)

Write-Host "Found $($zips.Count) zip files"
Write-Host "Grouping into folders of $GroupSize"

$groupIndex = 0
$inGroup = 0
$groupPath = ""

foreach ($z in $zips) {
  if ($inGroup -eq 0) {
    $groupName = ("files-{0:D3}" -f $groupIndex)
    $groupPath = Join-Path $OutDir $groupName
    New-Item -ItemType Directory -Path $groupPath -Force | Out-Null
    Write-Host "Creating $groupName"
  }

  Copy-Item -Path $z.FullName -Destination $groupPath

  $inGroup++

  if ($inGroup -ge $GroupSize) {
    $groupIndex++
    $inGroup = 0
  }
}

Write-Host "Done."
Write-Host "Created $($groupIndex + ($inGroup -gt 0)) folders in:"
Write-Host $OutDir
