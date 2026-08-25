/**
 * install-staged-extension.js
 * Automatically deploys the StreamDock extension to Adobe CEP extensions directory
 * with in-place overwrite and enables CSXS PlayerDebugMode in the Windows registry.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTENSION_ID = 'com.streamdock.youtube.downloader';
const SOURCE_DIR = path.resolve(__dirname, '..');

function enablePlayerDebugMode() {
  console.log('--- Enabling CEP PlayerDebugMode ---');
  const csxsVersions = [10, 11, 12, 13, 14, 15, 16];
  for (const v of csxsVersions) {
    try {
      execSync(`reg add "HKCU\\Software\\Adobe\\CSXS.${v}" /v PlayerDebugMode /t REG_SZ /d 1 /f`, { stdio: 'ignore' });
      console.log(`✓ Enabled PlayerDebugMode for CSXS.${v}`);
    } catch (e) {
      // ignore
    }
  }
}

function copyDirectoryInPlace(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'downloads') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryInPlace(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        // If file locked, print warning and continue
        console.warn(`Warning: Could not overwrite ${entry.name} (locked)`);
      }
    }
  }
}

function installExtension() {
  console.log('--- Installing StreamDock to Premiere Pro CEP ---');

  const appData = process.env.APPDATA;
  if (!appData) {
    console.error('Could not determine APPDATA directory');
    return;
  }

  const userCepDir = path.join(appData, 'Adobe', 'CEP', 'extensions');
  const targetExtensionDir = path.join(userCepDir, EXTENSION_ID);

  console.log(`Source directory: ${SOURCE_DIR}`);
  console.log(`Target directory: ${targetExtensionDir}`);

  // In-place copy to avoid locked directory issues
  copyDirectoryInPlace(SOURCE_DIR, targetExtensionDir);
  console.log('✓ Successfully deployed extension files to CEP extensions folder!');

  enablePlayerDebugMode();

  console.log('\n======================================================');
  console.log('🎉 StreamDock Extension Updated Successfully!');
  console.log('======================================================\n');
}

installExtension();
