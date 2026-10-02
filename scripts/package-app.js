import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const APP_NAME = 'AnyRun';
const outDir = path.join(rootDir, 'dist-desktop', `${APP_NAME}-${process.platform}-${process.arch}`);

console.log(`\n▲ ANYRUN // Standalone Multi-OS App Packager`);
console.log(`Target: ${process.platform}-${process.arch}`);
console.log(`Output: ${outDir}\n`);

// Clean output directory
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 1. Copy Electron distribution runtime
const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(electronDist)) {
  console.error(`[Error] Electron runtime not found at ${electronDist}`);
  process.exit(1);
}

console.log('➜ Copying standalone Electron runtime...');
fs.cpSync(electronDist, outDir, { recursive: true });

// 2. Rename executable to AnyRun
const exeName = process.platform === 'win32' ? `${APP_NAME}.exe` : APP_NAME;
const origExe = path.join(outDir, process.platform === 'win32' ? 'electron.exe' : 'electron');
const targetExe = path.join(outDir, exeName);

if (fs.existsSync(origExe)) {
  fs.renameSync(origExe, targetExe);
}

// Ensure execution permissions on POSIX
if (process.platform !== 'win32' && fs.existsSync(targetExe)) {
  try {
    fs.chmodSync(targetExe, 0o755);
  } catch (_) {}
}

// 3. Assemble app bundle in resources/app
console.log('➜ Bundling AnyRun core, UI, and runner logic into resources/app...');
const appBundleDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appBundleDir, { recursive: true });

// Copy package.json
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(appBundleDir, 'package.json'));

// Copy src
fs.cpSync(path.join(rootDir, 'src'), path.join(appBundleDir, 'src'), { recursive: true });

// Copy bin
fs.cpSync(path.join(rootDir, 'bin'), path.join(appBundleDir, 'bin'), { recursive: true });

// Copy production dependencies from node_modules
console.log('➜ Bundling and optimizing runtime dependencies...');
const appNodeModules = path.join(appBundleDir, 'node_modules');
fs.mkdirSync(appNodeModules, { recursive: true });

const prodPackages = [
  'localtunnel',
  'qrcode',
  'axios',
  'debug',
  'ms',
  'dargs',
  'openurl',
  'yargs',
  'cliui',
  'string-width',
  'strip-ansi',
  'ansi-regex',
  'wrap-ansi',
  'pngjs',
  'dijkstrajs'
];

for (const pkg of prodPackages) {
  const srcPkg = path.join(rootDir, 'node_modules', pkg);
  if (fs.existsSync(srcPkg)) {
    fs.cpSync(srcPkg, path.join(appNodeModules, pkg), { recursive: true });
  }
}

// Prune non-production clutter (test folders, documentation, source maps) from bundled dependencies
function pruneBloat(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (['test', 'tests', '__tests__', 'docs', '.github'].includes(lower)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          pruneBloat(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.map') || entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'license') {
          fs.unlinkSync(fullPath);
        }
      }
    }
  } catch (_) {}
}

pruneBloat(appNodeModules);

console.log(`\n✔ Standalone multi-OS standalone application created successfully!`);
console.log(`Executable location: ${targetExe}\n`);
