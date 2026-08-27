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
                const ffmpegPath = binaryManager.getFfmpegPath();
                if (fs.existsSync(ffmpegPath)) {
                  if (options.onStatus) options.onStatus('Transcoding to Premiere Pro H.264/AAC MP4...');
                  let ffmpegArgs = [];
                  if (options.formatType === 'audio') {
                    if (options.audioFormat === 'wav') {
                      ffmpegArgs = ['-y', '-i', tempFilePath, '-vn', '-c:a', 'pcm_s16le', finalFilePath];
                    } else {
                      ffmpegArgs = ['-y', '-i', tempFilePath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', finalFilePath];
                    }
                  } else {
                    ffmpegArgs = [
                      '-y',
                      '-i', tempFilePath,
                      '-c:v', 'libx264',
                      '-preset', 'veryfast',
                      '-pix_fmt', 'yuv420p',
                      '-c:a', 'aac',
                      '-b:a', '192k',
                      finalFilePath
                    ];
                  }

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

    // Provide exact ffmpeg binary location to yt-dlp
    if (fs.existsSync(ffmpegPath)) {
      args.unshift('--ffmpeg-location', ffmpegPath);
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
    // Matches both: [VideoConvertor] Converting video...; Destination: path
    //           and: [VideoConvertor] Not converting media file "path"; already is in target format
    const videoConvertDestRegex = /\[VideoConvertor\]\s+Converting video[^;]*;\s*Destination:\s+([^\r\n]+)/;
    const videoConvertNoopRegex = /\[VideoConvertor\]\s+Not converting media file\s+"([^"]+)"/;
    const moveRegex = /\[MoveFiles\]\s+Moving file\s+"[^"]+"\s+to\s+"([^"]+)"/;
    const fixupRegex = /\[FixupM3u8\]\s+(?:Fixing|Writing)[^"]*"([^"]+)"/;
    const videoRemuxDestRegex = /\[VideoRemuxer\]\s+Remuxing video[^;]*;\s*Destination:\s+([^\r\n]+)/;
    const videoRemuxNoopRegex = /\[VideoRemuxer\]\s+Not remuxing media file\s+"([^"]+)"/;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      rawStdout += text;

      // Capture VideoConvertor output (from --recode-video) — this is the FINAL file
      // Matches: "Converting video...; Destination: path" OR "Not converting media file "path""
      const recodeDestMatch = text.match(videoConvertDestRegex);
      if (recodeDestMatch && recodeDestMatch[1]) {
        recodedPath = recodeDestMatch[1].trim();
      }
      const recodeNoopMatch = text.match(videoConvertNoopRegex);
      if (recodeNoopMatch && recodeNoopMatch[1]) {
        recodedPath = recodeNoopMatch[1].trim();
      }

      // Capture VideoRemuxer output
      const remuxDestMatch = text.match(videoRemuxDestRegex);
      if (remuxDestMatch && remuxDestMatch[1]) {
        recodedPath = remuxDestMatch[1].trim();
      }
      const remuxNoopMatch = text.match(videoRemuxNoopRegex);
      if (remuxNoopMatch && remuxNoopMatch[1]) {
        recodedPath = remuxNoopMatch[1].trim();
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
        let errMsg = rawStderr || rawStdout || `Exit code ${code}`;
        if (errMsg.includes('login required') || errMsg.includes('Requested content is not available') || errMsg.includes('rate-limit reached')) {
          errMsg = 'Instagram authentication required for this Reel. You can save your account session in Settings.';
        }
        return reject(new Error(`Download failed: ${errMsg}`));
      }

      // 1. Direct priority check from captured stdout paths
      let resolvedFile = '';
      if (options.formatType === 'audio') {
        resolvedFile = extractedAudioPath || recodedPath || downloadedPath;
      } else {
        resolvedFile = recodedPath || finalMergedPath || downloadedPath;
      }

      // Check if direct resolved path exists on disk
      if (resolvedFile && fs.existsSync(resolvedFile)) {
        // Exists!
      } else if (resolvedFile) {
        // Try common audio/video extension replacements (.webm -> .mp4, .m4a -> .mp3)
        const expectedExt = options.formatType === 'audio' ? `.${options.audioFormat || 'mp3'}` : '.mp4';
        const altPath = resolvedFile.replace(/\.[^.]+$/, expectedExt);
        if (fs.existsSync(altPath)) {
          resolvedFile = altPath;
        } else {
          resolvedFile = '';
        }
      }

      // 2. Fallback: Parse video ID from URL and search destination folder
      if (!resolvedFile || !fs.existsSync(resolvedFile)) {
        const idMatch = (options.url || '').match(/(?:v=|\/embed\/|\/v\/|youtu\.be\/|\/shorts\/|\/reel\/|\/p\/|^)([A-Za-z0-9_-]{8,})/);
        const mediaId = idMatch ? idMatch[1] : '';

        try {
          const files = fs.readdirSync(options.destinationDir);
          
          // Filter out temp / partial files
          const validFiles = files
            .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl') && !/\.f\d+\./.test(f))
            .map(f => {
              const fullPath = path.join(options.destinationDir, f);
              try {
                const stat = fs.statSync(fullPath);
                return { name: f, path: fullPath, mtime: stat.mtimeMs, size: stat.size };
              } catch (e) { return null; }
            })
            .filter(c => c && c.size > 0);

          // Sub-check A: File containing video/media ID
          if (mediaId) {
            const idCandidates = validFiles
              .filter(c => c.name.includes(mediaId))
              .sort((a, b) => b.mtime - a.mtime);
            if (idCandidates.length > 0) {
              resolvedFile = idCandidates[0].path;
            }
          }

          // Sub-check B: Newest media file in destination directory
          if (!resolvedFile || !fs.existsSync(resolvedFile)) {
            const mediaCandidates = validFiles
              .filter(c => /\.(mp4|mkv|webm|mov|mp3|wav|m4a|aac|ogg|flac)$/i.test(c.name))
              .sort((a, b) => b.mtime - a.mtime);
            if (mediaCandidates.length > 0) {
              resolvedFile = mediaCandidates[0].path;
            }
          }
        } catch (e) {
          console.warn('[StreamDock] Directory search fallback error:', e);
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
