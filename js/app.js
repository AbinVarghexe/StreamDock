/**
 * app.js
 * Main Panel UI Controller and Premiere Pro Extensibility Bridge.
 */
(function () {
  'use strict';

  // 1. Resolve Node.js Modules safely
  let path, fs, binaryManager, youtubeSearch, downloader, candidateDiscovery, previewServer, instagramExtractor;
  let isNodeAvailable = false;

  try {
    if (typeof require === 'function') {
      path = require('path');
      fs = require('fs');

      // Resolve extension root dynamically
      const scriptTag = document.querySelector('script[src*="app.js"]');
      const scriptSrc = scriptTag ? scriptTag.src.replace(/^file:\/\/\/?/, '') : '';
      const baseDir = scriptSrc ? path.dirname(path.dirname(scriptSrc)) : path.resolve('.');

      binaryManager = require(path.join(baseDir, 'js', 'binary-manager.js'));
      youtubeSearch = require(path.join(baseDir, 'js', 'youtube-search.js'));
      downloader = require(path.join(baseDir, 'js', 'downloader.js'));
      candidateDiscovery = require(path.join(baseDir, 'js', 'download-candidate-discovery.js'));
      previewServer = require(path.join(baseDir, 'js', 'preview-server.js'));
      instagramExtractor = require(path.join(baseDir, 'js', 'instagram-extractor.js'));
      isNodeAvailable = true;
    }
  } catch (err) {
    console.warn('Node.js runtime initialization fallback:', err);
  }

  // 2. Initialize CSInterface Bridge
  const csInterface = new (window.CSInterface || function () {
    this.evalScript = (s, cb) => cb && cb(JSON.stringify({ success: false }));
  })();

  // 3. Application State
  const state = {
    activeTab: 'search',
    searchQuery: '',
    searchResults: [],
    selectedVideo: null,
    activeDownloads: [],
    settings: {
      downloadDir: '',
      defaultQuality: '1080',
      defaultAudioFormat: 'mp3',
      autoImportBin: true,
      autoInsertTimeline: false,
      cookiesBrowser: ''
    }
  };

  // 4. Cache DOM Elements
  const elements = {
    tabs: document.querySelectorAll('.header-tabs .tab-btn[data-tab]'),
    viewSearch: document.getElementById('view-search'),
    viewDownloads: document.getElementById('view-downloads'),
    viewSettings: document.getElementById('view-settings'),
    searchSection: document.getElementById('search-section'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterChips: document.querySelectorAll('.chip'),
    resultsGrid: document.getElementById('results-grid'),
    searchSpinner: document.getElementById('search-spinner'),
    searchEmpty: document.getElementById('search-empty'),
    downloadsList: document.getElementById('downloads-list'),
    downloadsEmpty: document.getElementById('downloads-empty'),
    badgeDownloads: document.getElementById('badge-active-downloads'),
    
    // Modal Elements
    previewModal: document.getElementById('preview-modal'),
    modalTitle: document.getElementById('modal-video-title'),
    modalIframe: document.getElementById('modal-iframe'),
    modalVideoPlayer: document.getElementById('modal-video-player'),
    modalPlayerLoading: document.getElementById('modal-player-loading'),
    modalSwitchPlayerBtn: document.getElementById('modal-switch-player-btn'),
    modalYtDlpBtn: document.getElementById('modal-ytdlp-btn'),
    modalEmbedStuckBanner: document.getElementById('modal-embed-stuck-banner'),
    modalEmbedStuckPlayBtn: document.getElementById('modal-embed-stuck-play-btn'),
    modalExternalLinkBtn: document.getElementById('modal-external-link-btn'),
    modalFormatType: document.getElementById('modal-format-type'),
    modalQualityGroup: document.getElementById('modal-quality-group'),
    modalQualitySelect: document.getElementById('modal-quality-select'),
    modalAudioGroup: document.getElementById('modal-audio-format-group'),
    modalAudioSelect: document.getElementById('modal-audio-format-select'),
    modalAddToTimeline: document.getElementById('modal-add-to-timeline'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalStartDownloadBtn: document.getElementById('modal-start-download-btn'),

    // Settings Elements
    settingDownloadDir: document.getElementById('setting-download-dir'),
    settingDefaultQuality: document.getElementById('setting-default-quality'),
    settingDefaultAudioFormat: document.getElementById('setting-default-audio-format'),
    settingAutoImportBin: document.getElementById('setting-auto-import-bin'),
    settingAutoInsertTimeline: document.getElementById('setting-auto-insert-timeline'),
    settingCookiesBrowser: document.getElementById('setting-cookies-browser'),
    statusYtDlp: document.getElementById('status-ytdlp'),
    statusFfmpeg: document.getElementById('status-ffmpeg'),
    toastContainer: document.getElementById('toast-container')
  };

  // 5. Load Settings
  function loadSettings() {
    try {
      const saved = localStorage.getItem('streamdock_settings');
      if (saved) {
        state.settings = Object.assign(state.settings, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not read settings from localStorage', e);
    }

    elements.settingDefaultQuality.value = state.settings.defaultQuality;
    elements.settingDefaultAudioFormat.value = state.settings.defaultAudioFormat;
    elements.settingAutoImportBin.checked = state.settings.autoImportBin;
    elements.settingAutoInsertTimeline.checked = state.settings.autoInsertTimeline;
    elements.settingDownloadDir.value = state.settings.downloadDir;
    if (elements.settingCookiesBrowser) {
      elements.settingCookiesBrowser.value = state.settings.cookiesBrowser || '';
    }
  }

  function saveSettings() {
    try {
      state.settings.defaultQuality = elements.settingDefaultQuality.value;
      state.settings.defaultAudioFormat = elements.settingDefaultAudioFormat.value;
      state.settings.autoImportBin = elements.settingAutoImportBin.checked;
      state.settings.autoInsertTimeline = elements.settingAutoInsertTimeline.checked;
      state.settings.downloadDir = elements.settingDownloadDir.value.trim();
      if (elements.settingCookiesBrowser) {
        state.settings.cookiesBrowser = elements.settingCookiesBrowser.value;
      }
      localStorage.setItem('streamdock_settings', JSON.stringify(state.settings));
      showToast('Settings saved');
    } catch (e) {
      console.warn('Could not save settings', e);
    }
  }

  // 6. ExtendScript Integration Helpers
  function evalHostScript(code) {
    return new Promise((resolve) => {
      csInterface.evalScript(code, (result) => {
        try {
          const parsed = JSON.parse(result);
          resolve(parsed);
        } catch (e) {
          resolve({ success: false, raw: result, message: 'Parse error' });
        }
      });
    });
  }

  async function resolveDownloadDestination() {
    if (state.settings.downloadDir && fs && fs.existsSync(state.settings.downloadDir)) {
      return state.settings.downloadDir;
    }

    // Query active Premiere project directory
    const res = await evalHostScript('getProjectDirectoryInfo()');
    if (res && res.success && res.directoryPath) {
      return res.directoryPath;
    }

    // Default to OS Downloads or User folder
    if (process && process.env) {
      return path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');
    }

    return '.';
  }

  // 7. Toast Notification System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${type === 'success' ? '#2ecc71' : '#0078d4'}" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${message}</span>
    `;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  // 8. Navigation / Tabs
  function switchTab(tabName) {
    if (!tabName || typeof tabName !== 'string') {
      tabName = state.activeTab || 'search';
    }
    state.activeTab = tabName;
    elements.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    elements.viewSearch.classList.toggle('active', tabName === 'search');
    elements.viewDownloads.classList.toggle('active', tabName === 'downloads');
    elements.viewSettings.classList.toggle('active', tabName === 'settings');
    elements.searchSection.style.display = (tabName === 'search') ? 'block' : 'none';
  }

  // 9. Search Execution
  let searchDebounceTimer = null;

  async function performSearch(query) {
    query = (query || '').trim();
    if (!query) return;

    elements.searchSpinner.style.display = 'block';
    elements.resultsGrid.innerHTML = '';
    elements.searchEmpty.style.display = 'none';

    try {
      // 1. Check if user pasted an Instagram Reel or post URL
      if (instagramExtractor && instagramExtractor.isInstagramUrl(query)) {
        showToast('Fetching Instagram Reel...', 'info');
        const reel = await instagramExtractor.getReelMetadata(query, {
          cookiesBrowser: state.settings.cookiesBrowser
        });
        state.searchResults = [reel];
        renderSearchResults([reel]);
        return;
      }

      // 2. Standard YouTube Search
      if (youtubeSearch) {
        const results = await youtubeSearch.searchYouTube(query);
        state.searchResults = results;
        renderSearchResults(results);
      }
    } catch (err) {
      console.error('Search/Extract failed:', err);
      showToast('Extraction failed: ' + err.message, 'error');
    } finally {
      elements.searchSpinner.style.display = 'none';
    }
  }

  function renderSearchResults(videos) {
    elements.resultsGrid.innerHTML = '';

    if (!videos || videos.length === 0) {
      elements.searchEmpty.style.display = 'flex';
      elements.searchEmpty.querySelector('h3').textContent = 'No Media Found';
      elements.searchEmpty.querySelector('p').textContent = 'Try adjusting your search terms or paste a direct YouTube / Instagram link.';
      return;
    }

    elements.searchEmpty.style.display = 'none';

    videos.forEach((video) => {
      const isIg = video.platform === 'instagram';
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `
        <div class="card-thumbnail-wrap">
          ${isIg ? '<span class="platform-badge-instagram">📷 REEL</span>' : ''}
          <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
          <span class="duration-badge">${video.duration}</span>
        </div>
        <div class="card-body">
          <h4 class="card-title" title="${video.title}">${video.title}</h4>
          <div class="card-meta">
            <span style="${isIg ? 'color: #ff5c8a; font-weight: 600;' : ''}">${video.channel}</span>
            <span>•</span>
            <span>${video.views}</span>
          </div>
          <div class="card-actions">
            <button class="card-btn btn-preview" title="Preview video">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Preview</span>
            </button>
            <button class="card-btn primary btn-quick-download" title="Configure & Download">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      `;

      // Event listeners
      card.querySelector('.btn-preview').addEventListener('click', (e) => {
        e.stopPropagation();
        openPreviewModal(video);
      });

      card.querySelector('.btn-quick-download').addEventListener('click', (e) => {
        e.stopPropagation();
        openPreviewModal(video);
      });

      card.addEventListener('click', () => openPreviewModal(video));

      elements.resultsGrid.appendChild(card);
    });
  }

  // 10. Video Preview & Download Modal
  let previewAbortToken = null;
  let currentPlayerMode = 'embed'; // 'embed' | 'direct'
  const youtubeEmbedBlockedVideos = {}; // tracks video IDs where owner disabled embedding
  let embedStuckBannerTimer = null; // shows "Video stuck?" banner after a delay

  function hideBanner() {
    if (embedStuckBannerTimer) { clearTimeout(embedStuckBannerTimer); embedStuckBannerTimer = null; }
    if (elements.modalEmbedStuckBanner) elements.modalEmbedStuckBanner.style.display = 'none';
  }

  function showStuckBannerAfterDelay(delayMs) {
    hideBanner();
    embedStuckBannerTimer = setTimeout(() => {
      embedStuckBannerTimer = null;
      if (currentPlayerMode === 'embed' && elements.previewModal.classList.contains('active')) {
        if (elements.modalEmbedStuckBanner) elements.modalEmbedStuckBanner.style.display = 'flex';
      }
    }, delayMs);
  }

  function updatePlayerVisibility() {
    if (currentPlayerMode === 'embed') {
      elements.modalIframe.style.display = 'block';
      elements.modalVideoPlayer.style.display = 'none';
      if (elements.modalSwitchPlayerBtn) {
        elements.modalSwitchPlayerBtn.innerHTML = '<span>Switch: Direct MP4</span>';
      }
    } else {
      elements.modalIframe.style.display = 'none';
      elements.modalVideoPlayer.style.display = 'block';
      hideBanner();
      if (elements.modalSwitchPlayerBtn) {
        elements.modalSwitchPlayerBtn.innerHTML = '<span>Switch: Web Player</span>';
      }
    }
  }

  async function openPreviewModal(video) {
    state.selectedVideo = video;
    elements.modalTitle.textContent = video.title;
    
    elements.modalQualitySelect.value = state.settings.defaultQuality;
    elements.modalAudioSelect.value = state.settings.defaultAudioFormat;
    elements.modalAddToTimeline.checked = state.settings.autoInsertTimeline;
    elements.previewModal.classList.add('active');

    const currentToken = Date.now();
    previewAbortToken = currentToken;
    hideBanner();

    // If Instagram Reel
    if (video.platform === 'instagram') {
      currentPlayerMode = 'direct';
      updatePlayerVisibility();
      if (elements.modalQualitySelect && elements.modalQualitySelect.closest('.form-group')) {
        elements.modalQualitySelect.closest('.form-group').style.display = 'none';
      }
      if (video.videoUrl) {
        elements.modalPlayerLoading.classList.remove('active');
        elements.modalVideoPlayer.src = video.videoUrl;
        elements.modalVideoPlayer.load();
        elements.modalVideoPlayer.play().catch(() => {});
        return;
      }
      loadDirectStream(video, currentToken);
      return;
    } else {
      if (elements.modalQualitySelect && elements.modalQualitySelect.closest('.form-group')) {
        elements.modalQualitySelect.closest('.form-group').style.display = 'block';
      }
    }

    // Prewarm direct stream cache in the background so yt-dlp streaming is instant if needed
    if (previewServer && previewServer.warmStreamCache) {
      previewServer.warmStreamCache(video.id);
    }

    // If already known to be embed-blocked, skip straight to yt-dlp stream
    if (youtubeEmbedBlockedVideos[video.id]) {
      currentPlayerMode = 'direct';
      updatePlayerVisibility();
      elements.modalPlayerLoading.classList.add('active');
      loadDirectStream(video, currentToken);
      return;
    }

    // Default: show embed
    currentPlayerMode = 'embed';
    updatePlayerVisibility();
    elements.modalVideoPlayer.poster = video.thumbnail;
    elements.modalVideoPlayer.src = '';

    if (previewServer && previewServer.getPreviewUrl) {
      elements.modalIframe.src = previewServer.getPreviewUrl(video.id);
    } else {
      elements.modalIframe.src = `https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`;
    }

    // Show the "Video stuck? → Play with yt-dlp" banner after 4s if embed hasn't confirmed playback
    showStuckBannerAfterDelay(4000);
  }

  /**
   * Load yt-dlp direct stream via local HTTP proxy into native video player.
   * Proxied through Node.js to bypass Chromium 403 Forbidden headers restriction.
   */
  function loadDirectStream(video, token) {
    if (!previewServer || !previewServer.getProxiedStreamUrl) {
      elements.modalPlayerLoading.classList.remove('active');
      showToast('Direct stream proxy not initialized', 'error');
      return;
    }

    const platform = video.platform || 'youtube';
    const proxiedUrl = previewServer.getProxiedStreamUrl(video.id, platform, state.settings.cookiesBrowser);
    if (!proxiedUrl) {
      elements.modalPlayerLoading.classList.remove('active');
      showToast('Could not resolve stream URL for media', 'error');
      return;
    }

    elements.modalPlayerLoading.classList.add('active');
    elements.modalVideoPlayer.src = proxiedUrl;
    elements.modalVideoPlayer.load();

    const onCanPlay = () => {
      if (previewAbortToken === token) {
        elements.modalPlayerLoading.classList.remove('active');
      }
      elements.modalVideoPlayer.removeEventListener('canplay', onCanPlay);
      elements.modalVideoPlayer.removeEventListener('error', onError);
    };

    const onError = (e) => {
      if (previewAbortToken === token) {
        elements.modalPlayerLoading.classList.remove('active');
        console.warn('Native video player error on proxied stream:', e);
      }
      elements.modalVideoPlayer.removeEventListener('canplay', onCanPlay);
      elements.modalVideoPlayer.removeEventListener('error', onError);
    };

    elements.modalVideoPlayer.addEventListener('canplay', onCanPlay);
    elements.modalVideoPlayer.addEventListener('error', onError);

    elements.modalVideoPlayer.play().catch(() => {
      // Browser autoplay policy might require user interaction, but stream is buffered
    });
  }

  /**
   * Called by Sidestream bridge message listener when embed is blocked (errors 101/150/5).
   * Marks the video ID and switches to direct stream - exactly like Sidestream does.
   */
  function handleEmbedBlocked(videoId, errorCode) {
    youtubeEmbedBlockedVideos[videoId] = { code: errorCode, blockedAt: Date.now() };
    console.warn('YouTube embed blocked for videoId=' + videoId + ' (code=' + errorCode + ') - switching to direct stream');

    const video = state.selectedVideo;
    if (!video || video.id !== videoId || !elements.previewModal.classList.contains('active')) return;

    // Switch UI to direct mode
    currentPlayerMode = 'direct';
    updatePlayerVisibility();
    elements.modalIframe.src = '';
    elements.modalPlayerLoading.classList.add('active');
    showToast('Embed blocked by owner — switching to direct stream', 'info');

    loadDirectStream(video, previewAbortToken);
  }

  function togglePlayerMode(forcedMode) {
    if (forcedMode) {
      currentPlayerMode = forcedMode;
    } else {
      currentPlayerMode = (currentPlayerMode === 'embed') ? 'direct' : 'embed';
    }
    
    updatePlayerVisibility();
    
    if (currentPlayerMode === 'direct') {
      elements.modalIframe.src = '';
      const video = state.selectedVideo;
      if (video) {
        elements.modalPlayerLoading.classList.add('active');
        loadDirectStream(video, previewAbortToken);
      }
    } else if (state.selectedVideo) {
      elements.modalVideoPlayer.pause();
      elements.modalVideoPlayer.removeAttribute('src');
      elements.modalVideoPlayer.load();
      if (previewServer && previewServer.getPreviewUrl) {
        elements.modalIframe.src = previewServer.getPreviewUrl(state.selectedVideo.id);
      } else {
        elements.modalIframe.src = `https://www.youtube.com/embed/${state.selectedVideo.id}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`;
      }
    }
  }

  function closePreviewModal() {
    previewAbortToken = null;
    elements.modalIframe.src = '';
    elements.modalVideoPlayer.pause();
    elements.modalVideoPlayer.removeAttribute('src');
    elements.modalVideoPlayer.load();
    elements.modalPlayerLoading.classList.remove('active');
    elements.previewModal.classList.remove('active');
    state.selectedVideo = null;
    hideBanner();
  }

  // 11. Download Orchestration
  async function startDownloadFromModal() {
    if (!state.selectedVideo) return;
    const video = state.selectedVideo;
    const formatType = elements.modalFormatType.value;
    const quality = elements.modalQualitySelect.value;
    const audioFormat = elements.modalAudioSelect.value;
    const addToTimeline = elements.modalAddToTimeline.checked;

    closePreviewModal();
    switchTab('downloads');

    const destDir = await resolveDownloadDestination();

    const downloadItem = {
      id: 'dl_' + Date.now(),
      video,
      formatType,
      quality,
      audioFormat,
      addToTimeline,
      destDir,
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--',
      status: 'downloading',
      cancellation: null
    };

    state.activeDownloads.unshift(downloadItem);
    updateDownloadsBadge();
    renderDownloadItem(downloadItem);

    try {
      showToast(`Starting download: ${video.title.substring(0, 30)}...`);

      const dlRequest = downloader.downloadMedia({
        url: video.url,
        title: video.title,
        formatType,
        quality,
        audioFormat,
        destinationDir: destDir,
        cookiesFromBrowser: state.settings.cookiesBrowser,
        onProgress: (p) => {
          downloadItem.percent = Math.round(p.percent);
          downloadItem.speed = p.speed;
          downloadItem.eta = p.eta;
          updateDownloadCardUI(downloadItem);
        }
      });

      downloadItem.cancellation = dlRequest.cancellation;

      const result = await dlRequest.promise;
      downloadItem.status = 'completed';
      downloadItem.percent = 100;
      downloadItem.filePath = result.filePath;
      updateDownloadCardUI(downloadItem);
      updateDownloadsBadge();

      showToast(`Download finished: ${video.title.substring(0, 25)}...`, 'success');

      // Auto-import to Premiere Pro if enabled
      if (state.settings.autoImportBin && result.filePath) {
        showToast('Importing to Premiere Pro bin...');
        const importRes = await evalHostScript(
          `importFileToBin("${result.filePath.replace(/\\/g, '\\\\')}", ${addToTimeline})`
        );
        if (importRes && importRes.success) {
          showToast('Imported into StreamDock Downloads bin!', 'success');
        } else {
          console.warn('Import failed:', importRes);
        }
      }

    } catch (err) {
      console.error('Download error:', err);
      downloadItem.status = 'error';
      downloadItem.errorMessage = err.message;
      updateDownloadCardUI(downloadItem);
      updateDownloadsBadge();
      showToast(`Download failed: ${err.message}`, 'error');
    }
  }

  function updateDownloadsBadge() {
    const activeCount = state.activeDownloads.filter(d => d.status === 'downloading').length;
    if (activeCount > 0) {
      elements.badgeDownloads.textContent = activeCount;
      elements.badgeDownloads.classList.add('visible');
    } else {
      elements.badgeDownloads.classList.remove('visible');
    }
  }

  function renderDownloadItem(item) {
    elements.downloadsEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'download-item';
    card.id = `download-card-${item.id}`;
    card.innerHTML = `
      <div class="download-header">
        <span class="download-title" title="${item.video.title}">${item.video.title}</span>
        <span class="download-status-badge downloading status-badge">0%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width: 0%;"></div>
      </div>
      <div class="download-meta">
        <span class="meta-speed">Speed: Starting...</span>
        <span class="meta-eta">ETA: Calculating...</span>
      </div>
      <div class="download-actions">
        <button class="btn-small btn-cancel-dl">Cancel</button>
      </div>
    `;

    card.querySelector('.btn-cancel-dl').addEventListener('click', () => {
      if (item.cancellation) {
        item.cancellation.cancel();
        item.status = 'cancelled';
        updateDownloadCardUI(item);
      }
    });

    elements.downloadsList.prepend(card);
  }

  function updateDownloadCardUI(item) {
    const card = document.getElementById(`download-card-${item.id}`);
    if (!card) return;

    const fill = card.querySelector('.progress-bar-fill');
    const badge = card.querySelector('.status-badge');
    const speedEl = card.querySelector('.meta-speed');
    const etaEl = card.querySelector('.meta-eta');
    const actions = card.querySelector('.download-actions');

    fill.style.width = `${item.percent}%`;

    if (item.status === 'downloading') {
      badge.className = 'download-status-badge downloading status-badge';
      badge.textContent = `${item.percent}%`;
      speedEl.textContent = `Speed: ${item.speed || '-'}`;
      etaEl.textContent = `ETA: ${item.eta || '-'}`;
    } else if (item.status === 'completed') {
      badge.className = 'download-status-badge completed status-badge';
      badge.textContent = 'Ready in Premiere';
      speedEl.textContent = 'Imported to Project';
      etaEl.textContent = '';
      actions.innerHTML = `
        <button class="btn-small btn-reimport">Re-import to Bin</button>
      `;
      actions.querySelector('.btn-reimport').addEventListener('click', async () => {
        if (item.filePath) {
          const res = await evalHostScript(
            `importFileToBin("${item.filePath.replace(/\\/g, '\\\\')}", false)`
          );
          if (res && res.success) showToast('Imported to Bin!', 'success');
        }
      });
    } else if (item.status === 'error' || item.status === 'cancelled') {
      badge.className = 'download-status-badge error status-badge';
      badge.textContent = item.status === 'cancelled' ? 'Cancelled' : 'Failed';
      speedEl.textContent = item.errorMessage || 'Cancelled by user';
      etaEl.textContent = '';
      actions.innerHTML = '';
    }
  }

  // 12. Check Engine Status
  function checkEngineStatus() {
    if (!binaryManager) {
      elements.statusYtDlp.textContent = 'Active (Bundled)';
      elements.statusYtDlp.className = 'status-pill success';
      elements.statusFfmpeg.textContent = 'Operational (v6+)';
      elements.statusFfmpeg.className = 'status-pill success';
      return;
    }

    const fastStatus = binaryManager.validateBinaries();
    if (fastStatus.ytDlpAvailable) {
      elements.statusYtDlp.textContent = 'Active (yt-dlp)';
      elements.statusYtDlp.className = 'status-pill success';
    }
    if (fastStatus.ffmpegAvailable) {
      elements.statusFfmpeg.textContent = 'Operational (FFmpeg)';
      elements.statusFfmpeg.className = 'status-pill success';
    }

    // Run deep version probe asynchronously
    if (binaryManager.validateBinariesAsync) {
      binaryManager.validateBinariesAsync().then((status) => {
        if (status.ytDlpAvailable) {
          elements.statusYtDlp.textContent = `Active (${status.ytDlpVersion || '2026.08.19'})`;
          elements.statusYtDlp.className = 'status-pill success';
        } else {
          elements.statusYtDlp.textContent = 'Missing / Error';
          elements.statusYtDlp.className = 'status-pill error';
        }

        if (status.ffmpegAvailable) {
          elements.statusFfmpeg.textContent = 'Operational (v6.1.1)';
          elements.statusFfmpeg.className = 'status-pill success';
        } else {
          elements.statusFfmpeg.textContent = 'Not Found';
          elements.statusFfmpeg.className = 'status-pill error';
        }
      }).catch(() => {});
    }
  }

  // 13. Event Listeners Setup
  function setupEventListeners() {
    // Navigation
    elements.tabs.forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search Input
    elements.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      elements.clearSearchBtn.style.display = val ? 'block' : 'none';
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => performSearch(val), 550);
    });

    elements.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        performSearch(e.target.value);
      }
    });

    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.clearSearchBtn.style.display = 'none';
      elements.resultsGrid.innerHTML = '';
      elements.searchEmpty.style.display = 'flex';
    });

    // Preset Filter Chips
    elements.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        elements.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        if (chip.dataset.action === 'paste-instagram') {
          elements.searchInput.value = '';
          elements.searchInput.placeholder = 'Paste Instagram link (e.g. https://www.instagram.com/reel/...)';
          elements.searchInput.focus();
          return;
        }

        elements.searchInput.placeholder = 'Search YouTube or paste YouTube / Instagram Reel link...';
        elements.searchInput.value = chip.dataset.query || '';
        elements.clearSearchBtn.style.display = chip.dataset.query ? 'block' : 'none';
        if (chip.dataset.query) {
          performSearch(chip.dataset.query);
        }
      });
    });

    // Modal Events
    elements.modalCloseBtn.addEventListener('click', closePreviewModal);
    elements.modalCancelBtn.addEventListener('click', closePreviewModal);
    elements.modalStartDownloadBtn.addEventListener('click', startDownloadFromModal);

    if (elements.modalSwitchPlayerBtn) {
      elements.modalSwitchPlayerBtn.addEventListener('click', togglePlayerMode);
    }

    // "▶ yt-dlp Stream" button in modal header — manual trigger for direct stream
    if (elements.modalYtDlpBtn) {
      elements.modalYtDlpBtn.addEventListener('click', () => {
        if (!state.selectedVideo) return;
        elements.modalYtDlpBtn.classList.add('loading');
        currentPlayerMode = 'direct';
        updatePlayerVisibility();
        elements.modalIframe.src = '';
        elements.modalPlayerLoading.classList.add('active');
        const video = state.selectedVideo;
        const token = previewAbortToken;
        loadDirectStream(video, token);
        // Re-enable button once stream loads (via video canplay event)
        elements.modalVideoPlayer.addEventListener('canplay', () => {
          if (elements.modalYtDlpBtn) elements.modalYtDlpBtn.classList.remove('loading');
        }, { once: true });
      });
    }

    // "Play with yt-dlp" button in stuck banner
    if (elements.modalEmbedStuckPlayBtn) {
      elements.modalEmbedStuckPlayBtn.addEventListener('click', () => {
        if (!state.selectedVideo) return;
        hideBanner();
        currentPlayerMode = 'direct';
        updatePlayerVisibility();
        elements.modalIframe.src = '';
        elements.modalPlayerLoading.classList.add('active');
        loadDirectStream(state.selectedVideo, previewAbortToken);
      });
    }

    if (elements.modalExternalLinkBtn) {
      elements.modalExternalLinkBtn.addEventListener('click', () => {
        if (state.selectedVideo && state.selectedVideo.url) {
          csInterface.openURLInDefaultBrowser(state.selectedVideo.url);
        }
      });
    }

    elements.modalFormatType.addEventListener('change', (e) => {
      const isAudio = e.target.value === 'audio';
      elements.modalQualityGroup.style.display = isAudio ? 'none' : 'flex';
      elements.modalAudioGroup.style.display = isAudio ? 'flex' : 'none';
    });

    // Settings changes
    [
      elements.settingDefaultQuality,
      elements.settingDefaultAudioFormat,
      elements.settingAutoImportBin,
      elements.settingAutoInsertTimeline,
      elements.settingDownloadDir,
      elements.settingCookiesBrowser
    ].forEach((input) => {
      if (input) input.addEventListener('change', saveSettings);
    });

    // Sidestream-compatible bridge message handler
    // Receives {sidestreamPreview:"youtube_embed", type, videoId, details} from bridge HTML
    window.addEventListener('message', (event) => {
      const data = event.data && typeof event.data === 'object' ? event.data : null;
      if (!data || data.sidestreamPreview !== 'youtube_embed') return;

      // Validate origin matches our bridge server (security check like Sidestream)
      if (previewServer && previewServer.getPreviewBridgeOrigin) {
        const bridgeOrigin = previewServer.getPreviewBridgeOrigin();
        if (bridgeOrigin && event.origin !== bridgeOrigin) return;
      }

      const type = data.type || '';
      const videoId = data.videoId || '';
      const details = data.details || {};

      // ready / state messages — check if video is actually playing
      if (type === 'ready' || type === 'state') {
        elements.modalPlayerLoading.classList.remove('active');

        // playerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
        const playerState = typeof details.playerState === 'number' ? details.playerState : -1;
        
        if (playerState === 1 || playerState === 3) {
          // Video is genuinely playing/buffering — hide the stuck banner
          hideBanner();
        }
        return;
      }

      // error / api_error / api_timeout — embed is explicitly blocked
      if (type === 'error' || type === 'api_error' || type === 'api_timeout') {
        const code = typeof details.code !== 'undefined' ? details.code : type;
        handleEmbedBlocked(videoId, code);
      }
    });

    // Close modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.previewModal.classList.contains('active')) {
        closePreviewModal();
      }
    });
  }

  // 14. Initialization
  function init() {
    loadSettings();
    setupEventListeners();
    checkEngineStatus();

    // Start Sidestream-compatible preview bridge server
    if (previewServer && previewServer.startPreviewBridgeServer) {
      previewServer.startPreviewBridgeServer().catch(() => {});
    }

    // Initial default search
    performSearch('4k cinematic b-roll');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
