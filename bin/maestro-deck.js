#!/usr/bin/env node
import { readFileSync, existsSync, lstatSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import { homedir } from 'os';
import { createInterface } from 'readline';

const __installDir = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = `maestro-deck — flexible tiled workspace for terminals, tools, dashboards, and workflows

Usage: maestro-deck [command]

Commands:
  start         Start the maestro-deck GUI (default)
  update        Check for a newer release and update if available
  version       Print the installed version
  help          Show this help message
  uninstall     Remove the binary and ~/.maestro-deck/`;

const [,, command] = process.argv;

function getVersion() {
  const versionFile = join(__installDir, 'version.txt');
  if (existsSync(versionFile)) return readFileSync(versionFile, 'utf8').trim();
  const pkg = JSON.parse(readFileSync(join(__installDir, 'package.json'), 'utf8'));
  return pkg.version;
}

function isDevMode() {
  const installLink = join(homedir(), '.maestro-deck');
  try { return lstatSync(installLink).isSymbolicLink(); } catch { return false; }
}

function compareSemver(a, b) {
  const parse = s => {
    const clean = s.replace(/^v/, '');
    const [core, pre] = clean.split('-');
    return { parts: core.split('.').map(Number), pre: pre ?? null };
  };
  const va = parse(a), vb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (va.parts[i] ?? 0) - (vb.parts[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  if (va.pre !== null && vb.pre === null) return -1;
  if (va.pre === null && vb.pre !== null) return 1;
  return 0;
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function fetchLatestTag() {
  const headers = { 'User-Agent': 'maestro-deck-cli' };

  const relRes = await fetch('https://api.github.com/repos/knork-fork/maestro-deck/releases/latest', { headers });
  if (relRes.ok) {
    const data = await relRes.json();
    if (data.tag_name) return data.tag_name;
  }

  const tagRes = await fetch('https://api.github.com/repos/knork-fork/maestro-deck/tags', { headers });
  if (tagRes.ok) {
    const tags = await tagRes.json();
    if (Array.isArray(tags) && tags.length > 0) return tags[0].name;
  }

  return null;
}

async function main() {
  switch (command) {
    case 'start':
    case undefined: {
      // Electron lives in its own isolated dir so node_modules/electron
      // never shadows the runtime built-in inside electron-main.cjs.
      const electronDir = join(homedir(), '.maestro-deck-electron');
      const electronBin = join(electronDir, 'node_modules', 'electron', 'dist', 'electron');
      if (!existsSync(electronBin)) {
        console.error(`Error: Electron not found at ${electronBin}. Re-run the installer.`);
        process.exit(1);
      }
      const guiDir = join(__installDir, 'src', 'gui');
      // Strip ELECTRON_RUN_AS_NODE — when set (e.g. by VS Code/Claude Code),
      // Electron skips main-process init and runs as plain Node.
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(electronBin, ['--no-sandbox', guiDir], {
        stdio: 'ignore',
        detached: true,
        env,
      });
      child.unref();
      break;
    }

    case 'update': {
      if (isDevMode()) {
        console.error('Error: cannot update in dev mode. Run dev.sh --release to switch to the release version, or just git pull.');
        process.exit(1);
      }
      const localVersion = getVersion();
      let latestTag = null;

      try {
        latestTag = await fetchLatestTag();
      } catch {
        // network failure
      }

      if (!latestTag) {
        const answer = await prompt('Warning: Could not check latest version. Proceed with update anyway? [y/N] ');
        if (answer.toLowerCase() !== 'y') { console.log('Aborted.'); break; }
      } else {
        const cmp = compareSemver(localVersion, latestTag);
        if (cmp >= 0) {
          console.log(`Already up to date (${localVersion}).`);
          break;
        }
        console.log(`Updating from ${localVersion} → ${latestTag}...`);
      }

      const tag = latestTag ?? 'main';
      const installUrl = `https://raw.githubusercontent.com/knork-fork/maestro-deck/${tag}/install.sh`;
      const result = spawnSync('bash', ['-c', `curl -fsSL ${installUrl} | bash`], { stdio: 'inherit' });
      process.exit(result.status ?? 0);
    }

    case 'version': {
      if (isDevMode()) { console.log('maestro-deck DEV VERSION'); break; }
      console.log(`maestro-deck ${getVersion()}`);
      break;
    }

    case 'uninstall': {
      const binLink = join(homedir(), '.local', 'bin', 'maestro-deck');
      const installDir = __installDir;
      const electronDir = join(homedir(), '.maestro-deck-electron');

      console.log('This will remove:');
      if (existsSync(binLink)) console.log(`  ${binLink}  (symlink)`);
      console.log(`  ${installDir}/`);
      if (existsSync(electronDir)) console.log(`  ${electronDir}/`);

      const answer = await prompt('\nProceed? [y/N] ');
      if (answer.toLowerCase() !== 'y') { console.log('Aborted.'); break; }

      if (existsSync(binLink)) rmSync(binLink, { force: true });
      rmSync(installDir, { recursive: true, force: true });
      if (existsSync(electronDir)) rmSync(electronDir, { recursive: true, force: true });

      console.log('maestro-deck uninstalled.');
      break;
    }

    case 'help':
    case '--help':
    case '-h': {
      console.log(USAGE);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}\nRun "maestro-deck help" for usage.`);
      process.exit(1);
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
