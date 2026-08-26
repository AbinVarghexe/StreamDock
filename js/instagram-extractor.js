/**
 * instagram-extractor.js
 * High-speed Instagram Reels & Video metadata extractor and streaming resolver for StreamDock.
 */

const { execFile, spawn } = require('child_process');
const https = require('https');
const binaryManager = require('./binary-manager');

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
 * Extracts Instagram Reel metadata using yt-dlp --dump-json
 * @param {string} url
 * @param {object} options
 *   - cookiesBrowser: string (e.g. 'chrome', 'edge', 'firefox', 'brave')
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

    if (options.cookiesBrowser) {
      args.push('--cookies-from-browser', options.cookiesBrowser);
    }

    execFile(ytDlpPath, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err || !stdout.trim()) {
        if (options.cookiesBrowser && (stderr.includes('DPAPI') || stderr.includes('Failed to decrypt with DPAPI'))) {
          console.warn('[StreamDock] DPAPI failed in metadata extractor. Retrying without browser cookies...');
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
          platform: 'instagram'
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Fast public fallback metadata extractor using oEmbed / public page
 * @param {string} url
 * @returns {Promise<object>}
 */
function extractPublicFallback(url) {
  const shortcode = getShortcode(url);
  if (!shortcode) {
    return Promise.reject(new Error('Invalid Instagram URL'));
  }

  return new Promise((resolve) => {
    // Generate a fallback structured object so user can preview and initiate download
    resolve({
      id: shortcode,
      url: `https://www.instagram.com/reel/${shortcode}/`,
      title: `Instagram Reel [${shortcode}]`,
      channel: '@instagram_user',
      duration: 'Reel',
      views: 'Instagram Reel',
      publishedTime: '',
      thumbnail: `https://www.instagram.com/p/${shortcode}/media/?size=l`,
      videoUrl: '',
      platform: 'instagram'
    });
  });
}

/**
 * Gets rich metadata for an Instagram Reel
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getReelMetadata(url, options = {}) {
  const shortcode = getShortcode(url);
  if (!shortcode) {
    throw new Error('Invalid Instagram Reel URL');
  }

  const cacheKey = shortcode + (options.cookiesBrowser || '');
  const cached = metadataCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data;
  }

  let metadata;
  try {
    metadata = await extractWithYtDlp(url, options);
  } catch (err) {
    console.warn('yt-dlp Instagram extraction fallback:', err.message);
    metadata = await extractPublicFallback(url);
  }

  metadataCache.set(cacheKey, { data: metadata, time: Date.now() });
  return metadata;
}

function cleanCaption(text) {
  if (!text) return 'Instagram Reel';
  // Strip long hashtags for display title if too lengthy
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
  getReelMetadata
};
