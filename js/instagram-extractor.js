/**
 * instagram-extractor.js
 * High-speed Instagram Reels & Video metadata extractor and streaming resolver for StreamDock.
 * Multi-tiered extraction: Instant Direct Web Resolver (No Login) -> Saved Session -> yt-dlp.
 */

const https = require('https');
const http = require('http');
const vm = require('vm');
const { execFile } = require('child_process');
const binaryManager = require('./binary-manager');
const sessionManager = require('./session-manager');

// Cache metadata for 10 minutes
const metadataCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Checks if a string is a valid Instagram media URL (Reels, Posts, TV)
 * @param {string} url
 * @returns {boolean}
 */
function isInstagramUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i.test(trimmed);
}

/**
 * Extracts shortcode from an Instagram URL
 * @param {string} url
 * @returns {string|null}
 */
function getShortcode(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(/(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Normalizes an Instagram URL to standard https://www.instagram.com/reel/<shortcode>/
 * @param {string} url
 * @returns {string}
 */
function normalizeInstagramUrl(url) {
  const shortcode = getShortcode(url);
  if (shortcode) {
    return `https://www.instagram.com/reel/${shortcode}/`;
  }
  return url;
}

/**
 * Decodes obfuscated JavaScript response from public resolver
 * @param {string} scriptText
 * @returns {string|null} Unpacked HTML
 */
function decodeResolverScript(scriptText) {
  try {
    const evalIdx = scriptText.lastIndexOf('eval(');
    if (evalIdx === -1) return null;

    const beforeEval = scriptText.substring(0, evalIdx);
    const evalCall = scriptText.substring(evalIdx);
    const transformed = beforeEval + ';\nvar __unpacked_code = ' + evalCall.replace(/^eval\(/, '(');

    let capturedHtml = '';
    const sandbox = {
      window: { location: { hostname: 'snapsave.app' } },
      document: {
        getElementById: () => ({
          set innerHTML(val) { capturedHtml = val; }
        })
      },
      Math: Math,
      Date: Date
    };

    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, { timeout: 2500 });

    if (sandbox.__unpacked_code) {
      try {
        vm.runInContext(sandbox.__unpacked_code, sandbox, { timeout: 2500 });
      } catch (e) {}
    }

    return capturedHtml;
  } catch (err) {
    return null;
  }
}

/**
 * Tier 1: Instant Direct Public Resolver (No Login Required)
 * @param {string} url
 * @returns {Promise<object>}
 */
function extractWithDirectResolver(url) {
  return new Promise((resolve, reject) => {
    const shortcode = getShortcode(url) || 'reel';
    const postData = 'url=' + encodeURIComponent(normalizeInstagramUrl(url));

    const req = https.request({
      hostname: 'snapsave.app',
      path: '/action.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://snapsave.app/',
        'Origin': 'https://snapsave.app'
      },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const html = decodeResolverScript(body);
          if (!html) {
            return reject(new Error('Could not unpack resolver response'));
          }

          // Extract direct video URL
          let videoUrl = '';
          const hrefMatches = html.matchAll(/href=["']([^"']+)["']/gi);
          for (const m of hrefMatches) {
            const link = m[1];
            if (link.includes('download') || link.includes('rapidcdn.app') || link.includes('.mp4') || link.includes('fbcdn.net')) {
              videoUrl = link.replace(/&amp;/g, '&');
              break;
            }
          }

          // Extract thumbnail URL
          let thumbUrl = '';
          const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch) {
            thumbUrl = imgMatch[1].replace(/&amp;/g, '&');
          }

          if (!videoUrl) {
            return reject(new Error('No direct video link found in resolver'));
          }

          resolve({
            id: shortcode,
            url: `https://www.instagram.com/reel/${shortcode}/`,
            title: `Instagram Reel [${shortcode}]`,
            channel: '@instagram_creator',
            duration: '0:30',
            views: 'Instagram Reel',
            publishedTime: '',
            thumbnail: thumbUrl || `https://www.instagram.com/p/${shortcode}/media/?size=l`,
            videoUrl: videoUrl,
            directDownloadUrl: videoUrl,
            platform: 'instagram'
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Resolver request timed out'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Tier 2: Extraction via yt-dlp (with saved session or cookies)
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>}
 */
function extractWithYtDlp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ytDlpPath = binaryManager.getYtDlpPath();
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ];

    if (sessionManager && sessionManager.hasInstagramSession()) {
      args.push('--cookies', sessionManager.getInstagramSessionFilePath());
    } else if (options.cookiesBrowser) {
      args.push('--cookies-from-browser', options.cookiesBrowser);
    }

    execFile(ytDlpPath, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err || !stdout.trim()) {
        if (options.cookiesBrowser && (stderr.includes('DPAPI') || stderr.includes('Failed to decrypt with DPAPI'))) {
          return extractWithYtDlp(url, Object.assign({}, options, { cookiesBrowser: '' })).then(resolve).catch(reject);
        }
        return reject(new Error(stderr || err?.message || 'Failed to extract with yt-dlp'));
      }

      try {
        const data = JSON.parse(stdout.trim());
        const shortcode = getShortcode(url) || data.id || 'reel';
        const title = data.title || data.description || `Instagram Reel [${shortcode}]`;
        const channel = data.uploader || data.channel || data.uploader_id || 'Instagram Creator';
        const thumbnail = data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : '');
        const duration = formatDuration(data.duration);
        const videoUrl = data.url || (data.formats && data.formats.length > 0 ? data.formats[data.formats.length - 1].url : '');

        resolve({
          id: shortcode,
          url: `https://www.instagram.com/reel/${shortcode}/`,
          title: cleanCaption(title),
          channel: '@' + channel.replace(/^@/, ''),
          duration: duration || '0:30',
          views: data.view_count ? `${data.view_count.toLocaleString()} views` : 'Instagram Reel',
          publishedTime: data.upload_date ? formatDate(data.upload_date) : '',
          thumbnail: thumbnail,
          videoUrl: videoUrl,
          directDownloadUrl: videoUrl,
          platform: 'instagram'
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Gets rich metadata for an Instagram Reel using Tier 1 -> Tier 2 -> Tier 3
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getReelMetadata(url, options = {}) {
  const shortcode = getShortcode(url);
  if (!shortcode) {
    throw new Error('Invalid Instagram Reel URL');
  }

  const cacheKey = shortcode;
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data;
  }

  let metadata;
  // Try Tier 1 (Direct public resolver - no login needed)
  try {
    metadata = await extractWithDirectResolver(url);
  } catch (err1) {
    console.warn('[StreamDock] Tier 1 Instagram resolver error:', err1.message);
    // Try Tier 2 (yt-dlp with session)
    try {
      metadata = await extractWithYtDlp(url, options);
    } catch (err2) {
      console.warn('[StreamDock] Tier 2 yt-dlp Instagram extraction error:', err2.message);
      // Tier 3: fallback card
      metadata = {
        id: shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        title: `Instagram Reel [${shortcode}]`,
        channel: '@instagram_user',
        duration: 'Reel',
        views: 'Instagram Reel',
        publishedTime: '',
        thumbnail: `https://www.instagram.com/p/${shortcode}/media/?size=l`,
        videoUrl: '',
        directDownloadUrl: '',
        platform: 'instagram'
      };
    }
  }

  metadataCache.set(cacheKey, { data: metadata, time: Date.now() });
  return metadata;
}

function cleanCaption(text) {
  if (!text) return 'Instagram Reel';
  let clean = text.split('\n')[0].trim();
  if (clean.length > 80) {
    clean = clean.substring(0, 80) + '...';
  }
  return clean || 'Instagram Reel';
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:30';
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length < 8) return '';
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(4, 6);
  const d = dateStr.substring(6, 8);
  return `${y}-${m}-${d}`;
}

module.exports = {
  isInstagramUrl,
  getShortcode,
  normalizeInstagramUrl,
  getReelMetadata,
  extractWithDirectResolver
};
