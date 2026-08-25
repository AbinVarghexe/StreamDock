/**
 * download-candidate-discovery.js
 * Extracts direct streaming playback URLs and probe metadata using yt-dlp.
 */
const { spawn } = require('child_process');
const binaryManager = require('./binary-manager');

// Cache stream URLs for 10 minutes to make subsequent previews instantaneous
const streamUrlCache = new Map();

/**
 * Gets a direct playable video/audio stream URL for in-panel preview
 * @param {string} url Media URL
 * @returns {Promise<string>} Direct streaming URL
 */
function getPreviewStreamUrl(url) {
  if (streamUrlCache.has(url)) {
    const entry = streamUrlCache.get(url);
    if (Date.now() - entry.time < 10 * 60 * 1000) {
      return Promise.resolve(entry.streamUrl);
    }
    streamUrlCache.delete(url);
  }

  return new Promise((resolve, reject) => {
    const ytDlpPath = binaryManager.getYtDlpPath();
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=tv,android_vr,web_embedded,mweb,ios',
      '-g',
      '-f', '18/b/ba/best[ext=mp4]/best',
      url
    ];

    let stdout = '';
    let stderr = '';

    const proc = spawn(ytDlpPath, args, { windowsHide: true });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        return reject(new Error(`Failed to extract preview stream (code ${code}): ${stderr || 'No stream URL'}`));
      }

      // First line is the video or combined stream URL
      const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const streamUrl = lines[0];

      if (streamUrl) {
        streamUrlCache.set(url, { streamUrl, time: Date.now() });
        resolve(streamUrl);
      } else {
        reject(new Error('No stream URL extracted'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Spawn error: ${err.message}`));
    });
  });
}

module.exports = {
  getPreviewStreamUrl
};
