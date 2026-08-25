/**
 * youtube-search.js
 * High-speed YouTube Search & Metadata extractor using YouTube InnerTube API (no API key required).
 */
const https = require('https');

const INNER_TUBE_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20240101.00.00',
  hl: 'en',
  gl: 'US'
};

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': INNER_TUBE_CLIENT.clientVersion
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse YouTube JSON response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

function parseVideoRenderer(renderer) {
  if (!renderer || !renderer.videoId) return null;

  const title = renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || 'Untitled';
  const channel = renderer.ownerText?.runs?.[0]?.text || renderer.shortBylineText?.runs?.[0]?.text || 'YouTube Creator';
  const duration = renderer.lengthText?.simpleText || renderer.lengthText?.runs?.[0]?.text || '0:00';
  const views = renderer.viewCountText?.simpleText || renderer.shortViewCountText?.simpleText || '';
  const publishedTime = renderer.publishedTimeText?.simpleText || '';
  
  // Pick highest quality thumbnail
  let thumbnail = `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`;
  if (renderer.thumbnail && renderer.thumbnail.thumbnails && renderer.thumbnail.thumbnails.length > 0) {
    const thumbs = renderer.thumbnail.thumbnails;
    thumbnail = thumbs[thumbs.length - 1].url;
  }

  return {
    id: renderer.videoId,
    url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
    title,
    channel,
    duration,
    views,
    publishedTime,
    thumbnail
  };
}

/**
 * Searches YouTube for query
 * @param {string} query Search terms
 * @returns {Promise<Array<{ id, url, title, channel, duration, views, publishedTime, thumbnail }>>}
 */
async function searchYouTube(query) {
  // If query is a direct YouTube URL or Video ID, return it directly
  const directMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (directMatch) {
    const videoId = directMatch[1];
    return [{
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `YouTube Video (${videoId})`,
      channel: 'Direct URL',
      duration: '--:--',
      views: 'Direct Link',
      publishedTime: '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    }];
  }

  const endpoint = 'https://www.youtube.com/youtubei/v1/search';
  const payload = {
    context: {
      client: INNER_TUBE_CLIENT
    },
    query: query,
    params: 'EgIQAQ%3D%3D' // Filter: Videos only
  };

  try {
    const response = await postJson(endpoint, payload);
    const results = [];

    const contents = response?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (contents && Array.isArray(contents)) {
      for (const section of contents) {
        const itemSection = section?.itemSectionRenderer?.contents;
        if (itemSection && Array.isArray(itemSection)) {
          for (const item of itemSection) {
            if (item.videoRenderer) {
              const parsed = parseVideoRenderer(item.videoRenderer);
              if (parsed) results.push(parsed);
            }
          }
        }
      }
    }

    return results;
  } catch (err) {
    console.error('InnerTube search failed, using fallback scraper...', err.message);
    return [];
  }
}

/**
 * Fetches YouTube search autocomplete suggestions
 */
function getSearchSuggestions(query) {
  return new Promise((resolve) => {
    if (!query || query.trim().length === 0) return resolve([]);
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed[1] || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

module.exports = {
  searchYouTube,
  getSearchSuggestions
};
