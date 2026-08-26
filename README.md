<div align="center">

  <img src="assets/streamdock-banner.svg" alt="StreamDock for Adobe Premiere Pro" width="100%" />

  <br/><br/>

  [![Adobe Premiere Pro](https://img.shields.io/badge/Adobe%20Premiere%20Pro-CC%202020--2026%2B-9999FF?style=for-the-badge&logo=adobepremierepro&logoColor=white)](https://www.adobe.com/products/premiere.html)
  [![CEP Version](https://img.shields.io/badge/Adobe%20CEP-10.0--17.0-FF0033?style=for-the-badge&logo=adobe&logoColor=white)](https://github.com/Adobe-CEP)
  [![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/AbinVarghexe/StreamDock)
  [![License](https://img.shields.io/badge/License-MIT-2ECC71?style=for-the-badge)](LICENSE)
  [![Release](https://img.shields.io/badge/Release-v2.0.0-E056FD?style=for-the-badge&logo=github)](https://github.com/AbinVarghexe/StreamDock/releases/tag/v2.0.0)

  <p align="center">
    <strong>The ultimate high-speed YouTube browser &amp; Instagram Reel downloader built natively for Adobe Premiere Pro.</strong>
  </p>

  <p align="center">
    <a href="#-proof-of-work--ui-showcase"><strong>📸 Showcase</strong></a> •
    <a href="#-whats-new-in-v200"><strong>🚀 What's New</strong></a> •
    <a href="#-quick-installation-for-users"><strong>⚡ 1-Click Install</strong></a> •
    <a href="#-features--capabilities"><strong>✨ Features</strong></a> •
    <a href="#-user-guide"><strong>📖 User Guide</strong></a> •
    <a href="#-architecture--pipeline"><strong>🏗️ Architecture</strong></a> •
    <a href="#-troubleshooting--faq"><strong>❓ FAQ</strong></a>
  </p>

</div>

---

## 📸 Proof of Work & UI Showcase

### 🎬 Live Adobe Premiere Pro Workspace

<div align="center">
  <img src="assets/streamdock-premiere-workspace.png" alt="StreamDock Running in Premiere Pro Workspace" width="100%" />
  <p><em>StreamDock panel docked inside Adobe Premiere Pro alongside the Program Monitor, Project Bins, and active Sequence Timeline.</em></p>
</div>

<br/>

### 📱 In-Panel Views & Engine Status

<div align="center">
  <table>
    <thead>
      <tr>
        <th align="center" width="33.33%">🔍 Search &amp; Discovery</th>
        <th align="center" width="33.33%">📥 Automated Downloads</th>
        <th align="center" width="33.33%">⚙️ Engine &amp; Binary Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td align="center" valign="top">
          <img src="assets/streamdock-search-view.png" alt="YouTube &amp; Instagram Media Search View" width="100%" />
          <br/><br/>
          <sub>InnerTube search, Instagram Reel paste, filter chips, video duration badges, and instant modal preview triggers</sub>
        </td>
        <td align="center" valign="top">
          <img src="assets/streamdock-downloads-view.png" alt="Active &amp; Completed Downloads" width="100%" />
          <br/><br/>
          <sub>Real-time progress bars, download speeds, ETA counters, "Ready in Premiere" indicators &amp; 1-click bin re-import</sub>
        </td>
        <td align="center" valign="top">
          <img src="assets/streamdock-settings-view.png" alt="Settings &amp; Binary Engine Status" width="100%" />
          <br/><br/>
          <sub>Custom download directory selector, default quality/audio preferences, Instagram account session manager &amp; engine health status</sub>
        </td>
      </tr>
    </tbody>
  </table>
</div>

---

## 🚀 What's New in v2.0.0

StreamDock 2.0 introduces first-class **Instagram Reels & Video** support alongside performance and stability upgrades:

- **📷 Instagram Reels & Posts**: Paste any Instagram Reel (`/reel/`, `/p/`, `/tv/`) to download Full HD MP4 video directly into Premiere Pro.
- **⚡ Direct CDN Streaming Engine**: Ultra-fast Instagram resolver that extracts high-bitrate MP4 streams directly from Instagram CDN with zero quality loss.
- **🎬 Dual Preview Player with Auto-Looping**: In-panel video player supports both standard YouTube embeds and native looping direct playback for vertical Instagram Reels.
- **🔐 Instagram Session Manager**: Dedicated session/cookie storage card in Settings to download age-restricted, high-traffic, or personal account Reels without browser DPAPI lock issues.
- **🛡️ Isolated Media Pipelines**: YouTube downloads operate directly through native `yt-dlp` without requiring cookies or third-party tokens, keeping both platforms fully independent and reliable.
- **🎯 Enhanced File Resolver**: Intelligent multi-stage media resolution that handles complex Unicode filenames, emojis, and non-ASCII titles seamlessly on Windows & macOS.

---

## 🌟 Overview

**StreamDock** eliminates the friction of switching between web browsers, sketchy ad-filled download sites, and operating system file explorers. It embeds a complete YouTube browsing, Instagram scraping, real-time previewing, format transcoding, and bin-importing engine directly inside your Premiere Pro workspace.

```
                      ┌────────────────────────────────────────────────────────┐
                      │                   Adobe Premiere Pro                   │
                      │                                                        │
   YouTube Search ───►│   ┌────────────────────────────────────────────────┐   │
   (InnerTube API)    │   │                   StreamDock                   │   │
                      │   │                 (CEP Extension)                │   │────► Active Timeline Track
   Instagram Reel ───►│   │  • Dual Preview Bridge (127.0.0.1)             │   │      (Auto-inserted at playhead)
   (Direct Resolver)  │   │  • Premiere Transcoder (H.264 AVC1 + AAC)      │   │
                      │   │  • ExtendScript Host Automation                │   │────► Project Bin
                      │   └────────────────────────────────────────────────┘   │      ("StreamDock Downloads")
                      └────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Installation (For Users)

### ⚡ 1-Click Automated Setup (Windows)

1. Download **[`StreamDock-v2.0.0-Premiere-Pro-Extension.zip`](https://github.com/AbinVarghexe/StreamDock/releases/download/v2.0.0/StreamDock-v2.0.0-Premiere-Pro-Extension.zip)** from GitHub Releases.
2. Extract the `.zip` file.
3. Double-click **`INSTALL.bat`** *(automatically enables Adobe CEP debug mode in Windows registry and deploys extension files)*.
4. Open (or restart) **Adobe Premiere Pro**.
5. Go to the top menu:
   ```text
   Window ➔ Extensions ➔ StreamDock
   ```

---

### 🍏 Manual Installation (macOS & Windows)

<details>
<summary><strong>Click to view manual installation steps</strong></summary>

#### Step 1: Copy Files to the Adobe CEP Extensions Folder
Place the `com.streamdock.youtube.downloader` folder into:

- **Windows**:
  ```text
  %APPDATA%\Adobe\CEP\extensions\com.streamdock.youtube.downloader
  ```
- **macOS**:
  ```text
  ~/Library/Application Support/Adobe/CEP/extensions/com.streamdock.youtube.downloader
  ```

#### Step 2: Enable Adobe PlayerDebugMode
- **Windows (PowerShell)**:
  ```powershell
  10..17 | ForEach-Object { reg add "HKCU\Software\Adobe\CSXS.$_" /v PlayerDebugMode /t REG_SZ /d 1 /f }
  ```
- **macOS (Terminal)**:
  ```bash
  for v in {10..17}; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
  ```

</details>

---

## ✨ Features & Capabilities

| Feature | Details | Benefit for Editors |
| :--- | :--- | :--- |
| **🔍 High-Speed InnerTube Search** | Direct YouTube client search without requiring Google Cloud API keys or rate quotas. | Zero configuration, instantaneous results, unlimited queries. |
| **📷 Instagram Reels & Posts** | Direct URL parsing for Instagram Reels, videos, and post carousels. | Seamlessly import social media content and reference clips. |
| **⚡ Dual Preview Engine** | Local HTTP reverse-proxy (`127.0.0.1:<port>`) combined with piped direct streaming. | Completely eliminates YouTube **Error 153** and embed blocks. |
| **🎞️ Premiere-Native Codecs** | Automatically selects and transcodes to **H.264 (AVC1)** video and **AAC (mp4a)** audio. | Never encounter Premiere's *"Unsupported compression type 'av01'"* error. |
| **🎵 Dedicated Audio Extraction** | 1-Click extraction to **MP3 (320kbps)**, **WAV**, or **AAC** formats. | Fast workflow for sound effects, foley, background music, and podcasts. |
| **🎯 Automated Timeline Placement** | ExtendScript JSX engine reads active sequence timecode and video/audio track targeting. | Media appears directly at your cursor/playhead automatically. |
| **📂 Smart Project Folder Sync** | Automatically saves downloads into the active Premiere `.prproj` root directory. | Keeps project assets organized without manual file copying. |
| **🔐 Instagram Session Manager** | In-panel session cookie storage to unlock age-restricted or private Instagram media. | No repetitive browser logins or DPAPI decryption errors. |
| **📦 Bundled Offline Binaries** | Self-contained `yt-dlp` and `FFmpeg` engines included in the package. | Ready to use immediately with zero terminal setup or dependencies. |

---

## 📖 User Guide

### 1. Searching YouTube
- Type any keyword in the search bar (e.g. `4k cinematic drone b-roll`, `whoosh sfx`, `lo-fi beats`) and press **Enter**.
- Use the quick preset chips below the search bar to immediately filter common asset categories.
- Click on any thumbnail card to open the **Preview & Download Modal**.

### 2. Downloading Instagram Reels
- Copy any Instagram link from your browser or mobile app:
  ```text
  https://www.instagram.com/reel/C8xxxxxxxx/
  ```
- Click the **`📷 Instagram Reel`** preset chip or paste the URL into the search bar.
- StreamDock will instantly fetch the Reel metadata, creator name, and thumbnail.
- Click **Start Download** — the high-definition MP4 will be saved and imported directly into Premiere Pro!

### 3. Preview Modal & Player Controls
- **Web Embed Mode**: Plays video directly using the embedded web player with full YouTube playback controls.
- **Direct MP4 Mode**: Uses StreamDock's local media bridge for direct video streaming. Useful for music videos or videos that restrict third-party web embeds.
- **Format Options**: Select **Video (MP4)** or **Audio Only (MP3/WAV/AAC)**.
- **Resolution Selector**: Choose from **Best Available**, **4K (2160p)**, **1440p**, **1080p Full HD**, or **720p HD**.
- **Insert into Active Timeline**: Check this box to automatically place the downloaded clip on your active sequence timeline at the current playhead position.

### 4. Settings & Preferences
- **Download Location**: Set to *Auto (Active Project Folder)* to keep downloads organized with each `.prproj` project, or select a custom folder on your system.
- **Default Quality & Audio Format**: Set your preferred default resolution and audio format to save time on every download.
- **Instagram Session**: If you frequently download from Instagram, paste your `sessionid` cookie value in Settings to authenticate once and download restricted content seamlessly.

---

## 🏗️ Architecture & Pipeline

<div align="center">
  <img src="assets/streamdock-workflow.svg" alt="StreamDock Architecture &amp; Workflow" width="100%" />
</div>

### System Layer Overview

1. **Frontend CEP Application (`index.html`, `css/main.css`, `js/app.js`)**:
   - Runs in Adobe's Chromium Embedded Framework (CEF) environment with integrated Node.js runtime.
   - Handles tab switching, responsive grid layouts, search debounce, download progress cards, and modal lifecycle.
2. **Search & Extraction Layer**:
   - **YouTube Search (`js/youtube-search.js`)**: Communicates with the InnerTube Web API to fetch titles, channel names, view counts, and high-res thumbnails.
   - **Instagram Extractor (`js/instagram-extractor.js`)**: Queries Instagram CDN endpoints to extract high-bitrate video streams and author metadata.
3. **Local Loopback Bridge (`js/preview-server.js`)**:
   - Automatically initializes a lightweight Node.js HTTP server on a dynamic port (`127.0.0.1:<port>`).
   - Serves an isolated HTML bridge document with cross-origin headers to prevent iframe origin blocking.
   - Pipes live `yt-dlp` video streams directly to the HTML5 `<video>` tag for embed-restricted media.
4. **Download & Transcoding Core (`js/downloader.js`, `js/download-candidate-selection.js`)**:
   - Builds Premiere-optimized format strings (`bv*[vcodec^=avc1]+ba[acodec^=mp4a]`).
   - Executes bundled `yt-dlp` and `FFmpeg` binaries with real-time stdout progress tracking.
   - Transcodes audio streams to MP3/WAV/AAC and recodes incompatible video streams to standard H.264.
5. **ExtendScript Host Bridge (`jsx/hostscript.jsx`)**:
   - Bridges Node.js with Premiere Pro's C++ ExtendScript engine via `CSInterface.evalScript()`.
   - Resolves active project paths, creates `StreamDock Downloads` bin, imports media files, and inserts clips at sequence playhead.

---

## 📁 Repository Structure

```text
StreamDock/
├── CSXS/
│   └── manifest.xml                     # Extension manifest, permissions & Premiere host target
├── assets/
│   ├── streamdock-banner.svg            # Hero banner illustration
│   ├── streamdock-workflow.svg          # System architecture flowchart
│   ├── streamdock-premiere-workspace.png # Live Premiere Pro workspace screenshot
│   ├── streamdock-search-view.png       # Search panel view screenshot
│   ├── streamdock-downloads-view.png    # Downloads panel view screenshot
│   └── streamdock-settings-view.png     # Settings & engine status screenshot
├── binaries/
│   ├── release.json                     # Media engine version metadata
│   ├── yt-dlp.exe                       # Bundled yt-dlp binary (Windows)
│   └── ffmpeg.exe                       # Bundled FFmpeg transcoder (Windows)
├── css/
│   └── main.css                         # Dark/Light theme styles matching Adobe CEP UI
├── js/
│   ├── app.js                           # Application lifecycle & view controller
│   ├── binary-manager.js                # Detection & validation of yt-dlp/ffmpeg
│   ├── download-candidate-selection.js  # Format prioritization & Premiere codec rules
│   ├── downloader.js                    # Download orchestration & progress reporter
│   ├── instagram-extractor.js           # Instagram Reels/Posts parser & metadata engine
│   ├── preview-server.js                # Loopback HTTP server & direct MP4 stream proxy
│   ├── session-manager.js               # Persistent Netscape cookies & account auth engine
│   └── youtube-search.js                # High-speed InnerTube API client
├── jsx/
│   └── hostscript.jsx                   # ExtendScript host bridge for Project Bin & Timeline
├── lib/
│   └── CSInterface.js                   # Adobe CEP communication SDK
├── scripts/
│   ├── download-binaries.js             # Utility to fetch fresh binary media engines
│   ├── install-staged-extension.js      # Local developer deployment script
│   └── package-extension.js             # 1-click installer & zip release bundler
├── .debug                               # Chrome DevTools remote debug configuration
├── index.html                           # Main extension UI layout
├── package.json                         # Project dependencies and script runner
└── README.md                            # Complete documentation
```

---

## 🛠️ Developer Setup & Commands

If you want to modify or contribute to StreamDock:

```bash
# 1. Clone the repository
git clone https://github.com/AbinVarghexe/StreamDock.git
cd StreamDock

# 2. Download latest binary engines (yt-dlp and ffmpeg)
npm run download:binaries

# 3. Deploy extension locally to your Adobe CEP folder
npm run deploy

# 4. Build distribution package (.zip + INSTALL.bat)
npm run package
```

### Remote Debugging in Chrome
StreamDock includes `.debug` port configuration:
1. Open Premiere Pro with StreamDock open.
2. Open Google Chrome and navigate to: `http://localhost:8088`.
3. You will have access to full Chrome DevTools (Console, Elements, Network, Sources) inside the running CEP panel.

---

## ❓ Troubleshooting & FAQ

<details>
<summary><strong>Q: Why does a YouTube video preview say "Error 153"?</strong></summary>

> **Answer**: Error 153 occurs when YouTube blocks embed requests originating from `file://` protocols. StreamDock automatically resolves this by serving previews through its local loopback server (`http://127.0.0.1:<port>`) with strict cross-origin referrer headers.
</details>

<details>
<summary><strong>Q: What if a video is blocked from web embedding?</strong></summary>

> **Answer**: If a music video or copyright-protected video cannot be embedded, StreamDock provides a **`▶ yt-dlp Stream`** button in the preview header that pipes the stream directly through its local media proxy.
</details>

<details>
<summary><strong>Q: Can I download Instagram Reels without logging in?</strong></summary>

> **Answer**: Yes! Public Instagram Reels and posts download directly via the high-speed CDN resolver without any login required. For private accounts or age-restricted content, you can optionally save your session in Settings.
</details>

<details>
<summary><strong>Q: Where are downloaded files saved on my hard drive?</strong></summary>

> **Answer**: By default, StreamDock dynamically detects the active Premiere Pro project (`.prproj`) and saves media into a subfolder right next to your project file. You can also specify a fixed download folder in the **Settings** tab.
</details>

<details>
<summary><strong>Q: How do I update yt-dlp to the latest version?</strong></summary>

> **Answer**: StreamDock comes with modern binaries bundled. Developers can run `npm run download:binaries` at any time to automatically fetch the newest releases of `yt-dlp` and `FFmpeg`.
</details>

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ❤️ for video editors, motion designers, and content creators worldwide.</sub>
</div>
