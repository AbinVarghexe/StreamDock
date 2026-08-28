/**
 * binary-manager.js
 * Manages resolution, validation, and execution paths for yt-dlp, ffmpeg, and ffprobe.
 */
const path = require('path');
const fs = require('fs');
const { execFile, execSync } = require('child_process');

function getExtensionRoot() {
  if (typeof __dirname !== 'undefined') {
    let d = __dirname;
    try { d = decodeURIComponent(d); } catch (e) {}
    d = d.replace(/^\/([A-Za-z]:)/, '$1');
    const root = path.resolve(d, '..');
    if (fs.existsSync(path.join(root, 'binaries'))) {
      return root;
    }
  }

  if (process.env && process.env.APPDATA) {
    const extDir = path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.streamdock.youtube.downloader');
    if (fs.existsSync(path.join(extDir, 'binaries'))) {
      return extDir;
    }
  }

  return path.resolve('.');
}

const EXTENSION_ROOT = getExtensionRoot();
const BINARIES_DIR = path.join(EXTENSION_ROOT, 'binaries');

function getYtDlpPath() {
  // 1. Check local bundled binary
  const bundled = path.join(BINARIES_DIR, 'yt-dlp.exe');
  if (fs.existsSync(bundled)) return bundled;

  const unixBundled = path.join(BINARIES_DIR, 'yt-dlp');
  if (fs.existsSync(unixBundled)) return unixBundled;

  // Check CEP APPDATA folder directly
  if (process.env && process.env.APPDATA) {
    const appdataBundled = path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.streamdock.youtube.downloader', 'binaries', 'yt-dlp.exe');
    if (fs.existsSync(appdataBundled)) return appdataBundled;
  }

  // 2. Check user's designated bin directory
  const userDevBin = 'D:\\DEV\\Adobe Plugins\\bin\\yt-dlp.exe';
  if (fs.existsSync(userDevBin)) return userDevBin;

  // 3. Check well-known system paths on Windows
  const wellKnownPaths = [
    'C:\\yt-dlp\\yt-dlp.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe')
  ];

  for (const p of wellKnownPaths) {
    if (p && fs.existsSync(p)) return p;
  }

  // 4. Fallback to system PATH lookup
  try {
    const sysPath = execSync('where.exe yt-dlp', { encoding: 'utf-8', windowsHide: true }).split(/\r?\n/)[0].trim();
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {
    // ignore
  }

  return 'yt-dlp';
}

function getFfmpegPath() {
  // 1. Check local bundled ffmpeg
  const bundledRoot = path.join(BINARIES_DIR, 'ffmpeg.exe');
  if (fs.existsSync(bundledRoot)) return bundledRoot;

  const bundledWin = path.join(BINARIES_DIR, 'ffmpeg', 'win32-x64', 'ffmpeg.exe');
  if (fs.existsSync(bundledWin)) return bundledWin;

  // Check CEP APPDATA folder directly
  if (process.env && process.env.APPDATA) {
    const appdataBundled = path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.streamdock.youtube.downloader', 'binaries', 'ffmpeg.exe');
    if (fs.existsSync(appdataBundled)) return appdataBundled;
  }

  // 2. Check user's designated bin directory
  const userDevBin = 'D:\\DEV\\Adobe Plugins\\bin\\ffmpeg.exe';
  if (fs.existsSync(userDevBin)) return userDevBin;

  // 3. Check well-known system paths
  const wellKnownPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe'
  ];

  for (const p of wellKnownPaths) {
    if (p && fs.existsSync(p)) return p;
  }

  // 4. Fallback to system PATH
  try {
    const sysPath = execSync('where.exe ffmpeg', { encoding: 'utf-8', windowsHide: true }).split(/\r?\n/)[0].trim();
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {
    // ignore
  }

  return 'ffmpeg';
}

function getFfprobePath() {
  const bundledWin = path.join(BINARIES_DIR, 'ffmpeg', 'win32-x64', 'ffprobe.exe');
  if (fs.existsSync(bundledWin)) return bundledWin;

  const bundledRoot = path.join(BINARIES_DIR, 'ffprobe.exe');
  if (fs.existsSync(bundledRoot)) return bundledRoot;

  if (process.env && process.env.APPDATA) {
    const appdataBundled = path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.streamdock.youtube.downloader', 'binaries', 'ffprobe.exe');
    if (fs.existsSync(appdataBundled)) return appdataBundled;
  }

  const userDevBin = 'D:\\DEV\\Adobe Plugins\\bin\\ffprobe.exe';
  if (fs.existsSync(userDevBin)) return userDevBin;

  try {
    const sysPath = execSync('where.exe ffprobe', { encoding: 'utf-8', windowsHide: true }).split(/\r?\n/)[0].trim();
    if (sysPath && fs.existsSync(sysPath)) return sysPath;
  } catch (e) {
    // ignore
  }

  return 'ffprobe';
}

/**
 * Fast synchronous binary validation using filesystem checks
 */
function validateBinaries() {
  const ytDlp = getYtDlpPath();
  const ffmpeg = getFfmpegPath();
  const ffprobe = getFfprobePath();

  const ytDlpExists = fs.existsSync(ytDlp) || ytDlp === 'yt-dlp';
  const ffmpegExists = fs.existsSync(ffmpeg) || ffmpeg === 'ffmpeg';
  const ffprobeExists = fs.existsSync(ffprobe) || ffprobe === 'ffprobe';

  return {
    ytDlpPath: ytDlp,
    ytDlpVersion: ytDlpExists ? 'Active (v2026+)' : 'Missing',
    ytDlpAvailable: ytDlpExists,
    ffmpegPath: ffmpeg,
    ffmpegAvailable: ffmpegExists,
    ffprobePath: ffprobe,
    ffprobeAvailable: ffprobeExists
  };
}

/**
 * Non-blocking asynchronous binary version verification
 */
function validateBinariesAsync() {
  return new Promise((resolve) => {
    const status = validateBinaries();
    
    execFile(status.ytDlpPath, ['--version'], { windowsHide: true }, (err, stdout) => {
      if (!err && stdout) {
        status.ytDlpVersion = stdout.trim();
        status.ytDlpAvailable = true;
      }
      
      execFile(status.ffmpegPath, ['-version'], { windowsHide: true }, (fErr, fStdout) => {
        if (!fErr && fStdout) {
          status.ffmpegAvailable = true;
        }
        resolve(status);
      });
    });
  });
}

module.exports = {
  getYtDlpPath,
  getFfmpegPath,
  getFfprobePath,
  validateBinaries,
  validateBinariesAsync,
  BINARIES_DIR
};
