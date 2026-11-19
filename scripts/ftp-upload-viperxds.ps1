param(
  [string]$LocalRoot = "C:\Users\dtro2\Desktop\ARD\_ftp_upload",
  [string]$FtpBase = "ftp://141.8.192.192/domains/viperxds.ru/public_html",
  [string]$User = $env:SPRINTHOST_FTP_USER,
  [string]$Password = $env:SPRINTHOST_FTP_PASS
)

if (-not $User -or -not $Password) {
  throw "Set SPRINTHOST_FTP_USER and SPRINTHOST_FTP_PASS environment variables."
}

$auth = "$User`:$Password"
$files = Get-ChildItem -Path $LocalRoot -Recurse -File
$n = 0
foreach ($f in $files) {
  $rel = $f.FullName.Substring($LocalRoot.Length).TrimStart('\').Replace('\', '/')
  $encoded = ($rel -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  $url = "$FtpBase/$encoded"
  $pct = [math]::Round(100 * $n / $files.Count, 1)
  Write-Host "[$n/$($files.Count) $pct%] $rel"
  & curl.exe -g -s -S --ftp-create-dirs -T $f.FullName -u $auth $url
  if ($LASTEXITCODE -ne 0) { throw "FTP failed: $rel" }
  $n++
}
Write-Host "Done. Uploaded $n files."
