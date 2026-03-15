#!/usr/bin/env node

/**
 * Resolves symlinks in Next.js standalone output for Windows packaging.
 *
 * pnpm's node_modules uses symlinks (e.g., next → .pnpm/next@16.x/node_modules/next).
 * These don't survive electron-builder packaging on Windows where NTFS symlink
 * handling is problematic. This script replaces every symlink with a real copy
 * of its target.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.error('ERROR: .next/standalone does not exist — run "pnpm run build" first');
  process.exit(1);
}

let resolved = 0;
let skipped = 0;

function resolveSymlinks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) {
      let realTarget;
      try {
        realTarget = fs.realpathSync(fullPath);
      } catch {
        // Target doesn't exist — broken symlink, remove it
        console.log(`  Removing broken symlink: ${path.relative(standaloneDir, fullPath)}`);
        fs.rmSync(fullPath);
        skipped++;
        continue;
      }

      // Remove the symlink
      fs.rmSync(fullPath);

      let targetStat;
      try {
        targetStat = fs.statSync(realTarget);
      } catch {
        skipped++;
        continue;
      }

      if (targetStat.isDirectory()) {
        // Copy directory, dereferencing nested symlinks during copy
        fs.cpSync(realTarget, fullPath, { recursive: true, dereference: true });
      } else {
        fs.copyFileSync(realTarget, fullPath);
      }

      resolved++;
    } else if (stat.isDirectory()) {
      resolveSymlinks(fullPath);
    }
  }
}

console.log('Resolving symlinks in standalone output...');
resolveSymlinks(standaloneDir);
console.log(`Resolved ${resolved} symlink(s), skipped ${skipped}`);

// Verification pass — confirm zero symlinks remain
let remaining = 0;

function countSymlinks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) {
      console.error(`  Remaining symlink: ${path.relative(standaloneDir, fullPath)}`);
      remaining++;
    } else if (stat.isDirectory()) {
      countSymlinks(fullPath);
    }
  }
}

countSymlinks(standaloneDir);

if (remaining > 0) {
  console.error(`ERROR: ${remaining} symlink(s) still remain after resolution`);
  process.exit(1);
}

console.log('Verification passed — zero symlinks remain in standalone output');
