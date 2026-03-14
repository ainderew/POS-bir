#!/usr/bin/env node

/**
 * Fixes Next.js standalone output structure for Electron packaging.
 *
 * Next.js standalone nests files under the project's full filesystem path
 * (e.g., standalone/projects/general-store-pos/server.js). This script
 * copies .next/static and public into the nested directory so the server
 * can find them at runtime.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const standaloneDir = path.join(projectRoot, '.next', 'standalone');

// Check if server.js is at the root of standalone
const rootServerPath = path.join(standaloneDir, 'server.js');
if (fs.existsSync(rootServerPath)) {
  console.log('server.js found at standalone root — no fix needed');
  process.exit(0);
}

// Find the nested server.js
function findFile(dir, name, depth = 0) {
  if (depth > 5) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name === name) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
      const found = findFile(path.join(dir, e.name), name, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const nestedServerPath = findFile(standaloneDir, 'server.js');
if (!nestedServerPath) {
  console.error('ERROR: Could not find server.js in standalone output');
  process.exit(1);
}

const serverDir = path.dirname(nestedServerPath);
console.log(`Found nested server.js at: ${path.relative(projectRoot, nestedServerPath)}`);

// Copy .next/static into the nested directory
const staticSrc = path.join(projectRoot, '.next', 'static');
const staticDest = path.join(serverDir, '.next', 'static');

if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log(`Copied .next/static -> ${path.relative(projectRoot, staticDest)}`);
}

// Copy public into the nested directory
const publicSrc = path.join(projectRoot, 'public');
const publicDest = path.join(serverDir, 'public');

if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log(`Copied public -> ${path.relative(projectRoot, publicDest)}`);
}

// Validate that all required files/directories exist in the nested dir
const requiredPaths = [
  { path: nestedServerPath, label: 'server.js' },
  { path: staticDest, label: '.next/static' },
  { path: publicDest, label: 'public' },
];

let valid = true;
for (const { path: p, label } of requiredPaths) {
  if (fs.existsSync(p)) {
    console.log(`  ✓ ${label} exists`);
  } else {
    console.error(`  ✗ ${label} is MISSING at ${p}`);
    valid = false;
  }
}

if (!valid) {
  console.error('ERROR: Standalone validation failed — required files are missing');
  process.exit(1);
}

console.log('Standalone structure fixed and validated successfully');
