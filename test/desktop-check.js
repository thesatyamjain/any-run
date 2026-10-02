import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function testDesktopApp() {
  console.log('>>> Starting AnyRun Desktop & Multi-OS App Test Suite...\n');

  // 1. Verify package.json configuration
  console.log('Checking package.json desktop configuration...');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  assert.strictEqual(pkg.main, 'src/desktop/main.js', 'package.json main must point to desktop entry');
  assert.ok(pkg.exports && pkg.exports['.'], 'package.json must provide exports map for library use');
  assert.strictEqual(pkg.exports['.'], './src/index.js', 'exports . must point to src/index.js');
  assert.ok(pkg.scripts.app, 'scripts.app must exist');
  assert.ok(pkg.scripts['build:app'], 'scripts.build:app must exist');
  assert.ok(pkg.scripts['build:app:win'], 'scripts.build:app:win must exist');
  assert.ok(pkg.scripts['build:app:mac'], 'scripts.build:app:mac must exist');
  assert.ok(pkg.scripts['build:app:linux'], 'scripts.build:app:linux must exist');

  // Verify multi-OS build targets
  assert.ok(pkg.build, 'electron-builder build config must be defined');
  assert.strictEqual(pkg.build.appId, 'com.anyrun.desktop');
  assert.ok(pkg.build.win, 'Windows target must be defined');
  assert.ok(pkg.build.mac, 'macOS target must be defined');
  assert.ok(pkg.build.linux, 'Linux target must be defined');
  console.log('  [PASS] package.json desktop & multi-OS configurations verified.');

  // 2. Verify Desktop App Source Files
  console.log('\nChecking desktop source files & preload bridge...');
  const mainJsPath = path.join(rootDir, 'src', 'desktop', 'main.js');
  const preloadJsPath = path.join(rootDir, 'src', 'desktop', 'preload.js');

  assert.ok(fs.existsSync(mainJsPath), 'main.js must exist');
  assert.ok(fs.existsSync(preloadJsPath), 'preload.js must exist');

  const preloadContent = fs.readFileSync(preloadJsPath, 'utf8');
  assert.ok(preloadContent.includes('electronAPI'), 'preload must expose electronAPI');
  assert.ok(preloadContent.includes('selectDirectory'), 'preload must expose selectDirectory');
  assert.ok(preloadContent.includes('openExternal'), 'preload must expose openExternal');
  assert.ok(preloadContent.includes('notify'), 'preload must expose notify');
  assert.ok(preloadContent.includes('onProjectSelected'), 'preload must expose onProjectSelected');
  console.log('  [PASS] Desktop main process and preload bridge verified.');

  // 3. Verify App Icon Assets
  console.log('\nChecking app icon assets...');
  const assetsDir = path.join(rootDir, 'src', 'desktop', 'assets');
  const svgIcon = path.join(assetsDir, 'icon.svg');
  const pngIcon = path.join(assetsDir, 'icon.png');
  const icoIcon = path.join(assetsDir, 'icon.ico');

  assert.ok(fs.existsSync(svgIcon) && fs.statSync(svgIcon).size > 500, 'icon.svg must exist');
  assert.ok(fs.existsSync(pngIcon) && fs.statSync(pngIcon).size > 1000, 'icon.png must exist');
  assert.ok(fs.existsSync(icoIcon) && fs.statSync(icoIcon).size > 1000, 'icon.ico must exist');
  console.log('  [PASS] Multi-resolution icon assets (SVG, PNG, ICO) verified.');

  // 3b. Verify 1-Click Launchers
  console.log('\nChecking 1-click application launchers...');
  assert.ok(fs.existsSync(path.join(rootDir, 'run-app.bat')), 'run-app.bat must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'run-app.vbs')), 'run-app.vbs must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'run-app.sh')), 'run-app.sh must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'create-desktop-shortcut.bat')), 'create-desktop-shortcut.bat must exist');
  console.log('  [PASS] 1-Click launchers (run-app.bat, run-app.vbs, run-app.sh, create-desktop-shortcut.bat) verified.');

  // 4. Verify Web Dashboard backward compatibility
  console.log('\nChecking web dashboard backward compatibility...');
  const appJsPath = path.join(rootDir, 'src', 'ui', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Verify that browseBtn falls back to web file browser when not in electron
  assert.ok(appJsContent.includes('window.electronAPI.selectDirectory'), 'app.js must check for electronAPI.selectDirectory');
  assert.ok(appJsContent.includes('openFolderBrowser'), 'app.js must retain web folder browser fallback');
  assert.ok(appJsContent.includes('onProjectSelected'), 'app.js must register onProjectSelected');
  // 5. Verify GitHub Release Workflow
  console.log('\nChecking GitHub Release workflow configuration...');
  const releaseYmlPath = path.join(rootDir, '.github', 'workflows', 'release.yml');
  assert.ok(fs.existsSync(releaseYmlPath), 'release.yml must exist');
  const releaseYml = fs.readFileSync(releaseYmlPath, 'utf8');
  assert.ok(releaseYml.includes("tags:\n      - 'v*'"), 'release.yml must trigger on version tags');
  assert.ok(releaseYml.includes('action-gh-release'), 'release.yml must publish GitHub releases');
  assert.ok(releaseYml.includes('windows-latest') && releaseYml.includes('macos-latest') && releaseYml.includes('ubuntu-latest'), 'release.yml must build across all 3 major OSes');
  // 6. Verify Production Security & Hardening
  console.log('\nChecking production security & hardening...');
  const serverJsPath = path.join(rootDir, 'src', 'server.js');
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');
  assert.ok(serverJs.includes('X-Content-Type-Options') && serverJs.includes('nosniff'), 'server.js must set X-Content-Type-Options');
  assert.ok(serverJs.includes('X-Frame-Options') && serverJs.includes('SAMEORIGIN'), 'server.js must set X-Frame-Options');
  assert.ok(serverJs.includes('Referrer-Policy'), 'server.js must set Referrer-Policy');

  const mainJs = fs.readFileSync(path.join(rootDir, 'src', 'desktop', 'main.js'), 'utf8');
  assert.ok(mainJs.includes('sandbox: true'), 'main.js must enable sandbox');
  assert.ok(mainJs.includes('webSecurity: true'), 'main.js must enable webSecurity');
  assert.ok(mainJs.includes("parsed.protocol === 'http:' || parsed.protocol === 'https:'"), 'main.js must strictly validate external URLs');

  assert.ok(pkg.repository && pkg.repository.url, 'package.json must contain repository url');
  assert.ok(pkg.homepage, 'package.json must contain homepage url');
  assert.ok(pkg.bugs && pkg.bugs.url, 'package.json must contain bugs url');
  console.log('  [PASS] Production security headers, Chromium sandbox, URL validation, and metadata verified.');

  // 7. Verify GitHub Readiness & Community Files
  console.log('\nChecking GitHub readiness & community health standards...');
  assert.ok(fs.existsSync(path.join(rootDir, '.gitattributes')), '.gitattributes must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'LICENSE')), 'LICENSE must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'CONTRIBUTING.md')), 'CONTRIBUTING.md must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'SECURITY.md')), 'SECURITY.md must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'CODE_OF_CONDUCT.md')), 'CODE_OF_CONDUCT.md must exist');
  assert.ok(fs.existsSync(path.join(rootDir, '.github', 'pull_request_template.md')), 'pull_request_template.md must exist');
  assert.ok(fs.existsSync(path.join(rootDir, '.github', 'workflows', 'ci.yml')), 'ci.yml must exist');
  assert.ok(fs.existsSync(path.join(rootDir, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml')), 'bug_report.yml must exist');
  assert.ok(fs.existsSync(path.join(rootDir, '.github', 'ISSUE_TEMPLATE', 'feature_request.yml')), 'feature_request.yml must exist');
  console.log('  [PASS] GitHub standards (license, contributing, security, code of conduct, PR template, CI) verified.');

  console.log('\n>>> All AnyRun Desktop & Multi-OS App tests PASSED successfully!\n');
}

testDesktopApp().catch(err => {
  console.error('\n[FAIL] Desktop test failed:', err);
  process.exit(1);
});
