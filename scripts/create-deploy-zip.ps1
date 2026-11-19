$root = "C:\Users\dtro2\Desktop\ARD"
$zipPath = "$root\fluxlane-deploy.zip"
$staging = "$root\_deploy_staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
$excludeDirs = @('node_modules', '_deploy_staging', '_ftp_upload', 'scripts\_kursovaya_work', '.git')
robocopy $root $staging /E /XD $excludeDirs /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
Copy-Item "$root\database.sqlite" "$staging\database.sqlite" -Force
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force
Write-Host "Created" $zipPath ([math]::Round((Get-Item $zipPath).Length/1MB, 2)) "MB"
