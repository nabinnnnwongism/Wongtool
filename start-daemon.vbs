' start-daemon.vbs
' Launches the Wong Micro-Daemon completely hidden in the background (0 windows).
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get directory of this script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Command to launch node wong-daemon.js
cmd = "node """ & scriptDir & "\wong-daemon.js"""

' Run with window style 0 (hidden) and False (do not wait)
WshShell.CurrentDirectory = scriptDir
WshShell.Run cmd, 0, False
