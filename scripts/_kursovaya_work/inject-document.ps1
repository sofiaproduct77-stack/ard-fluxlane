
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dest = 'C:/Users/dtro2/Downloads/Kursovaya_FluxLane_poyasnitelnaya.docx'
$docPath = 'C:/Users/dtro2/Desktop/ARD/scripts/_kursovaya_work/unpacked/word/document.xml'
$zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Update)
$old = $zip.GetEntry('word/document.xml')
if ($old) { $old.Delete() }
$entry = $zip.CreateEntry('word/document.xml', [System.IO.Compression.CompressionLevel]::Optimal)
$in = [System.IO.File]::OpenRead($docPath)
$out = $entry.Open()
$in.CopyTo($out)
$out.Close()
$in.Close()
$zip.Dispose()
Write-Host "Updated word/document.xml in" $dest
