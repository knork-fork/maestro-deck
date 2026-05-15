#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __installDir = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = `maestro-deck — flexible tiled workspace for terminals, tools, dashboards, and workflows

Usage: maestro-deck [command]

Commands:
  start         Start the maestro-deck GUI (default)
  version       Print the installed version
  help          Show this help message`;

const [,, command] = process.argv;

function getVersion() {
  const versionFile = join(__installDir, 'version.txt');
  if (existsSync(versionFile)) return readFileSync(versionFile, 'utf8').trim();
  const pkg = JSON.parse(readFileSync(join(__installDir, 'package.json'), 'utf8'));
  return pkg.version;
}

async function main() {
  switch (command) {
    case 'start':
    case undefined: {
      console.log('hello world');
      break;
    }

    case 'version': {
      console.log(`maestro-deck ${getVersion()}`);
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
