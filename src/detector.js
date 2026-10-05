import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const binaryAvailabilityCache = new Map();

/**
 * Checks if a CLI binary (pnpm, yarn, bun, npm) is accessible in PATH.
 * @param {string} name
 * @returns {boolean}
 */
export function isBinaryAvailable(name) {
  if (!name) return false;
  if (binaryAvailabilityCache.has(name)) {
    return binaryAvailabilityCache.get(name);
  }
  try {
    const cmd = process.platform === 'win32' ? `where.exe ${name}` : `which ${name}`;
    execSync(cmd, { stdio: 'ignore' });
    binaryAvailabilityCache.set(name, true);
    return true;
  } catch (_) {
    binaryAvailabilityCache.set(name, false);
    return false;
  }
}

/**
 * Detects the runtime, framework, entrypoint, and recommended configuration
 * for a project in any directory.
 *
 * @param {string} projectDir
 * @param {object} [options]
 * @returns {Promise<ProjectConfig>}
 */
export async function detectProject(projectDir, options = {}) {
  const resolvedDir = path.resolve(projectDir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory does not exist: ${resolvedDir}`);
  }

  const stat = fs.statSync(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedDir}`);
  }

  const files = fs.readdirSync(resolvedDir);
  const fileSet = new Set(files);

  // 1. Docker Compose
  if (fileSet.has('docker-compose.yml') || fileSet.has('docker-compose.yaml') || fileSet.has('compose.yaml') || fileSet.has('compose.yml')) {
    const composeFile = fileSet.has('compose.yaml') ? 'compose.yaml' :
      fileSet.has('compose.yml') ? 'compose.yml' :
      fileSet.has('docker-compose.yml') ? 'docker-compose.yml' : 'docker-compose.yaml';
    
    let estimatedPort = 8080;
    try {
      const content = fs.readFileSync(path.join(resolvedDir, composeFile), 'utf8');
      const portMatch = content.match(/["']?(\d{2,5}):\d{2,5}["']?/);
      if (portMatch) estimatedPort = parseInt(portMatch[1], 10);
    } catch {}

    return {
      type: 'docker-compose',
      name: 'Docker Compose',
      framework: 'Containerized Stack',
      command: 'docker',
      args: ['compose', '-f', composeFile, 'up'],
      defaultPort: estimatedPort,
      cwd: resolvedDir,
      env: {},
      detectedFiles: [composeFile]
    };
  }

  // 2. Dockerfile
  if (fileSet.has('Dockerfile')) {
    let exposedPort = 8080;
    try {
      const content = fs.readFileSync(path.join(resolvedDir, 'Dockerfile'), 'utf8');
      const exposeMatch = content.match(/EXPOSE\s+(\d{2,5})/i);
      if (exposeMatch) exposedPort = parseInt(exposeMatch[1], 10);
    } catch {}

    const imageName = `anyrun-${path.basename(resolvedDir).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'app'}`;
    return {
      type: 'docker',
      name: 'Docker Container',
      framework: 'Dockerfile',
      command: 'docker',
      args: ['build', '-t', imageName, '.', '&&', 'docker', 'run', '-p', `${exposedPort}:${exposedPort}`, imageName],
      defaultPort: exposedPort,
      cwd: resolvedDir,
      env: {},
      detectedFiles: ['Dockerfile']
    };
  }

  // 3. Node.js Ecosystem
  if (fileSet.has('package.json')) {
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(resolvedDir, 'package.json'), 'utf8'));
    } catch (e) {
      pkg = {};
    }

    const scripts = pkg.scripts || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    // Package manager (pnpm, yarn, bun, npm)
    let pkgManager = options.packageManager && options.packageManager !== 'auto'
      ? options.packageManager
      : null;

    if (!pkgManager) {
      if (pkg.packageManager) {
        if (pkg.packageManager.startsWith('pnpm')) pkgManager = 'pnpm';
        else if (pkg.packageManager.startsWith('yarn')) pkgManager = 'yarn';
        else if (pkg.packageManager.startsWith('bun')) pkgManager = 'bun';
        else if (pkg.packageManager.startsWith('npm')) pkgManager = 'npm';
      }

      if (!pkgManager) {
        const lockCandidates = [];

        if (fileSet.has('pnpm-lock.yaml') || fileSet.has('pnpm-workspace.yaml') || fileSet.has('.pnpmfile.cjs')) {
          let mtime = 0;
          try { mtime = fs.statSync(path.join(resolvedDir, 'pnpm-lock.yaml')).mtimeMs; } catch (_) {}
          lockCandidates.push({ pm: 'pnpm', mtime });
        }
        if (fileSet.has('package-lock.json')) {
          let mtime = 0;
          try { mtime = fs.statSync(path.join(resolvedDir, 'package-lock.json')).mtimeMs; } catch (_) {}
          lockCandidates.push({ pm: 'npm', mtime });
        }
        if (fileSet.has('yarn.lock')) {
          let mtime = 0;
          try { mtime = fs.statSync(path.join(resolvedDir, 'yarn.lock')).mtimeMs; } catch (_) {}
          lockCandidates.push({ pm: 'yarn', mtime });
        }
        if (fileSet.has('bun.lockb') || fileSet.has('bun.lock')) {
          let mtime = 0;
          const bunFile = fileSet.has('bun.lockb') ? 'bun.lockb' : 'bun.lock';
          try { mtime = fs.statSync(path.join(resolvedDir, bunFile)).mtimeMs; } catch (_) {}
          lockCandidates.push({ pm: 'bun', mtime });
        }

        if (lockCandidates.length === 1) {
          pkgManager = lockCandidates[0].pm;
        } else if (lockCandidates.length > 1) {
          // If multiple lockfiles exist, prioritize the one actively updated most recently
          lockCandidates.sort((a, b) => b.mtime - a.mtime);
          pkgManager = lockCandidates[0].pm;
        } else {
          pkgManager = 'npm';
        }
      }
    }

    // Safety fallback: if detected package manager is not installed in system PATH, gracefully fallback to npm
    if (pkgManager && pkgManager !== 'npm' && !isBinaryAvailable(pkgManager)) {
      pkgManager = 'npm';
    }
    if (!pkgManager) pkgManager = 'npm';

    // Framework detection & Port defaults
    let framework = 'Node.js';
    let defaultPort = 3000;

    if (deps['next']) {
      framework = 'Next.js';
      defaultPort = 3000;
    } else if (deps['vite']) {
      framework = 'Vite';
      defaultPort = 5173;

      // Inspect vite.config for custom port override
      const viteConfigFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
      for (const vf of viteConfigFiles) {
        if (fileSet.has(vf)) {
          try {
            const vContent = fs.readFileSync(path.join(resolvedDir, vf), 'utf8');
            const portMatch = vContent.match(/port\s*:\s*(\d{2,5})/);
            if (portMatch && portMatch[1]) {
              defaultPort = parseInt(portMatch[1], 10);
              break;
            }
          } catch {}
        }
      }
    } else if (deps['@angular/core']) {
      framework = 'Angular';
      defaultPort = 4200;
    } else if (deps['@remix-run/react'] || deps['remix']) {
      framework = 'Remix';
      defaultPort = 3000;
    } else if (deps['nuxt'] || deps['nuxt3']) {
      framework = 'Nuxt';
      defaultPort = 3000;
    } else if (deps['astro']) {
      framework = 'Astro';
      defaultPort = 4321;
    } else if (deps['@sveltejs/kit']) {
      framework = 'SvelteKit';
      defaultPort = 5173;
    } else if (deps['gatsby']) {
      framework = 'Gatsby';
      defaultPort = 8000;
    } else if (deps['express']) {
      framework = 'Express';
      defaultPort = 3000;
    } else if (deps['@nestjs/core']) {
      framework = 'NestJS';
      defaultPort = 3000;
    } else if (deps['fastify']) {
      framework = 'Fastify';
      defaultPort = 3000;
    } else if (deps['react-scripts']) {
      framework = 'Create React App';
      defaultPort = 3000;
    }

    // Determine script to execute
    let selectedScript = null;
    if (scripts['dev']) selectedScript = 'dev';
    else if (scripts['start']) selectedScript = 'start';
    else if (scripts['serve']) selectedScript = 'serve';
    else if (scripts['preview']) selectedScript = 'preview';

    // Check if script has an embedded port flag
    if (selectedScript && scripts[selectedScript]) {
      const scriptBody = scripts[selectedScript];
      const portFlag = scriptBody.match(/(?:--port|-p)\s+(\d{2,5})/);
      if (portFlag && portFlag[1]) {
        defaultPort = parseInt(portFlag[1], 10);
      }
    }

    const hasNodeModules = fileSet.has('node_modules');
    let command = pkgManager;
    let args = selectedScript ? ['run', selectedScript] : ['start'];

    if (!selectedScript && !scripts['start']) {
      if (fileSet.has('server.js')) {
        command = 'node';
        args = ['server.js'];
      } else if (fileSet.has('index.js')) {
        command = 'node';
        args = ['index.js'];
      } else if (fileSet.has('app.js')) {
        command = 'node';
        args = ['app.js'];
      }
    }

    return {
      type: 'nodejs',
      name: `Node.js (${framework})`,
      framework,
      command,
      args,
      defaultPort,
      packageManager: pkgManager,
      needsInstall: !hasNodeModules,
      installCommand: `${pkgManager} install`,
      cwd: resolvedDir,
      env: { PORT: String(defaultPort), HOST: '0.0.0.0' },
      detectedFiles: ['package.json']
    };
  }

  // 4. Python Ecosystem
  const isPython = fileSet.has('requirements.txt') ||
    fileSet.has('pyproject.toml') ||
    fileSet.has('Pipfile') ||
    fileSet.has('manage.py') ||
    fileSet.has('app.py') ||
    fileSet.has('main.py') ||
    fileSet.has('wsgi.py');

  if (isPython) {
    let framework = 'Python';
    let command = process.platform === 'win32' ? 'py' : 'python3';

    // Detect project-local virtual environments (.venv, venv, env)
    const venvCandidates = ['.venv', 'venv', 'env'];
    for (const venv of venvCandidates) {
      const venvWin = path.join(resolvedDir, venv, 'Scripts', 'python.exe');
      const venvUnix = path.join(resolvedDir, venv, 'bin', 'python');
      if (process.platform === 'win32' && fs.existsSync(venvWin)) {
        command = venvWin;
        break;
      } else if (process.platform !== 'win32' && fs.existsSync(venvUnix)) {
        command = venvUnix;
        break;
      }
    }

    let args = [];
    let defaultPort = 8000;

    if (fileSet.has('manage.py')) {
      framework = 'Django';
      args = ['manage.py', 'runserver', '0.0.0.0:8000'];
      defaultPort = 8000;
    } else if (fileSet.has('main.py') || fileSet.has('app.py')) {
      const entryFile = fileSet.has('main.py') ? 'main.py' : 'app.py';
      const fileContent = fs.readFileSync(path.join(resolvedDir, entryFile), 'utf8');

      if (fileContent.includes('FastAPI') || fileContent.includes('fastapi')) {
        framework = 'FastAPI';
        const modName = entryFile.replace('.py', '');
        args = ['-m', 'uvicorn', `${modName}:app`, '--host', '0.0.0.0', '--port', '8000', '--reload'];
        defaultPort = 8000;
      } else if (fileContent.includes('Flask') || fileContent.includes('flask')) {
        framework = 'Flask';
        args = ['-m', 'flask', 'run', '--host', '0.0.0.0', '--port', '5000'];
        defaultPort = 5000;
      } else if (fileContent.includes('streamlit') || fileContent.includes('Streamlit')) {
        framework = 'Streamlit';
        args = ['-m', 'streamlit', 'run', entryFile, '--server.port', '8501', '--server.address', '0.0.0.0'];
        defaultPort = 8501;
      } else if (fileContent.includes('gradio') || fileContent.includes('Gradio')) {
        framework = 'Gradio';
        args = [entryFile];
        defaultPort = 7860;
      } else {
        framework = 'Standard Python';
        args = [entryFile];
        defaultPort = 8000;
      }
    } else {
      args = ['-m', 'http.server', '8000', '--bind', '0.0.0.0'];
    }

    return {
      type: 'python',
      name: `Python (${framework})`,
      framework,
      command,
      args,
      defaultPort,
      cwd: resolvedDir,
      env: { PORT: String(defaultPort), HOST: '0.0.0.0', PYTHONUNBUFFERED: '1' },
      detectedFiles: files.filter(f => ['requirements.txt', 'pyproject.toml', 'manage.py', 'main.py', 'app.py'].includes(f))
    };
  }

  // 5. Go
  if (fileSet.has('go.mod') || fileSet.has('main.go')) {
    return {
      type: 'go',
      name: 'Go Application',
      framework: 'Go',
      command: 'go',
      args: ['run', '.'],
      defaultPort: 8080,
      cwd: resolvedDir,
      env: { PORT: '8080' },
      detectedFiles: files.filter(f => f === 'go.mod' || f === 'main.go')
    };
  }

  // 6. Rust
  if (fileSet.has('Cargo.toml')) {
    return {
      type: 'rust',
      name: 'Rust Application',
      framework: 'Cargo',
      command: 'cargo',
      args: ['run'],
      defaultPort: 8080,
      cwd: resolvedDir,
      env: { PORT: '8080' },
      detectedFiles: ['Cargo.toml']
    };
  }

  // 7. PHP
  if (fileSet.has('artisan')) {
    return {
      type: 'php-laravel',
      name: 'PHP Laravel',
      framework: 'Laravel',
      command: 'php',
      args: ['artisan', 'serve', '--host', '0.0.0.0', '--port', '8000'],
      defaultPort: 8000,
      cwd: resolvedDir,
      env: { PORT: '8000' },
      detectedFiles: ['artisan']
    };
  } else if (fileSet.has('index.php')) {
    return {
      type: 'php',
      name: 'PHP Built-in Server',
      framework: 'Vanilla PHP',
      command: 'php',
      args: ['-S', '0.0.0.0:8000'],
      defaultPort: 8000,
      cwd: resolvedDir,
      env: {},
      detectedFiles: ['index.php']
    };
  }

  // 8. Java / Gradle / Maven
  if (fileSet.has('pom.xml')) {
    return {
      type: 'java-maven',
      name: 'Java (Maven)',
      framework: 'Maven',
      command: 'mvn',
      args: ['spring-boot:run'],
      defaultPort: 8080,
      cwd: resolvedDir,
      env: { PORT: '8080' },
      detectedFiles: ['pom.xml']
    };
  } else if (fileSet.has('build.gradle') || fileSet.has('build.gradle.kts')) {
    const gradleCmd = fileSet.has('gradlew.bat') ? '.\\gradlew.bat' : 'gradle';
    return {
      type: 'java-gradle',
      name: 'Java / Kotlin (Gradle)',
      framework: 'Gradle',
      command: gradleCmd,
      args: ['bootRun'],
      defaultPort: 8080,
      cwd: resolvedDir,
      env: { PORT: '8080' },
      detectedFiles: ['build.gradle']
    };
  }

  // 9. Static Web Page / Frontend Assets
  if (fileSet.has('index.html')) {
    return {
      type: 'static',
      name: 'Static Web Site',
      framework: 'HTML5 / Web',
      command: 'internal:static',
      args: [],
      defaultPort: 5000,
      cwd: resolvedDir,
      isStatic: true,
      env: {},
      detectedFiles: ['index.html']
    };
  }

  // 10. Fallback
  const hasWebFiles = files.some(f => /\.(html|htm|js|css|json)$/i.test(f));
  if (hasWebFiles) {
    return {
      type: 'static',
      name: 'Static Directory',
      framework: 'Static Files',
      command: 'internal:static',
      args: [],
      defaultPort: 5000,
      cwd: resolvedDir,
      isStatic: true,
      env: {},
      detectedFiles: files.filter(f => /\.(html|htm|js|css)$/i.test(f))
    };
  }

  return {
    type: 'unknown',
    name: 'Generic Project',
    framework: 'Unknown',
    command: 'internal:static',
    args: [],
    defaultPort: 8080,
    cwd: resolvedDir,
    isStatic: true,
    env: {},
    detectedFiles: []
  };
}
