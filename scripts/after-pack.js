#!/usr/bin/env node

// electron-builder afterPack hook.
//
// electron-builder strips node_modules/ and .next/ from extraResources
// even with a wildcard filter. This hook restores them from the build
// output after packing but before the installer is created.

const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  // Locate the Resources directory in the packaged output
  let resourcesDir;
  if (context.electronPlatformName === "darwin") {
    resourcesDir = path.join(context.appOutDir, "Contents", "Resources");
  } else {
    resourcesDir = path.join(context.appOutDir, "resources");
  }

  const standaloneTarget = path.join(resourcesDir, "standalone");
  const standaloneSource = path.join(process.cwd(), ".next", "standalone");

  if (!fs.existsSync(standaloneTarget)) {
    console.log("afterPack: standalone not found in packaged output — skipping");
    return;
  }

  // Restore node_modules if stripped
  const nmTarget = path.join(standaloneTarget, "node_modules");
  const nmSource = path.join(standaloneSource, "node_modules");
  if (!fs.existsSync(nmTarget) && fs.existsSync(nmSource)) {
    fs.cpSync(nmSource, nmTarget, { recursive: true });
    console.log("afterPack: restored node_modules to packaged standalone");
  }

  // Restore .next if stripped
  const nextTarget = path.join(standaloneTarget, ".next");
  const nextSource = path.join(standaloneSource, ".next");
  if (!fs.existsSync(nextTarget) && fs.existsSync(nextSource)) {
    fs.cpSync(nextSource, nextTarget, { recursive: true });
    console.log("afterPack: restored .next to packaged standalone");
  }

  // Log final state for debugging
  const contents = fs.readdirSync(standaloneTarget);
  console.log("afterPack: standalone contents:", contents.join(", "));
};
