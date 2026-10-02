import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

if (process.platform !== 'win32') {
  console.log('[Info] Desktop shortcut creation is supported natively on Windows.');
  process.exit(0);
}

try {
  const targetExe = path.join(rootDir, 'dist-desktop', 'AnyRun-win32-x64', 'AnyRun.exe');
  const fallbackBat = path.join(rootDir, 'run-app.bat');
  const target = fs.existsSync(targetExe) ? targetExe : fallbackBat;
  const iconPath = path.join(rootDir, 'src', 'desktop', 'assets', 'icon.ico');

  const psCommand = [
    '$WshShell = New-Object -ComObject WScript.Shell;',
    "$DesktopPath = $WshShell.SpecialFolders('Desktop');",
    "$ShortcutPath = Join-Path $DesktopPath 'AnyRun.lnk';",
    '$Shortcut = $WshShell.CreateShortcut($ShortcutPath);',
    `$Shortcut.TargetPath = '${target.replace(/'/g, "''")}';`,
    `$Shortcut.WorkingDirectory = '${rootDir.replace(/'/g, "''")}';`,
    `$Shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}';`,
    `$Shortcut.Description = 'AnyRun - Universal Project Runner & Public Tunnel Gateway';`,
    '$Shortcut.Save();',
    "Write-Host 'Shortcut created at:' $ShortcutPath;"
  ].join(' ');

  const result = execSync(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, { encoding: 'utf8' });
  console.log(`\n✔ Desktop shortcut created successfully!\n${result.trim()}\n`);
} catch (err) {
  console.error('[Error] Could not create desktop shortcut:', err.message);
  process.exit(1);
}
