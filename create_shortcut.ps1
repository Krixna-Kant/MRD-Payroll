$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "LocalPayroll.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -Command ""cd '$PWD'; npm start"""
$Shortcut.WorkingDirectory = "$PWD"
$Shortcut.IconLocation = "$PWD\renderer\assets\icon.ico"
$Shortcut.Description = "Launch LocalPayroll Management System"
$Shortcut.Save()

Write-Host "Shortcut created successfully on Desktop!"
