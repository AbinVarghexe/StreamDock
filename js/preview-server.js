/**
 * preview-server.js
 * StreamDock Local HTTP Preview Bridge & Streaming Server.
 * Supports YouTube and Instagram Reels previews and streaming.
 *
 * Routes:
 * 1. /youtube-preview?videoId=<id>
 *    Serves YouTube IFrame embed inside a local loopback origin (127.0.0.1:port)
 *    with strict-origin-when-cross-origin headers to eliminate Error 153.
 *
 * 2. /instagram-preview?shortcode=<shortcode>
 *    Serves Instagram embed player inside the loopback origin.
 *
 * 3. /stream?videoId=<id>&platform=<youtube|instagram>
 *    Streams video directly from yt-dlp's internal engine to the browser <video>
 *    tag via an MP4 pipe.
 */

const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { URL } = require('url');

let previewBridgeServer = null;
let previewBridgeOrigin = '';

// Active streaming processes: key -> child_process
const activeStreamProcesses = new Map();
// Cache of resolved direct CDN URLs: key -> { url, expires }
const streamUrlCache = new Map();

function isValidMediaId(id) {
  return /^[A-Za-z0-9_-]{5,30}$/.test(String(id || ''));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJavaScriptString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3c');
}

function getYtDlpPath() {
  try {
    const bm = require('./binary-manager');
    return bm.getYtDlpPath();
  } catch (e) {
    return 'yt-dlp';
  }
}

function sendResponse(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, max-age=0',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(body);
}

// ─── Direct CDN URL Resolution & Range Proxy ─────────────────────────────────

function resolveDirectStreamUrl(mediaId, platform = 'youtube', cookiesBrowser = '') {
  const cacheKey = `${platform}_${mediaId}`;
  const cached = streamUrlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.url);
  }

  const ytDlpPath = getYtDlpPath();
  let mediaUrl = '';
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '-g'
  ];

  if (platform === 'instagram') {
    mediaUrl = `https://www.instagram.com/reel/${mediaId}/`;
    args.push('-f', 'bestvideo+bestaudio/best[ext=mp4]/best');
    try {
      const sessionManager = require('./session-manager');
      if (sessionManager.hasInstagramSession()) {
        args.push('--cookies', sessionManager.getInstagramSessionFilePath());
      } else if (cookiesBrowser) {
        args.push('--cookies-from-browser', cookiesBrowser);
      }
    } catch (e) {
      if (cookiesBrowser) args.push('--cookies-from-browser', cookiesBrowser);
    }
  } else {
    mediaUrl = `https://www.youtube.com/watch?v=${mediaId}`;
    args.push('--extractor-args', 'youtube:player_client=android,mweb');
    args.push('-f', '18/best[ext=mp4]/best');
  }

  args.push(mediaUrl);

  return new Promise((resolve, reject) => {
    execFile(ytDlpPath, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      const lines = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
      const directUrl = lines[0] || '';
      if (!directUrl || !directUrl.startsWith('http')) {
        return reject(new Error('No valid direct stream URL extracted'));
      }
      // Cache URL for 2 hours
      streamUrlCache.set(cacheKey, { url: directUrl, expires: Date.now() + 2 * 3600 * 1000 });
      resolve(directUrl);
    });
  });
}

function proxyDirectUrl(request, response, directUrl) {
  try {
    const parsed = new URL(directUrl);
    const clientReq = (parsed.protocol === 'https:' ? https : http).request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: request.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(request.headers.range ? { 'Range': request.headers.range } : {})
      }
    }, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 200;
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Origin, Accept, Content-Type',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store'
      };

      if (upstreamRes.headers['content-type']) headers['Content-Type'] = upstreamRes.headers['content-type'];
      if (upstreamRes.headers['content-length']) headers['Content-Length'] = upstreamRes.headers['content-length'];
      if (upstreamRes.headers['content-range']) headers['Content-Range'] = upstreamRes.headers['content-range'];

      response.writeHead(statusCode, headers);
      upstreamRes.pipe(response);

      request.on('close', () => {
        try { upstreamRes.destroy(); } catch (e) {}
      });
    });

    clientReq.on('error', (err) => {
      console.warn('[StreamDock Proxy Error]:', err.message);
      if (!response.headersSent) {
        sendResponse(response, 502, 'text/plain', 'Stream proxy error: ' + err.message);
      }
    });

    clientReq.end();
  } catch (err) {
    if (!response.headersSent) {
      sendResponse(response, 500, 'text/plain', 'Proxy error: ' + err.message);
    }
  }
}

// ─── Direct Stream Pipeline with Range Seeking ───────────────────────────────

function handleDirectStreamRequest(request, response, mediaId, platform = 'youtube', cookiesBrowser = '') {
  // First attempt: direct URL proxy with full HTTP Range seek support
  resolveDirectStreamUrl(mediaId, platform, cookiesBrowser)
    .then((directUrl) => {
      proxyDirectUrl(request, response, directUrl);
    })
    .catch((err) => {
      console.warn(`[StreamDock] Direct URL resolution failed for ${mediaId}, falling back to pipe:`, err.message);
      // Fallback: spawn stdout pipe
      fallbackPipeStream(request, response, mediaId, platform, cookiesBrowser);
    });
}

function fallbackPipeStream(request, response, mediaId, platform = 'youtube', cookiesBrowser = '') {
  const ytDlpPath = getYtDlpPath();
  const processKey = `${platform}_${mediaId}`;
  
  let mediaUrl = '';
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--quiet'
  ];

  if (platform === 'instagram') {
    mediaUrl = `https://www.instagram.com/reel/${mediaId}/`;
    args.push('-f', 'bestvideo+bestaudio/best[ext=mp4]/best');
    try {
      const sessionManager = require('./session-manager');
      if (sessionManager.hasInstagramSession()) {
        args.push('--cookies', sessionManager.getInstagramSessionFilePath());
      } else if (cookiesBrowser) {
        args.push('--cookies-from-browser', cookiesBrowser);
      }
    } catch (e) {
      if (cookiesBrowser) args.push('--cookies-from-browser', cookiesBrowser);
    }
  } else {
    mediaUrl = `https://www.youtube.com/watch?v=${mediaId}`;
    args.push('--extractor-args', 'youtube:player_client=android,mweb');
    args.push('-f', '18/best[ext=mp4]/best');
  }

  args.push('-o', '-', mediaUrl);

  if (activeStreamProcesses.has(processKey)) {
    try { activeStreamProcesses.get(processKey).kill(); } catch (e) {}
    activeStreamProcesses.delete(processKey);
  }

  response.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache, no-store'
  });

  const proc = spawn(ytDlpPath, args, { windowsHide: true });
  activeStreamProcesses.set(processKey, proc);

  proc.stdout.pipe(response);

  proc.on('close', () => {
    activeStreamProcesses.delete(processKey);
    if (!response.writableEnded) response.end();
  });

  proc.on('error', (e) => {
    activeStreamProcesses.delete(processKey);
    if (!response.headersSent) sendResponse(response, 500, 'text/plain', 'Stream error: ' + e.message);
  });

  request.on('close', () => {
    if (activeStreamProcesses.get(processKey) === proc) {
      try { proc.kill(); } catch (e) {}
      activeStreamProcesses.delete(processKey);
    }
  });
}

// ─── Bridge HTML for YouTube & Instagram Embeds ───────────────────────────────

function buildYouTubeEmbedUrl(videoId, embedOrigin) {
  const params = [
    'autoplay=1',
    'controls=1',
    'enablejsapi=1',
    'iv_load_policy=3',
    'modestbranding=1',
    'rel=0',
    'playsinline=1'
  ];

  if (embedOrigin) {
    params.push('origin=' + encodeURIComponent(embedOrigin));
    params.push('widget_referrer=' + encodeURIComponent(embedOrigin));
  }

  return 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?' + params.join('&');
}

function buildYouTubeBridgeHtml(videoId) {
  const embedUrl = buildYouTubeEmbedUrl(videoId, previewBridgeOrigin);
  const scriptVideoId = escapeJavaScriptString(videoId);

  return '<!doctype html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style>' +
    '</head><body>' +
    '<iframe id="sidestream-youtube-player" src="' + escapeHtml(embedUrl) + '" ' +
    'allow="autoplay; encrypted-media; picture-in-picture; web-share; fullscreen" ' +
    'referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
    '<script>' +
    '(function(){' +
    'var videoId="' + scriptVideoId + '";' +
    'var player=null;var stateTimer=null;var apiTimeoutId=null;var playerReady=false;' +
    'function send(type,details){try{parent.postMessage({sidestreamPreview:"youtube_embed",type:type,videoId:videoId,details:details||{}},"*");}catch(e){}}' +
    'function safeNumber(v){var n=Number(v);return isFinite(n)&&n>=0?n:0;}' +
    'function collectState(){' +
    'var d={playerState:-1,currentTime:0,duration:0,loadedFraction:0};' +
    'try{if(!player)return d;' +
    'if(typeof player.getPlayerState==="function")d.playerState=Number(player.getPlayerState());' +
    'if(typeof player.getCurrentTime==="function")d.currentTime=safeNumber(player.getCurrentTime());' +
    'if(typeof player.getDuration==="function")d.duration=safeNumber(player.getDuration());' +
    'if(typeof player.getVideoLoadedFraction==="function")d.loadedFraction=Math.max(0,Math.min(Number(player.getVideoLoadedFraction())||0,1));' +
    '}catch(e){}return d;}' +
    'function sendState(){send("state",collectState());}' +
    'function startStateTimer(){if(stateTimer)return;stateTimer=window.setInterval(sendState,250);}' +
    'function clearApiTimeout(){if(!apiTimeoutId)return;window.clearTimeout(apiTimeoutId);apiTimeoutId=null;}' +
    'window.onYouTubeIframeAPIReady=function(){' +
    'try{' +
    'player=new YT.Player("sidestream-youtube-player",{' +
    'events:{' +
    'onReady:function(){playerReady=true;clearApiTimeout();send("ready",collectState());startStateTimer();sendState();},' +
    'onStateChange:function(){sendState();},' +
    'onError:function(event){clearApiTimeout();send("error",{code:event.data});}' +
    '}});' +
    '}catch(e){clearApiTimeout();send("api_error",{message:e&&e.message?e.message:String(e)});}' +
    '};' +
    'window.addEventListener("message",function(event){' +
    'var data=event&&event.data?event.data:null;' +
    'if(!data||data.sidestreamPreviewCommand!=="youtube_embed"||data.videoId!==videoId)return;' +
    'if(data.command==="requestState"){sendState();return;}' +
    'if(data.command==="seekTo"){' +
    'try{' +
    'if(player&&typeof player.seekTo==="function"){' +
    'var target=safeNumber(data.args&&data.args[0]);' +
    'player.seekTo(target,true);' +
    'sendState();' +
    '}' +
    '}catch(e){}' +
    'return;' +
    '}' +
    'try{if(player&&typeof player[data.command]==="function")player[data.command].apply(player,data.args||[]);}catch(e){}' +
    '});' +
    'apiTimeoutId=window.setTimeout(function(){if(playerReady)return;send("api_timeout",{});},8000);' +
    '})();' +
    '</script>' +
    '<script src="https://www.youtube.com/iframe_api"></script>' +
    '</body></html>';
}

function buildInstagramBridgeHtml(shortcode) {
  const embedUrl = `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`;

  return '<!doctype html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}iframe{display:block;width:100%;height:100%;border:0}</style>' +
    '</head><body>' +
    '<iframe src="' + escapeHtml(embedUrl) + '" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>' +
    '</body></html>';
}

// ─── Request Handler ─────────────────────────────────────────────────────────

function handleRequest(request, response) {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, previewBridgeOrigin || 'http://127.0.0.1');
  } catch (e) {
    sendResponse(response, 400, 'text/plain', 'Bad request');
    return;
  }

  const pathname = requestUrl.pathname;

  // Route: /youtube-preview?videoId=<id>
  if (pathname === '/youtube-preview') {
    const videoId = requestUrl.searchParams.get('videoId') || '';
    if (!isValidMediaId(videoId)) {
      sendResponse(response, 400, 'text/plain', 'Invalid video id');
      return;
    }
    sendResponse(response, 200, 'text/html; charset=utf-8', buildYouTubeBridgeHtml(videoId));
    return;
  }

  // Route: /instagram-preview?shortcode=<shortcode>
  if (pathname === '/instagram-preview') {
    const shortcode = requestUrl.searchParams.get('shortcode') || '';
    if (!isValidMediaId(shortcode)) {
      sendResponse(response, 400, 'text/plain', 'Invalid shortcode');
      return;
    }
    sendResponse(response, 200, 'text/html; charset=utf-8', buildInstagramBridgeHtml(shortcode));
    return;
  }

  // Route: /stream?videoId=<id>&platform=<youtube|instagram>&cookiesBrowser=<browser>
  if (pathname === '/stream') {
    const videoId = requestUrl.searchParams.get('videoId') || '';
    const platform = requestUrl.searchParams.get('platform') || 'youtube';
    const cookiesBrowser = requestUrl.searchParams.get('cookiesBrowser') || '';
    
    if (!isValidMediaId(videoId)) {
      sendResponse(response, 400, 'text/plain', 'Invalid media id');
      return;
    }
    handleDirectStreamRequest(request, response, videoId, platform, cookiesBrowser);
    return;
  }

  sendResponse(response, 404, 'text/plain', 'Not found');
}

// ─── Server Lifecycle ────────────────────────────────────────────────────────

let previewServerStartingPromise = null;

function startPreviewBridgeServer() {
  if (previewBridgeOrigin) {
    return Promise.resolve(previewBridgeOrigin);
  }
  if (previewServerStartingPromise) {
    return previewServerStartingPromise;
  }

  previewServerStartingPromise = new Promise((resolve) => {
    previewBridgeServer = http.createServer(handleRequest);

    previewBridgeServer.on('error', (err) => {
      console.warn('Preview bridge server error:', err);
      previewServerStartingPromise = null;
      resolve('');
    });

    previewBridgeServer.listen(0, '127.0.0.1', () => {
      const address = previewBridgeServer.address();
      if (address && address.port) {
        previewBridgeOrigin = 'http://127.0.0.1:' + address.port;
        console.log('StreamDock Preview Bridge active on:', previewBridgeOrigin);
      }
      resolve(previewBridgeOrigin);
    });
  });

  return previewServerStartingPromise;
}

// ─── Public API ──────────────────────────────────────────────────────────────

function getPreviewUrl(videoId) {
  if (previewBridgeOrigin && isValidMediaId(videoId)) {
    return previewBridgeOrigin + '/youtube-preview?videoId=' + encodeURIComponent(videoId);
  }
  return 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&enablejsapi=1&rel=0&playsinline=1';
}

function getInstagramPreviewUrl(shortcode) {
  if (previewBridgeOrigin && isValidMediaId(shortcode)) {
    return previewBridgeOrigin + '/instagram-preview?shortcode=' + encodeURIComponent(shortcode);
  }
  return `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`;
}

function getProxiedStreamUrl(mediaId, platform = 'youtube', cookiesBrowser = '') {
  if (previewBridgeOrigin && isValidMediaId(mediaId)) {
    let url = previewBridgeOrigin + '/stream?videoId=' + encodeURIComponent(mediaId) + '&platform=' + encodeURIComponent(platform);
    if (cookiesBrowser) {
      url += '&cookiesBrowser=' + encodeURIComponent(cookiesBrowser);
    }
    return url;
  }
  return null;
}

function getPreviewBridgeOrigin() {
  return previewBridgeOrigin;
}

module.exports = {
  startPreviewBridgeServer,
  getPreviewUrl,
  getInstagramPreviewUrl,
  getProxiedStreamUrl,
  getPreviewBridgeOrigin
};
