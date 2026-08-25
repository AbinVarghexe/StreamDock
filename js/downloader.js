/**
 * downloader.js
 * Core download orchestration engine with progress reporting, concurrency and cancellation.
 */
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const binaryManager = require('./binary-manager');
const { buildYtDlpDownloadArgs } = require('./download-candidate-selection');

class DownloadCancellation {
  constructor() {
    this.isCancelled = false;
    this.process = null;
  }

  cancel() {
    this.isCancelled = true;
    if (this.process && this.process.pid) {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${this.process.pid} /T /F`, () => {});
      } else {
        this.process.kill('SIGKILL');
      }
    }
  }
}

/**
 * Downloads a video or audio stream
 * @param {object} options
 *   - url: string
 *   - formatType: 'video' | 'audio'
 *   - quality: string
 *   - audioFormat: string
 *   - destinationDir: string
 *   - cookiesFromBrowser: string
 *   - onProgress: (progressData) => void
 *   - onStatus: (statusText) => void
 * @returns {Promise<{ filePath: string, title: string }>}
 */
function downloadMedia(options) {
  const cancellation = options.cancellation || new DownloadCancellation();

  const promise = new Promise((resolve, reject) => {
    if (cancellation.isCancelled) {
      return reject(new Error('Download cancelled before start.'));
    }

    const ytDlpPath = binaryManager.getYtDlpPath();
    const ffmpegPath = binaryManager.getFfmpegPath();
    const ffmpegDir = path.dirname(ffmpegPath);

    // Ensure destination directory exists
    if (!fs.existsSync(options.destinationDir)) {
      fs.mkdirSync(options.destinationDir, { recursive: true });
    }

    const args = buildYtDlpDownloadArgs(options.url, {
      formatType: options.formatType,
      quality: options.quality,
      audioFormat: options.audioFormat,
      destinationDir: options.destinationDir,
      cookiesFromBrowser: options.cookiesFromBrowser
    });

    // Provide ffmpeg location to yt-dlp
    if (fs.existsSync(ffmpegPath)) {
      args.unshift('--ffmpeg-location', ffmpegDir);
    }

    let finalMergedPath = '';
    let extractedAudioPath = '';
    let downloadedPath = '';
    let videoTitle = options.title || 'Media File';
    let rawStdout = '';
    let rawStderr = '';

    const proc = spawn(ytDlpPath, args, {
      windowsHide: true
    });
    cancellation.process = proc;

    // Progress parsing regex
    const progressRegex = /\[download\]\s+([\d\.]+)%\s+of\s+(?:~)?([\d\.]+[A-Za-z]+)\s+at\s+([\d\.]+[A-Za-z]+\/s)\s+ETA\s+([\d:]+)/;
    const mergerRegex = /\[Merger\]\s+Merging formats into\s+"([^"]+)"/;
    const extractAudioRegex = /\[ExtractAudio\]\s+Destination:\s+([^\r\n]+)/;
    const destRegex = /\[download\]\s+Destination:\s+([^\r\n]+)/;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      rawStdout += text;

      // Check for merger output (e.g. final video file)
      const mergeMatch = text.match(mergerRegex);
      if (mergeMatch && mergeMatch[1]) {
        finalMergedPath = mergeMatch[1].trim();
      }

      // Check for audio extraction output
      const audioMatch = text.match(extractAudioRegex);
      if (audioMatch && audioMatch[1]) {
        extractedAudioPath = audioMatch[1].trim();
      }

      // Check for standard download destination
      const destMatch = text.match(destRegex);
      if (destMatch && destMatch[1]) {
        const p = destMatch[1].trim();
        // Avoid temporary format parts like *.f395.mp4
        if (!/\.f\d+\./.test(p)) {
          downloadedPath = p;
        }
      }

      // Extract progress details
      const progMatch = text.match(progressRegex);
      if (progMatch && typeof options.onProgress === 'function') {
        const percent = parseFloat(progMatch[1]);
        const totalSize = progMatch[2];
        const speed = progMatch[3];
        const eta = progMatch[4];

        options.onProgress({
          percent,
          totalSize,
          speed,
          eta,
          status: 'downloading'
        });
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      rawStderr += text;
      if (options.onStatus) {
        options.onStatus(text.trim());
      }
    });

    proc.on('close', (code) => {
      cancellation.process = null;

      if (cancellation.isCancelled) {
        return reject(new Error('Download cancelled by user.'));
      }

      if (code !== 0) {
        return reject(new Error(`Download process failed (exit code ${code}): ${rawStderr || rawStdout}`));
      }

      // Determine the true resolved file path
      let resolvedFilePath = '';

      if (options.formatType === 'audio') {
        resolvedFilePath = extractedAudioPath || downloadedPath;
      } else {
        resolvedFilePath = finalMergedPath || downloadedPath;
      }

      // If resolvedFilePath does not exist on disk, scan directory for most recent matching file
      if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
        try {
          const files = fs.readdirSync(options.destinationDir)
            .filter(f => !f.includes('.part') && !/\.f\d+\./.test(f))
            .map(f => ({ name: f, path: path.join(options.destinationDir, f), mtime: fs.statSync(path.join(options.destinationDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            resolvedFilePath = files[0].path;
          }
        } catch (err) {
          // ignore
        }
      }

      if (typeof options.onProgress === 'function') {
        options.onProgress({
          percent: 100,
          totalSize: 'Completed',
          speed: '-',
          eta: '00:00',
          status: 'completed'
        });
      }

      resolve({
        filePath: resolvedFilePath,
        title: videoTitle
      });
    });

    proc.on('error', (err) => {
      cancellation.process = null;
      reject(new Error(`Failed to execute download engine: ${err.message}`));
    });
  });

  return {
    promise,
    cancellation,
    cancel: () => cancellation.cancel()
  };
}

module.exports = {
  downloadMedia,
  DownloadCancellation
};
