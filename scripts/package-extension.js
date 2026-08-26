/**
 * package-extension.js
 * Creates a standalone, self-contained distributable package (folder and zip)
 * with 1-click Windows installer (INSTALL.bat) and bundled yt-dlp + ffmpeg binaries.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTENSION_ID = 'com.streamdock.youtube.downloader';
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_NAME = 'StreamDock-v2.0.0-Premiere-Pro-Extension';
const PACKAGE_DIR = path.join(DIST_DIR, PACKAGE_NAME);
const EXTENSION_PAYLOAD_DIR = path.join(PACKAGE_DIR, 'com.streamdock.youtube.downloader');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest, ignoreList = []) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoreList.includes(entry.name) || entry.name.startsWith('.')) {
      if (entry.name !== '.debug') continue; // Keep .debug
    }

    if (entry.name.endsWith('.mp4') || entry.name.endsWith('.part') || entry.name.endsWith('.old') || entry.name.endsWith('.zip') || entry.name.endsWith('.log')) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, ignoreList);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function packageExtension() {
  console.log('======================================================');
  console.log('📦 Packaging StreamDock for Distribution');
  console.log('======================================================\n');

  // Clean and prepare output directories
  if (fs.existsSync(PACKAGE_DIR)) {
    fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
  }
  ensureDir(PACKAGE_DIR);
  ensureDir(EXTENSION_PAYLOAD_DIR);

  // 1. Copy extension files
  console.log('1. Copying extension files...');
  const ignore = ['.git', 'node_modules', 'dist', 'downloads', 'tests', 'scripts', '.system_generated'];
  copyRecursive(ROOT_DIR, EXTENSION_PAYLOAD_DIR, ignore);

  // 2. Create 1-Click Windows Installer (INSTALL.bat)
  console.log('2. Creating 1-Click Windows Installer (INSTALL.bat)...');
  const installBatContent = `@echo off
chcp 65001 >nul
title StreamDock - Premiere Pro Extension Installer
color 0A

echo ======================================================
echo    StreamDock YouTube Importer for Premiere Pro
echo    1-Click Automated Installer
echo ======================================================
echo.

:: 1. Enable Adobe CEP PlayerDebugMode in Windows Registry
echo [1/3] Enabling Adobe CEP Extension Support in Registry...
reg add "HKCU\\Software\\Adobe\\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\\Software\\Adobe\\CSXS.17" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
echo [OK] Adobe CEP Debug Mode enabled!
echo.

:: 2. Target CEP extensions directory
set "TARGET_DIR=%APPDATA%\\Adobe\\CEP\\extensions\\com.streamdock.youtube.downloader"
set "SOURCE_DIR=%~dp0com.streamdock.youtube.downloader"

echo [2/3] Installing extension to:
echo %TARGET_DIR%
echo.

if not exist "%APPDATA%\\Adobe\\CEP\\extensions" (
    mkdir "%APPDATA%\\Adobe\\CEP\\extensions"
)

if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%"
)

:: 3. Copy files
echo [3/3] Copying extension files & media engines...
xcopy /E /I /Y /Q "%SOURCE_DIR%\\*" "%TARGET_DIR%\\" >nul

echo.
echo ======================================================
echo    SUCCESS! StreamDock is now installed!
echo ======================================================
echo.
echo How to use in Premiere Pro:
echo   1. Launch or Restart Adobe Premiere Pro
echo   2. In top menu: Window -^> Extensions -^> StreamDock
echo   3. Search and import YouTube media directly!
echo.
pause
`;

  fs.writeFileSync(path.join(PACKAGE_DIR, 'INSTALL.bat'), installBatContent, 'utf8');

  // 3. Create UNINSTALL.bat
  const uninstallBatContent = `@echo off
chcp 65001 >nul
title StreamDock - Uninstaller
color 0C

echo ======================================================
echo    StreamDock Uninstaller
echo ======================================================
echo.

set "TARGET_DIR=%APPDATA%\\Adobe\\CEP\\extensions\\com.streamdock.youtube.downloader"

if exist "%TARGET_DIR%" (
    echo Removing StreamDock files...
    rmdir /S /Q "%TARGET_DIR%"
    echo [OK] StreamDock removed successfully!
) else (
    echo StreamDock was not found in CEP directory.
)

echo.
pause
`;
  fs.writeFileSync(path.join(PACKAGE_DIR, 'UNINSTALL.bat'), uninstallBatContent, 'utf8');

  // 4. Create README.txt
  const readmeContent = `===============================================================
StreamDock - YouTube Downloader & Importer for Premiere Pro
===============================================================

FEATURES:
- Search millions of YouTube videos, sound effects & music inside Premiere Pro
- Live video preview with YouTube embed + direct yt-dlp MP4 stream fallback
- 1-Click Import directly into Premiere Pro Project Bin & Timeline
- Full HD, 4K, 8K video & MP3, WAV lossless audio extraction
- Bundled with yt-dlp & FFmpeg media engines (no setup required)

---------------------------------------------------------------
EASY 1-CLICK INSTALLATION:
---------------------------------------------------------------
1. Double-click "INSTALL.bat"
2. Wait 2 seconds until it says "SUCCESS!"
3. Open Adobe Premiere Pro
4. Go to: Window -> Extensions -> StreamDock

---------------------------------------------------------------
REQUIREMENTS:
---------------------------------------------------------------
- Windows 10 or Windows 11
- Adobe Premiere Pro CC 2020 through 2026+

Enjoy creating!
`;
  fs.writeFileSync(path.join(PACKAGE_DIR, 'README.txt'), readmeContent, 'utf8');

  // 5. Create ZIP archive
  console.log('3. Creating ZIP archive for easy sharing...');
  const zipPath = path.join(DIST_DIR, `${PACKAGE_NAME}.zip`);
  
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    // Use PowerShell Compress-Archive for reliable native Windows zip
    const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${PACKAGE_DIR}\\*' -DestinationPath '${zipPath}' -Force"`;
    execSync(psCmd, { stdio: 'inherit' });
    console.log(`✓ Zip package created: ${zipPath}`);
  } catch (err) {
    console.warn('Zip creation note:', err.message);
  }

  console.log('\n======================================================');
  console.log('🎉 Packaging Complete!');
  console.log(`📁 Folder: ${PACKAGE_DIR}`);
  console.log(`📦 Zip:    ${zipPath}`);
  console.log('======================================================\n');
}

packageExtension().catch(console.error);
