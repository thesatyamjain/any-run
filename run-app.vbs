' AnyRun Silent Standalone App Launcher
' Launches AnyRun desktop app with zero CMD window flash

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

exePath = scriptDir & "\dist-desktop\AnyRun-win32-x64\AnyRun.exe"

args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " """ & WScript.Arguments(i) & """"
Next

If fso.FileExists(exePath) Then
    cmd = """" & exePath & """" & args
    WshShell.Run cmd, 1, False
Else
    cmd = "cmd /c """"" & scriptDir & "\run-app.bat"""" " & args
    WshShell.Run cmd, 0, False
End If
