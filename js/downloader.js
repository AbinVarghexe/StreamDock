/**
 * downloader.js
 * Core download orchestration engine with progress reporting, concurrency and cancellation.
 * Supports direct high-speed Instagram Reel streaming and full multi-platform yt-dlp pipelines.
 */
const { spawn, exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const binaryManager = require('./binary-manager');
const instagramExtractor = require('./instagram-extractor');
const { buildYtDlpDownloadArgs } = require('./download-candidate-selection');

class DownloadCancellation {
  constructor() {
    this.isCancelled = false;
    this.process = null;
    this.request = null;
  }

  cancel() {
    this.isCancelled = true;
    if (this.request) {
      try { this.request.destroy(); } catch (e) {}
    }
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
 * Downloads Instagram Reel directly using the high-speed direct stream resolver
 * @param {object} options
 * @returns {Promise<{ filePath: string, title: string }>}
 */
function downloadDirectInstagram(options) {
  const cancellation = options.cancellation || new DownloadCancellation();

  return new Promise(async (resolve, reject) => {
    if (cancellation.isCancelled) {
      return reject(new Error('Download cancelled before start.'));
    }

    try {
      const shortcode = instagramExtractor.getShortcode(options.url) || 'reel';
      const cleanTitle = (options.title || `Instagram Reel [${shortcode}]`).replace(/[\\/:*?"<>|]/g, '_');
      const destDir = options.destinationDir || '.';
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const tempFilePath = path.join(destDir, `temp_${shortcode}_${Date.now()}.mp4`);
      const finalExt = options.formatType === 'audio' ? (options.audioFormat || 'mp3') : 'mp4';
      const finalFilePath = path.join(destDir, `${cleanTitle} [${shortcode}].${finalExt}`);

      if (options.onStatus) options.onStatus('Resolving direct Instagram stream...');

      let directUrl = options.directDownloadUrl;
      if (!directUrl) {
        const meta = await instagramExtractor.extractWithDirectResolver(options.url);
        directUrl = meta.directDownloadUrl || meta.videoUrl;
      }

      if (!directUrl) {
        throw new Error('No direct stream URL returned by resolver');
      }

      if (options.onStatus) options.onStatus('Downloading Instagram media stream...');

      const downloadStream = (url) => {
        if (cancellation.isCancelled) {
          try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
          return reject(new Error('Download cancelled by user.'));
        }

        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;

        const req = lib.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://snapsave.app/'
          },
          timeout: 25000
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return downloadStream(res.headers.location);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download stream: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          let lastTime = Date.now();
          let lastBytes = 0;

          const fileStream = fs.createWriteStream(tempFilePath);
          res.pipe(fileStream);

          res.on('data', (chunk) => {
            if (cancellation.isCancelled) {
              req.destroy();
              fileStream.close();
              try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
              return reject(new Error('Download cancelled by user.'));
            }

            receivedBytes += chunk.length;
            const now = Date.now();
            if (now - lastTime > 350 || receivedBytes === totalBytes) {
              const deltaBytes = receivedBytes - lastBytes;
              const deltaTime = (now - lastTime) / 1000;
              const speedBps = deltaTime > 0 ? deltaBytes / deltaTime : 0;
              const speedMb = (speedBps / (1024 * 1024)).toFixed(2) + 'MB/s';
              const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 50;
              const totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) + 'MB' : 'Unknown';

              if (typeof options.onProgress === 'function') {
                options.onProgress({
                  percent,
                  totalSize: totalMb,
                  speed: speedMb,
                  eta: '00:01',
                  status: 'downloading'
                });
              }

              lastTime = now;
              lastBytes = receivedBytes;
            }
          });

          fileStream.on('finish', () => {
            fileStream.close(async () => {
              try {
                // Post-process with FFmpeg to ensure full Premiere Pro native compatibility (H.264/AAC)
                const ffmpegPath = binaryManager.getFfmpegPath();
                if (fs.existsSync(ffmpegPath)) {
                  if (options.onStatus) options.onStatus('Optimizing codecs for Premiere Pro...');
                  const ffmpegArgs = options.formatType === 'audio'
                    ? ['-y', '-i', tempFilePath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', finalFilePath]
                    : ['-y', '-i', tempFilePath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', finalFilePath];

                  execFile(ffmpegPath, ffmpegArgs, { windowsHide: true }, (err) => {
                    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
                    if (err) {
                      try { fs.renameSync(tempFilePath, finalFilePath); } catch (e) {}
                    }
                    resolve({ filePath: finalFilePath, title: cleanTitle });
                  });
                } else {
                  try { fs.renameSync(tempFilePath, finalFilePath); } catch (e) {}
                  resolve({ filePath: finalFilePath, title: cleanTitle });
                }
              } catch (postErr) {
                if (fs.existsSync(tempFilePath)) {
                  try { fs.renameSync(tempFilePath, finalFilePath); } catch (e) {}
                  return resolve({ filePath: finalFilePath, title: cleanTitle });
                }
                reject(postErr);
              }
            });
          });

          fileStream.on('error', (err) => {
            try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
            reject(err);
          });
        });

        cancellation.request = req;

        req.on('error', (err) => {
          try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy();
          try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
          reject(new Error('Download stream timed out'));
        });
      };

      downloadStream(directUrl);
    } catch (e) {
      reject(e);
    }
  });
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
 * @returns {{ promise: Promise<{ filePath: string, title: string }>, cancellation: DownloadCancellation, cancel: () => void }}
 */
function downloadMedia(options) {
  const cancellation = options.cancellation || new DownloadCancellation();

  let promise;
  // If this is an Instagram URL, prioritize direct no-login fast download
  if (instagramExtractor.isInstagramUrl(options.url)) {
    promise = downloadDirectInstagram(Object.assign({}, options, { cancellation })).catch((directErr) => {
      console.warn('[StreamDock] Direct Instagram stream failed, falling back to yt-dlp:', directErr.message);
      return downloadWithYtDlp(options, cancellation);
    });
  } else {
    promise = downloadWithYtDlp(options, cancellation);
  }

  return {
    promise,
    cancellation,
    cancel: () => cancellation.cancel()
  };
}

/**
 * Fallback / Standard yt-dlp downloader pipeline
 */
function downloadWithYtDlp(options, cancellation) {
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
    let recodedPath = '';
    let extractedAudioPath = '';
    let downloadedPath = '';
    let videoTitle = options.title || 'Media File';
    let rawStdout = '';
    let rawStderr = '';
    const downloadStartTime = Date.now();

    const proc = spawn(ytDlpPath, args, {
      windowsHide: true
    });
    cancellation.process = proc;

    // Progress parsing regex
    const progressRegex = /\[download\]\s+([\d\.]+)%\s+of\s+(?:~)?([\d\.]+[A-Za-z]+)\s+at\s+([\d\.]+[A-Za-z]+\/s)\s+ETA\s+([\d:]+)/;
    const mergerRegex = /\[Merger\]\s+Merging formats into\s+"([^"]+)"/;
    const extractAudioRegex = /\[ExtractAudio\]\s+Destination:\s+([^\r\n]+)/;
    const destRegex = /\[download\]\s+Destination:\s+([^\r\n]+)/;
    // Post-processor output capture patterns
    const videoConvertRegex = /\[VideoConvertor\]\s+Converting video[^;]*;\s*Destination:\s+([^\r\n]+)/;
    const moveRegex = /\[MoveFiles\]\s+Moving file\s+"[^"]+"\s+to\s+"([^"]+)"/;
    const fixupRegex = /\[FixupM3u8\]\s+(?:Fixing|Writing)[^"]*"([^"]+)"/;
    const videoRemuxRegex = /\[VideoRemuxer\]\s+Remuxing video[^;]*;\s*Destination:\s+([^\r\n]+)/;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      rawStdout += text;

      // Capture VideoConvertor output (from --recode-video) — this is the FINAL file
      const recodeMatch = text.match(videoConvertRegex);
      if (recodeMatch && recodeMatch[1]) {
        recodedPath = recodeMatch[1].trim();
      }

      // Capture VideoRemuxer output
      const remuxMatch = text.match(videoRemuxRegex);
      if (remuxMatch && remuxMatch[1]) {
        recodedPath = remuxMatch[1].trim();
      }

      // Capture MoveFiles output (yt-dlp sometimes moves final file)
      const moveMatch = text.match(moveRegex);
      if (moveMatch && moveMatch[1]) {
        recodedPath = moveMatch[1].trim();
      }

      // Capture FixupM3u8 output
      const fixupMatch = text.match(fixupRegex);
      if (fixupMatch && fixupMatch[1]) {
        recodedPath = fixupMatch[1].trim();
      }

      // Check for merger output (e.g. final video file before recode)
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
        // Avoid temporary format parts like *.f395.mp4 or *.f251.webm
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
        // Auto-retry without browser cookies if DPAPI decryption failed
        if (options.cookiesFromBrowser && (rawStderr.includes('DPAPI') || rawStderr.includes('Failed to decrypt with DPAPI'))) {
          console.warn('[StreamDock] Windows DPAPI browser cookie extraction failed. Retrying download directly without browser cookies...');
          const retryOptions = Object.assign({}, options, { cookiesFromBrowser: '' });
          return downloadMedia(retryOptions).then(resolve).catch(reject);
        }

        // Format friendly error message
        let errMsg = rawStderr || rawStdout || `Exit code ${code}`;
        if (errMsg.includes('login required') || errMsg.includes('Requested content is not available') || errMsg.includes('rate-limit reached')) {
          errMsg = 'Instagram authentication required for this Reel. You can save your account session in Settings.';
        } else if (errMsg.includes('DPAPI') || errMsg.includes('Failed to decrypt with DPAPI') || errMsg.includes('Could not copy Chrome cookie database')) {
          errMsg = 'Chrome/Edge on Windows blocked cookie decryption. You can save your account session in Settings.';
        } else if (errMsg.includes('HTTP Error 403') || errMsg.includes('403: Forbidden')) {
          errMsg = 'Access forbidden (403). Content might be geo-restricted or rate-limited.';
        }

        return reject(new Error(errMsg));
      }

      // Determine the true resolved file path
      // Priority: recodedPath (post-processing final) > finalMergedPath > extractedAudioPath > downloadedPath
      let resolvedFile = '';
      if (options.formatType === 'audio') {
        // For audio downloads, prefer extracted audio path
        resolvedFile = extractedAudioPath || recodedPath || downloadedPath;
      } else {
        // For video downloads, prefer post-processed/recoded path, then merged, skip audio-only paths
        resolvedFile = recodedPath || finalMergedPath || downloadedPath;
      }

      // If the resolved path doesn't exist, try with the expected extension (recode may change .webm -> .mp4)
      if (resolvedFile && !fs.existsSync(resolvedFile)) {
        const expectedExt = options.formatType === 'audio' ? `.${options.audioFormat || 'mp3'}` : '.mp4';
        const altPath = resolvedFile.replace(/\.[^.]+$/, expectedExt);
        if (fs.existsSync(altPath)) {
          resolvedFile = altPath;
        }
      }

      if (!resolvedFile || !fs.existsSync(resolvedFile)) {
        // Fallback: search directory for files created AFTER this download started
        try {
          const files = fs.readdirSync(options.destinationDir);
          const expectedExt = options.formatType === 'audio' ? `.${options.audioFormat || 'mp3'}` : '.mp4';
          const candidates = files
            .filter(f => f.endsWith(expectedExt) && !f.endsWith('.part') && !f.endsWith('.ytdl'))
            .map(f => {
              const fullPath = path.join(options.destinationDir, f);
              try {
                const stat = fs.statSync(fullPath);
                return { path: fullPath, mtime: stat.mtimeMs, size: stat.size };
              } catch (e) { return null; }
            })
            .filter(c => c && c.mtime >= downloadStartTime - 5000 && c.size > 0)
            .sort((a, b) => b.mtime - a.mtime);

          if (candidates.length > 0) {
            resolvedFile = candidates[0].path;
          }
        } catch (e) {
          console.warn('Fallback search error:', e);
        }
      }

      if (!resolvedFile || !fs.existsSync(resolvedFile)) {
        return reject(new Error('Download completed but could not find output file on disk.'));
      }

      resolve({
        filePath: resolvedFile,
        title: videoTitle
      });
    });

    proc.on('error', (err) => {
      cancellation.process = null;
      reject(err);
    });
  });

  return promise;
}

module.exports = {
  downloadMedia,
  DownloadCancellation
};
