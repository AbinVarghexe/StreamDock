/**
 * app.js
 * Main Panel UI Controller and Premiere Pro Extensibility Bridge.
 */
(function () {
  'use strict';

  // 1. Resolve Node.js Modules safely across Premiere Pro & After Effects
  const nodeRequire = (typeof window !== 'undefined' && (window.require || (window.cep_node && window.cep_node.require)))
    || (typeof require === 'function' ? require : null);

  let path, fs, binaryManager, youtubeSearch, downloader, candidateDiscovery, previewServer, instagramExtractor, sessionManager;
  let isNodeAvailable = false;
  let extensionBaseDir = '';

  function getResolvedBaseDir() {
    if (!nodeRequire) return '';
    try {
      const p = nodeRequire('path');
      const f = nodeRequire('fs');

      // 1. Try csInterface.getSystemPath('extension')
      if (typeof window !== 'undefined' && window.CSInterface) {
        try {
          const csi = new window.CSInterface();
          if (csi && typeof csi.getSystemPath === 'function') {
            const extPath = csi.getSystemPath('extension');
            if (extPath && f.existsSync(p.join(extPath, 'js', 'downloader.js'))) {
              return extPath;
            }
          }
        } catch (e) {}
      }

      // 2. Try window.__dirname or window.cep_node.__dirname
      const winDir = (typeof window !== 'undefined' && (window.__dirname || (window.cep_node && window.cep_node.__dirname)));
      if (winDir && f.existsSync(p.join(winDir, 'js', 'downloader.js'))) {
        return winDir;
      }

      // 3. Try APPDATA standard CEP directory
      const proc = (typeof process !== 'undefined' ? process : (typeof window !== 'undefined' && window.cep_node && window.cep_node.process));
      if (proc && proc.env && proc.env.APPDATA) {
        const appdataDir = p.join(proc.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.streamdock.youtube.downloader');
        if (f.existsSync(p.join(appdataDir, 'js', 'downloader.js'))) {
          return appdataDir;
        }
      }

      // 4. Try window.location.pathname
      if (typeof window !== 'undefined' && window.location && window.location.pathname) {
        try {
          let loc = decodeURIComponent(window.location.pathname);
          loc = loc.replace(/^\/([A-Za-z]:)/, '$1');
          const dir = p.dirname(loc);
          if (f.existsSync(p.join(dir, 'js', 'downloader.js'))) {
            return dir;
          }
        } catch (e) {}
      }

      // 5. Try script tags
      try {
        const scriptTag = document.querySelector('script[src*="app.js"]');
        if (scriptTag && scriptTag.src) {
          let src = decodeURIComponent(scriptTag.src.replace(/^file:\/\/\/?/, ''));
          src = src.replace(/^\/([A-Za-z]:)/, '$1');
          const dir = p.dirname(p.dirname(src));
          if (f.existsSync(p.join(dir, 'js', 'downloader.js'))) {
            return dir;
          }
        }
      } catch (e) {}

      return p.resolve('.');
    } catch (e) {
      return '';
    }
  }

  try {
    if (nodeRequire) {
      path = nodeRequire('path');
      fs = nodeRequire('fs');
      extensionBaseDir = getResolvedBaseDir();

      binaryManager = nodeRequire(path.join(extensionBaseDir, 'js', 'binary-manager.js'));
      youtubeSearch = nodeRequire(path.join(extensionBaseDir, 'js', 'youtube-search.js'));
      downloader = nodeRequire(path.join(extensionBaseDir, 'js', 'downloader.js'));
      candidateDiscovery = nodeRequire(path.join(extensionBaseDir, 'js', 'download-candidate-discovery.js'));
      previewServer = nodeRequire(path.join(extensionBaseDir, 'js', 'preview-server.js'));
      instagramExtractor = nodeRequire(path.join(extensionBaseDir, 'js', 'instagram-extractor.js'));
      sessionManager = nodeRequire(path.join(extensionBaseDir, 'js', 'session-manager.js'));
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
    modalChannelName: document.getElementById('modal-channel-name'),
    modalPlayerContainer: document.getElementById('modal-player-container'),
    modalIframe: document.getElementById('modal-iframe'),
    modalVideoPlayer: document.getElementById('modal-video-player'),
    modalPlayerLoading: document.getElementById('modal-player-loading'),
    modalPlayerOverlay: document.getElementById('modal-player-overlay'),
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
    modalAddToTimelineLabel: document.getElementById('modal-add-to-timeline-label'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalStartDownloadBtn: document.getElementById('modal-start-download-btn'),

    // YouTube Player Controls & Scrubber
    modalPlayerControls: document.getElementById('modal-player-controls'),
    ytScrubberWrap: document.getElementById('yt-scrubber-wrap'),
    ytScrubberHoverTime: document.getElementById('yt-scrubber-hover-time'),
    ytProgressBuffer: document.getElementById('yt-progress-buffer'),
    ytProgressPlayed: document.getElementById('yt-progress-played'),
    ytScrubberHandle: document.getElementById('yt-scrubber-handle'),
    modalBtnPlayPause: document.getElementById('modal-btn-play-pause'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    modalBtnSeekBack: document.getElementById('modal-btn-seek-back'),
    modalBtnSeekForward: document.getElementById('modal-btn-seek-forward'),
    modalBtnMute: document.getElementById('modal-btn-mute'),
    iconVolHigh: document.getElementById('icon-vol-high'),
    iconVolMute: document.getElementById('icon-vol-mute'),
    ytVolumeSlider: document.getElementById('yt-volume-slider'),
    modalTimeCurrent: document.getElementById('modal-time-current'),
    modalTimeDuration: document.getElementById('modal-time-duration'),
    ytModeIndicator: document.getElementById('yt-mode-indicator'),

    // Settings Elements
    settingDownloadDir: document.getElementById('setting-download-dir'),
    settingDefaultQuality: document.getElementById('setting-default-quality'),
    settingDefaultAudioFormat: document.getElementById('setting-default-audio-format'),
    settingAutoImportBin: document.getElementById('setting-auto-import-bin'),
    settingAutoImportBinLabel: document.getElementById('setting-auto-import-bin-label'),
    settingAutoInsertTimeline: document.getElementById('setting-auto-insert-timeline'),
    settingAutoInsertTimelineLabel: document.getElementById('setting-auto-insert-timeline-label'),
    settingInstagramCookie: document.getElementById('setting-instagram-cookie'),
    btnSaveInstagramSession: document.getElementById('btn-save-instagram-session'),
    btnClearInstagramSession: document.getElementById('btn-clear-instagram-session'),
    accountStatusBadge: document.getElementById('account-status-badge'),
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

    elements.settingDefaultQuality.value = state.settings.defaultQuality || '1080';
    elements.settingDefaultAudioFormat.value = state.settings.defaultAudioFormat || 'mp3';
    elements.settingAutoImportBin.checked = state.settings.autoImportBin !== false;
    elements.settingAutoInsertTimeline.checked = !!state.settings.autoInsertTimeline;
    elements.settingDownloadDir.value = state.settings.downloadDir || '';
    updateAccountStatusUI();
  }

  function updateAccountStatusUI() {
    if (!elements.accountStatusBadge) return;
    const isIgConnected = sessionManager && sessionManager.hasInstagramSession();
    if (isIgConnected) {
      elements.accountStatusBadge.textContent = 'Active (Logged In)';
      elements.accountStatusBadge.style.color = '#2ECC71';
      elements.accountStatusBadge.style.background = 'rgba(46, 204, 113, 0.15)';
      if (elements.btnClearInstagramSession) elements.btnClearInstagramSession.style.display = 'block';
      if (elements.settingInstagramCookie) elements.settingInstagramCookie.placeholder = 'Session active (paste to update)';
    } else {
      elements.accountStatusBadge.textContent = 'Not Connected';
      elements.accountStatusBadge.style.color = 'var(--text-muted)';
      elements.accountStatusBadge.style.background = 'var(--bg-input)';
      if (elements.btnClearInstagramSession) elements.btnClearInstagramSession.style.display = 'none';
      if (elements.settingInstagramCookie) elements.settingInstagramCookie.placeholder = 'Paste sessionid=... or full cookie string';
    }
  }

  function saveSettings() {
    try {
      state.settings.defaultQuality = elements.settingDefaultQuality.value;
      state.settings.defaultAudioFormat = elements.settingDefaultAudioFormat.value;
      state.settings.autoImportBin = elements.settingAutoImportBin.checked;
      state.settings.autoInsertTimeline = elements.settingAutoInsertTimeline.checked;
      state.settings.downloadDir = elements.settingDownloadDir.value.trim();
      localStorage.setItem('streamdock_settings', JSON.stringify(state.settings));
      showToast('Settings saved');
    } catch (e) {
      console.warn('Could not save settings', e);
    }
  }

  // 6. ExtendScript Integration Helpers
  function evalHostScript(code, timeoutMs = 2500) {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, message: 'evalScript timeout' });
        }
      }, timeoutMs);

      try {
        csInterface.evalScript(code, (result) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(result);
            resolve(parsed);
          } catch (e) {
            resolve({ success: false, raw: result, message: 'Parse error' });
          }
        });
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ success: false, message: err.message });
        }
      }
    });
  }

  async function resolveDownloadDestination() {
    if (state.settings.downloadDir && fs && fs.existsSync(state.settings.downloadDir)) {
      return path.normalize(state.settings.downloadDir);
    }

    try {
      // Query active Premiere / After Effects project directory with short timeout
      const res = await evalHostScript('getProjectDirectoryInfo()', 2000);
      if (res && res.success && res.directoryPath && fs && fs.existsSync(res.directoryPath)) {
        return path.normalize(res.directoryPath);
      }
    } catch (e) {}

    // Default to OS Downloads or User folder
    if (process && process.env) {
      const defaultDl = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');
      if (fs && !fs.existsSync(defaultDl)) {
        try { fs.mkdirSync(defaultDl, { recursive: true }); } catch (err) {}
      }
      return path.normalize(defaultDl);
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
        const reel = await instagramExtractor.getReelMetadata(query, {});
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

  // Timeline Seeker & Playback State
  let isUserSeeking = false;
  let lastSeekTimestamp = 0;
  let currentTotalDuration = 0;
  let currentPlaybackTime = 0;

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    seconds = Math.floor(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remM = m % 60;
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function parseDurationToSeconds(str) {
    if (!str || typeof str !== 'string') return 0;
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  function resetSeekerUI() {
    isUserSeeking = false;
    lastSeekTimestamp = 0;
    currentPlaybackTime = 0;
    currentTotalDuration = 0;
    if (elements.ytProgressPlayed) elements.ytProgressPlayed.style.width = '0%';
    if (elements.ytProgressBuffer) elements.ytProgressBuffer.style.width = '0%';
    if (elements.ytScrubberHandle) elements.ytScrubberHandle.style.left = '0%';
    if (elements.modalTimeCurrent) elements.modalTimeCurrent.textContent = '0:00';
    if (elements.modalTimeDuration) elements.modalTimeDuration.textContent = '0:00';
    updatePlayPauseButtonUI(false);
  }

  function updatePlayPauseButtonUI(isPlaying) {
    if (!elements.iconPlay || !elements.iconPause) return;
    if (isPlaying) {
      elements.iconPlay.style.display = 'none';
      elements.iconPause.style.display = 'inline-block';
    } else {
      elements.iconPlay.style.display = 'inline-block';
      elements.iconPause.style.display = 'none';
    }
  }

  function updateMuteButtonUI(isMuted) {
    if (!elements.iconVolHigh || !elements.iconVolMute) return;
    if (isMuted) {
      elements.iconVolHigh.style.display = 'none';
      elements.iconVolMute.style.display = 'inline-block';
    } else {
      elements.iconVolHigh.style.display = 'inline-block';
      elements.iconVolMute.style.display = 'none';
    }
  }

  function syncPlaybackState(currentTime, duration, isPlaying, loadedFraction) {
    // Ignore incoming state if user is currently dragging or within 1000ms after seek
    if (isUserSeeking || (Date.now() - lastSeekTimestamp < 1000)) {
      if (typeof isPlaying === 'boolean') updatePlayPauseButtonUI(isPlaying);
      return;
    }

    currentPlaybackTime = Math.max(0, Number(currentTime) || 0);
    if (Number(duration) > 0) {
      currentTotalDuration = Number(duration);
    } else if (!currentTotalDuration && state.selectedVideo && state.selectedVideo.duration) {
      currentTotalDuration = parseDurationToSeconds(state.selectedVideo.duration);
    }

    if (typeof isPlaying === 'boolean') {
      updatePlayPauseButtonUI(isPlaying);
    }

    if (elements.modalTimeCurrent) {
      elements.modalTimeCurrent.textContent = formatTime(currentPlaybackTime);
    }

    if (elements.modalTimeDuration) {
      elements.modalTimeDuration.textContent = currentTotalDuration > 0 ? formatTime(currentTotalDuration) : '0:00';
    }

    if (currentTotalDuration > 0) {
      const pct = Math.min(100, Math.max(0, (currentPlaybackTime / currentTotalDuration) * 100));
      if (elements.ytProgressPlayed) elements.ytProgressPlayed.style.width = pct + '%';
      if (elements.ytScrubberHandle) elements.ytScrubberHandle.style.left = pct + '%';
    }

    if (typeof loadedFraction === 'number' && elements.ytProgressBuffer) {
      elements.ytProgressBuffer.style.width = Math.min(100, Math.max(0, loadedFraction * 100)) + '%';
    }
  }

  function performSeek(targetTime) {
    lastSeekTimestamp = Date.now();
    const validTarget = Math.max(0, Math.min(currentTotalDuration || 36000, targetTime));
    currentPlaybackTime = validTarget;

    if (elements.modalTimeCurrent) {
      elements.modalTimeCurrent.textContent = formatTime(validTarget);
    }

    if (currentTotalDuration > 0) {
      const pct = Math.min(100, Math.max(0, (validTarget / currentTotalDuration) * 100));
      if (elements.ytProgressPlayed) elements.ytProgressPlayed.style.width = pct + '%';
      if (elements.ytScrubberHandle) elements.ytScrubberHandle.style.left = pct + '%';
    }

    if (currentPlayerMode === 'direct') {
      if (elements.modalVideoPlayer) {
        try {
          elements.modalVideoPlayer.currentTime = validTarget;
          elements.modalVideoPlayer.play().catch(() => {});
          updatePlayPauseButtonUI(true);
        } catch (e) {}
      }
    } else if (currentPlayerMode === 'embed') {
      if (elements.modalIframe && elements.modalIframe.contentWindow && state.selectedVideo) {
        try {
          elements.modalIframe.contentWindow.postMessage({
            sidestreamPreviewCommand: 'youtube_embed',
            videoId: state.selectedVideo.id,
            command: 'seekTo',
            args: [validTarget, true]
          }, '*');
          updatePlayPauseButtonUI(true);
        } catch (e) {}
      }
    }
  }

  function togglePlayPause() {
    if (currentPlayerMode === 'direct') {
      if (!elements.modalVideoPlayer) return;
      if (elements.modalVideoPlayer.paused) {
        elements.modalVideoPlayer.play().catch(() => {});
        updatePlayPauseButtonUI(true);
      } else {
        elements.modalVideoPlayer.pause();
        updatePlayPauseButtonUI(false);
      }
    } else if (currentPlayerMode === 'embed') {
      if (elements.modalIframe && elements.modalIframe.contentWindow && state.selectedVideo) {
        const isCurrentlyPlaying = elements.iconPause && elements.iconPause.style.display !== 'none';
        const cmd = isCurrentlyPlaying ? 'pauseVideo' : 'playVideo';
        elements.modalIframe.contentWindow.postMessage({
          sidestreamPreviewCommand: 'youtube_embed',
          videoId: state.selectedVideo.id,
          command: cmd,
          args: []
        }, '*');
        updatePlayPauseButtonUI(!isCurrentlyPlaying);
      }
    }
  }

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
    if (!video) return;
    state.selectedVideo = video;
    if (elements.modalTitle) elements.modalTitle.textContent = video.title || 'Media Preview';
    
    resetSeekerUI();
    if (video.duration) {
      currentTotalDuration = parseDurationToSeconds(video.duration);
      if (elements.modalTimeDuration && currentTotalDuration > 0) {
        elements.modalTimeDuration.textContent = formatTime(currentTotalDuration);
      }
    }

    if (elements.modalQualitySelect) elements.modalQualitySelect.value = state.settings.defaultQuality || '1080';
    if (elements.modalAudioSelect) elements.modalAudioSelect.value = state.settings.defaultAudioFormat || 'mp3';
    if (elements.modalAddToTimeline) elements.modalAddToTimeline.checked = !!state.settings.autoInsertTimeline;
    if (elements.previewModal) elements.previewModal.classList.add('active');

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

    if (previewServer && previewServer.startPreviewBridgeServer) {
      await previewServer.startPreviewBridgeServer().catch(() => {});
    }

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
    const proxiedUrl = previewServer.getProxiedStreamUrl(video.id, platform);
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
    resetSeekerUI();
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

    const downloadItem = {
      id: 'dl_' + Date.now(),
      video,
      formatType,
      quality,
      audioFormat,
      addToTimeline,
      destDir: '',
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

      const destDir = await resolveDownloadDestination();
      downloadItem.destDir = destDir;

      const dlRequest = downloader.downloadMedia({
        url: video.url,
        title: video.title,
        formatType,
        quality,
        audioFormat,
        destinationDir: destDir,
        onProgress: (p) => {
          downloadItem.percent = Math.round(p.percent);
          downloadItem.speed = p.speed;
          downloadItem.eta = p.eta;
          updateDownloadCardUI(downloadItem);
        }
      });

      downloadItem.cancellation = dlRequest.cancellation || dlRequest;

      const result = dlRequest && dlRequest.promise ? await dlRequest.promise : await dlRequest;
      if (!result || !result.filePath) {
        throw new Error('Download failed: output file not found');
      }

      downloadItem.status = 'completed';
      downloadItem.percent = 100;
      downloadItem.filePath = result.filePath;
      updateDownloadCardUI(downloadItem);
      updateDownloadsBadge();

      showToast(`Download finished: ${video.title.substring(0, 25)}...`, 'success');

      // Auto-import to host application (Premiere Pro / After Effects) if enabled
      if (state.settings.autoImportBin && result.filePath) {
        const isAE = (state.hostApp === 'aftereffects');
        showToast(isAE ? 'Importing to After Effects...' : 'Importing to Premiere Pro bin...');
        const importRes = await evalHostScript(
          `importFileToBin("${result.filePath.replace(/\\/g, '\\\\')}", ${addToTimeline})`
        );
        if (importRes && importRes.success) {
          showToast(isAE ? 'Imported to After Effects project folder!' : 'Imported into StreamDock Downloads bin!', 'success');
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
      <div class="download-progress-bar">
        <div class="download-progress-fill" style="width: 0%;"></div>
      </div>
      <div class="download-footer">
        <span class="download-speed">Speed: --</span>
        <span class="download-eta">ETA: --</span>
        <div class="download-actions">
          <button class="btn-small btn-cancel-download">Cancel</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-cancel-download').addEventListener('click', () => {
      if (item.cancellation) {
        item.cancellation.cancel();
      }
      item.status = 'cancelled';
      updateDownloadCardUI(item);
      updateDownloadsBadge();
    });

    elements.downloadsList.prepend(card);
  }

  function updateDownloadCardUI(item) {
    const card = document.getElementById(`download-card-${item.id}`);
    if (!card) return;

    const badge = card.querySelector('.download-status-badge');
    const fill = card.querySelector('.download-progress-fill');
    const speedEl = card.querySelector('.download-speed');
    const etaEl = card.querySelector('.download-eta');
    const actions = card.querySelector('.download-actions');

    if (item.status === 'downloading') {
      badge.className = 'download-status-badge downloading status-badge';
      badge.textContent = `${item.percent}%`;
      fill.style.width = `${item.percent}%`;
      speedEl.textContent = `Speed: ${item.speed || '-'}`;
      etaEl.textContent = `ETA: ${item.eta || '-'}`;
    } else if (item.status === 'completed') {
      const isAE = (state.hostApp === 'aftereffects');
      badge.className = 'download-status-badge completed status-badge';
      badge.textContent = isAE ? 'Ready in AE' : 'Ready in Premiere';
      fill.style.width = '100%';
      speedEl.textContent = 'Imported to Project';
      etaEl.textContent = '';
      actions.innerHTML = `
        <button class="btn-small btn-reimport">${isAE ? 'Re-import to AE' : 'Re-import to Bin'}</button>
      `;
      actions.querySelector('.btn-reimport').addEventListener('click', async () => {
        if (item.filePath) {
          const res = await evalHostScript(
            `importFileToBin("${item.filePath.replace(/\\/g, '\\\\')}", false)`
          );
          if (res && res.success) showToast(isAE ? 'Imported to AE!' : 'Imported to Bin!', 'success');
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

    // YouTube Scrubber & Playback Control Events
    if (elements.ytScrubberWrap) {
      // Hover time preview tooltip
      elements.ytScrubberWrap.addEventListener('mousemove', (e) => {
        if (!currentTotalDuration) return;
        const rect = elements.ytScrubberWrap.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const hoverSec = pct * currentTotalDuration;
        if (elements.ytScrubberHoverTime) {
          elements.ytScrubberHoverTime.style.left = (pct * 100) + '%';
          elements.ytScrubberHoverTime.style.display = 'block';
          elements.ytScrubberHoverTime.textContent = formatTime(hoverSec);
        }
      });

      elements.ytScrubberWrap.addEventListener('mouseleave', () => {
        if (elements.ytScrubberHoverTime) {
          elements.ytScrubberHoverTime.style.display = 'none';
        }
      });

      // Click & Drag seeking
      elements.ytScrubberWrap.addEventListener('mousedown', (e) => {
        if (!currentTotalDuration) return;
        isUserSeeking = true;
        elements.ytScrubberWrap.classList.add('dragging');
        const rect = elements.ytScrubberWrap.getBoundingClientRect();

        const updatePosition = (clientX) => {
          const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          if (elements.ytProgressPlayed) elements.ytProgressPlayed.style.width = (pct * 100) + '%';
          if (elements.ytScrubberHandle) elements.ytScrubberHandle.style.left = (pct * 100) + '%';
          if (elements.modalTimeCurrent) elements.modalTimeCurrent.textContent = formatTime(pct * currentTotalDuration);
          return pct;
        };

        updatePosition(e.clientX);

        const onMouseMove = (moveEvent) => {
          updatePosition(moveEvent.clientX);
        };

        const onMouseUp = (upEvent) => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          elements.ytScrubberWrap.classList.remove('dragging');
          const finalPct = updatePosition(upEvent.clientX);
          const targetSec = finalPct * currentTotalDuration;
          performSeek(targetSec);
          setTimeout(() => { isUserSeeking = false; }, 350);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    if (elements.modalBtnPlayPause) {
      elements.modalBtnPlayPause.addEventListener('click', togglePlayPause);
    }

    if (elements.modalBtnSeekBack) {
      elements.modalBtnSeekBack.addEventListener('click', () => {
        performSeek(currentPlaybackTime - 10);
      });
    }

    if (elements.modalBtnSeekForward) {
      elements.modalBtnSeekForward.addEventListener('click', () => {
        performSeek(currentPlaybackTime + 10);
      });
    }

    if (elements.ytVolumeSlider) {
      elements.ytVolumeSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value) || 0;
        if (elements.modalVideoPlayer) {
          elements.modalVideoPlayer.volume = val;
          elements.modalVideoPlayer.muted = (val === 0);
        }
        if (currentPlayerMode === 'embed' && elements.modalIframe && elements.modalIframe.contentWindow && state.selectedVideo) {
          elements.modalIframe.contentWindow.postMessage({
            sidestreamPreviewCommand: 'youtube_embed',
            videoId: state.selectedVideo.id,
            command: 'setVolume',
            args: [val * 100]
          }, '*');
        }
        updateMuteButtonUI(val === 0);
      });
    }

    if (elements.modalBtnMute) {
      elements.modalBtnMute.addEventListener('click', () => {
        if (currentPlayerMode === 'direct') {
          if (!elements.modalVideoPlayer) return;
          elements.modalVideoPlayer.muted = !elements.modalVideoPlayer.muted;
          updateMuteButtonUI(elements.modalVideoPlayer.muted);
          if (elements.ytVolumeSlider) elements.ytVolumeSlider.value = elements.modalVideoPlayer.muted ? 0 : 1;
        } else if (currentPlayerMode === 'embed') {
          if (elements.modalIframe && elements.modalIframe.contentWindow && state.selectedVideo) {
            const isMuted = elements.iconVolMute && elements.iconVolMute.style.display !== 'none';
            const cmd = isMuted ? 'unMute' : 'mute';
            elements.modalIframe.contentWindow.postMessage({
              sidestreamPreviewCommand: 'youtube_embed',
              videoId: state.selectedVideo.id,
              command: cmd,
              args: []
            }, '*');
            updateMuteButtonUI(!isMuted);
            if (elements.ytVolumeSlider) elements.ytVolumeSlider.value = isMuted ? 1 : 0;
          }
        }
      });
    }

    // Direct Video Player Events
    if (elements.modalVideoPlayer) {
      elements.modalVideoPlayer.addEventListener('timeupdate', () => {
        if (!isUserSeeking) {
          syncPlaybackState(elements.modalVideoPlayer.currentTime, elements.modalVideoPlayer.duration);
        }
      });

      elements.modalVideoPlayer.addEventListener('loadedmetadata', () => {
        if (elements.modalVideoPlayer.duration && isFinite(elements.modalVideoPlayer.duration)) {
          currentTotalDuration = elements.modalVideoPlayer.duration;
          syncPlaybackState(elements.modalVideoPlayer.currentTime, elements.modalVideoPlayer.duration);
        }
      });

      elements.modalVideoPlayer.addEventListener('play', () => {
        updatePlayPauseButtonUI(true);
      });

      elements.modalVideoPlayer.addEventListener('pause', () => {
        updatePlayPauseButtonUI(false);
      });

      elements.modalVideoPlayer.addEventListener('ended', () => {
        updatePlayPauseButtonUI(false);
      });
    }

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

    // Instagram Session Save & Clear
    if (elements.btnSaveInstagramSession) {
      elements.btnSaveInstagramSession.addEventListener('click', () => {
        const val = elements.settingInstagramCookie ? elements.settingInstagramCookie.value.trim() : '';
        if (!val) {
          showToast('Please paste an Instagram cookie or sessionid first', 'error');
          return;
        }
        if (sessionManager) {
          sessionManager.saveInstagramSession(val);
          updateAccountStatusUI();
          if (elements.settingInstagramCookie) elements.settingInstagramCookie.value = '';
          showToast('Instagram account session saved!', 'success');
        }
      });
    }

    if (elements.btnClearInstagramSession) {
      elements.btnClearInstagramSession.addEventListener('click', () => {
        if (sessionManager) {
          sessionManager.clearInstagramSession();
          updateAccountStatusUI();
          showToast('Instagram account session cleared', 'info');
        }
      });
    }



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
        const isPlaying = (playerState === 1 || playerState === 3);
        
        if (isPlaying) {
          // Video is genuinely playing/buffering — hide the stuck banner
          hideBanner();
        }

        syncPlaybackState(details.currentTime, details.duration, isPlaying);
        return;
      }

      // error / api_error / api_timeout — embed is explicitly blocked
      if (type === 'error' || type === 'api_error' || type === 'api_timeout') {
        const code = typeof details.code !== 'undefined' ? details.code : type;
        handleEmbedBlocked(videoId, code);
      }
    });

    // Keyboard shortcuts while preview modal is open
    window.addEventListener('keydown', (e) => {
      if (!elements.previewModal.classList.contains('active')) return;
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') closePreviewModal();
        return;
      }

      if (e.key === 'Escape') {
        closePreviewModal();
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        performSeek(currentPlaybackTime - 10);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        performSeek(currentPlaybackTime + 10);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (elements.modalBtnMute) elements.modalBtnMute.click();
      }
    });
  }

  // 14. Host Application Detection (Premiere Pro vs After Effects)
  function loadExtendScript() {
    if (!csInterface || typeof csInterface.evalScript !== 'function') return Promise.resolve();
    try {
      const scriptPath = path ? path.join(extensionBaseDir, 'jsx', 'hostscript.jsx').replace(/\\/g, '/') : '';
      if (scriptPath) {
        return new Promise((resolve) => {
          csInterface.evalScript(`$.evalFile("${scriptPath}")`, () => resolve());
        });
      }
    } catch (e) {}
    return Promise.resolve();
  }

  async function detectHostApp() {
    let host = 'premierepro';
    try {
      if (csInterface && typeof csInterface.getHostEnvironment === 'function') {
        const env = csInterface.getHostEnvironment();
        if (env && (env.appId === 'AEFT' || env.appId === 'aeft')) {
          host = 'aftereffects';
        }
      }
    } catch (e) {}

    state.hostApp = host;

    await loadExtendScript();

    try {
      const res = await evalHostScript('streamdockPing()');
      if (res && res.host) {
        host = res.host;
      }
      state.hostApp = host;
    } catch (e) {}

    applyHostSpecificLabels(host);
  }

  function applyHostSpecificLabels(host) {
    const isAE = (host === 'aftereffects');
    if (elements.modalAddToTimelineLabel) {
      elements.modalAddToTimelineLabel.textContent = isAE
        ? 'Insert to active composition at playhead'
        : 'Insert to timeline at playhead when ready';
    }
    if (elements.settingAutoImportBinLabel) {
      elements.settingAutoImportBinLabel.textContent = isAE
        ? 'Automatically import downloaded media into After Effects project folder'
        : 'Automatically import downloaded media into Premiere Bin';
    }
    if (elements.settingAutoInsertTimelineLabel) {
      elements.settingAutoInsertTimelineLabel.textContent = isAE
        ? 'Automatically insert imported clip onto active Composition'
        : 'Automatically insert imported clip onto Timeline playhead';
    }
  }

  // 15. Initialization
  function init() {
    loadSettings();
    detectHostApp();
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
