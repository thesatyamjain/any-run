' AnyRun Universal Silent Background Launcher
' Launches AnyRun in the background with zero CMD window flash
' Automatically exits when the Web Control Center browser tab is closed

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " """ & WScript.Arguments(i) & """"
Next

' Enable auto-exit when browser closes
WshShell.Environment("PROCESS")("ANYRUN_AUTO_EXIT") = "1"

' Launch node completely hidden (0 = SW_HIDE, False = async non-blocking)
cmd = "node """ & scriptDir & "\bin\any-run.js""" & args & " --auto-exit"
WshShell.Run cmd, 0, False
