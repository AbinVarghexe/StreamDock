/**
 * download-binaries.js
 * Downloads and prepares yt-dlp and ffmpeg for the extension.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BINARIES_DIR = path.join(__dirname, '..', 'binaries');
const FFMPEG_DIR = path.join(BINARIES_DIR, 'ffmpeg', 'win32-x64');

if (!fs.existsSync(BINARIES_DIR)) fs.mkdirSync(BINARIES_DIR, { recursive: true });
if (!fs.existsSync(FFMPEG_DIR)) fs.mkdirSync(FFMPEG_DIR, { recursive: true });

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(destPath);
    
    function makeRequest(currentUrl) {
      https.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return makeRequest(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            console.log(`Saved: ${destPath}`);
            resolve(destPath);
          });
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    makeRequest(url);
  });
}

async function prepareBinaries() {
  console.log('--- Preparing StreamDock Binaries ---');
  
  // 1. Prepare yt-dlp.exe
  const ytDlpDest = path.join(BINARIES_DIR, 'yt-dlp.exe');
  if (!fs.existsSync(ytDlpDest)) {
    try {
      // Check if system has it first for fast local copy
      const systemYtDlp = execSync('where.exe yt-dlp', { encoding: 'utf-8' }).split(/\r?\n/)[0].trim();
      if (systemYtDlp && fs.existsSync(systemYtDlp)) {
        console.log(`Found system yt-dlp at: ${systemYtDlp}, copying...`);
        fs.copyFileSync(systemYtDlp, ytDlpDest);
      } else {
        await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytDlpDest);
      }
    } catch (e) {
      console.log('Downloading yt-dlp from GitHub...');
      await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytDlpDest);
    }
  } else {
    console.log('yt-dlp.exe already present.');
  }

  // 2. Prepare ffmpeg.exe
  const ffmpegDest = path.join(FFMPEG_DIR, 'ffmpeg.exe');
  if (!fs.existsSync(ffmpegDest)) {
    try {
      const systemFfmpeg = execSync('where.exe ffmpeg', { encoding: 'utf-8' }).split(/\r?\n/)[0].trim();
      if (systemFfmpeg && fs.existsSync(systemFfmpeg)) {
        console.log(`Found system ffmpeg at: ${systemFfmpeg}, copying...`);
        fs.copyFileSync(systemFfmpeg, ffmpegDest);
      }
    } catch (e) {
      console.log('ffmpeg could not be found locally. Please ensure ffmpeg is installed or downloaded.');
    }
  } else {
    console.log('ffmpeg.exe already present.');
  }

  console.log('Binary setup complete!');
}

prepareBinaries().catch(console.error);
