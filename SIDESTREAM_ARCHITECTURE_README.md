# Sidestream Adobe Premiere Pro CEP Extension - Complete Architecture Breakdown

This document provides a comprehensive breakdown of the Sidestream plugin architecture to help you build a similar CEP (Common Extensibility Platform) extension for Adobe Premiere Pro.

---

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Directory Structure](#directory-structure)
3. [Core Technologies](#core-technologies)
4. [Manifest & Configuration](#manifest--configuration)
5. [Panel UI (HTML/CSS/JS)](#panel-ui-htmlcssjs)
6. [Host Script (JSX/ExtendScript)](#host-script-jsxextendscript)
7. [Node.js Runtime Integration](#nodejs-runtime-integration)
8. [Binary Management (yt-dlp, ffmpeg, Deno, Python)](#binary-management)
9. [Download Engine](#download-engine)
10. [YouTube Integration](#youtube-integration)
11. [Installation System (Windows NSIS + PowerShell)](#installation-system-windows-nsis--powershell)
12. [Build & Packaging Pipeline](#build--packaging-pipeline)
13. [Step-by-Step: Building Your Own Plugin](#step-by-step-building-your-own-plugin)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ADOBE PREMIERE PRO                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CEPHtmlEngine (Chromium)                     │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │                  Sidestream Panel (HTML/JS)               │  │   │
│  │  │  • index.html - Main UI (search, preview, settings)      │  │   │
│  │  │  • app.js - Panel controller (5000+ lines)               │  │   │
│  │  │  • CSS - Dark/light themed responsive UI                 │  │   │
│  │  │  • lib/CSInterface.js - CEP bridge                        │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  │                              │                                  │   │
│  │                              ▼                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │              Node.js Runtime (--enable-nodejs)           │  │   │
│  │  │  • downloader.js - Core download logic                   │  │   │
│  │  │  • binary-manager.js - Runtime binary management         │  │   │
│  │  │  • download-candidate-discovery.js - Quality selection   │  │   │
│  │  │  • download-candidate-selection.js - Format picking      │  │   │
│  │  │  • cookie-jar.js - Browser cookie handling               │  │   │
│  │  │  • updater.js - Auto-update checks                       │  │   │
│  │  │  • logger.js - Structured logging                        │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  ExtendScript Host (JSX)                        │   │
│  │  • hostscript.jsx - Premiere Pro API bridge                     │   │
│  │  • Project/Sequence/Import operations                           │   │
│  │  • Playback state capture/resume                                │   │
│  │  • Bin management (Sidestream Downloads bin)                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BUNDLED BINARIES (Local)                           │
│  • yt-dlp (video extraction)           • ffmpeg/ffprobe (transcoding)  │
│  • Deno (JavaScript runtime)           • Python (for yt-dlp zipapp)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
Sidestream/                           # Extension root (installed to CEP/extensions)
├── CSXS/
│   └── manifest.xml                  # Extension manifest (required)
├── index.html                        # Main panel HTML entry point
├── package.json                      # Build config & metadata
├── css/
│   ├── main.css                      # Primary styles (72KB, dark/light theme)
│   └── paid-onboarding.css           # Premium flow styles
├── js/
│   ├── app.js                        # Main panel controller (533KB)
│   ├── downloader.js                 # Download engine (244KB)
│   ├── binary-manager.js             # Binary versioning & paths
│   ├── download-candidate-discovery.js
│   ├── download-candidate-selection.js
│   ├── cookie-jar.js                 # Browser cookie extraction
│   ├── updater.js                    # Update checking
│   ├── logger.js                     # Logging + crash reporting
│   ├── anonymous-acquisition-claim.js
│   ├── paid-onboarding-controller.js
│   └── paid-onboarding-view.js
├── jsx/
│   └── hostscript.jsx                # ExtendScript host bridge
├── lib/
│   └── CSInterface.js                # CEP JavaScript API wrapper
└── binaries/                         # Platform-specific binaries
    ├── release.json                  # Binary manifest (versions, SHA256)
    ├── yt-dlp                        # Linux/macOS
    ├── yt-dlp.exe                    # Windows
    ├── ffmpeg/
    │   ├── darwin-arm64/ffmpeg, ffprobe
    │   ├── darwin-x64/ffmpeg, ffprobe
    │   └── win32-x64/ffmpeg.exe, ffprobe.exe
    ├── deno/
    │   ├── darwin-arm64/deno
    │   └── darwin-x64/deno
    └── python/
        ├── darwin-arm64/bin/python3.13
        └── darwin-x64/bin/python3.13
```

---

## Core Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Panel UI** | HTML5, CSS3 (Custom Properties), Vanilla JS (ES6+) | Modern responsive panel |
| **CEP Bridge** | CSInterface.js + `__adobe_cep__` global | Panel ↔ Premiere communication |
| **Host Script** | ExtendScript (JSX) | Premiere Pro DOM API access |
| **Node.js** | Embedded in CEP (`--enable-nodejs --mixed-context`) | Heavy lifting: downloads, binaries |
| **Video Extraction** | yt-dlp (Python/standalone) | YouTube & 1000+ site support |
| **Transcoding** | ffmpeg/ffprobe (static builds) | Format conversion for Premiere |
| **JS Runtime** | Deno (bundled) | yt-dlp's JavaScript extractor support |
| **Installer** | NSIS (Windows) + PowerShell helpers | System-level installation |
| **Packaging** | ZXP (CEP package format) | Adobe Extension Manager distribution |

---

## Manifest & Configuration

### CSXS/manifest.xml (Critical)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="10.0"
  ExtensionBundleId="com.yourcompany.yourplugin"
  ExtensionBundleVersion="1.0.0"
  ExtensionBundleName="Your Plugin Name"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="com.yourcompany.yourplugin.panel" Version="1.0.0" />
  </ExtensionList>

  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[14.0,99.9]" />  <!-- Premiere Pro 14+ -->
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="10.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>

  <DispatchInfoList>
    <Extension Id="com.yourcompany.yourplugin.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/hostscript.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>      <!-- Enable Node.js -->
            <Parameter>--mixed-context</Parameter>       <!-- Mixed JS context -->
            <Parameter>--allow-file-access</Parameter>   <!-- File system access -->
            <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>              <!-- Auto-show panel -->
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>Your Plugin Name</Menu>                <!-- Window > Extensions menu -->
          <Geometry>
            <Size><Width>360</Width><Height>520</Height></Size>
            <MinSize><Width>320</Width><Height>420</Height></MinSize>
            <MaxSize><Width>1600</Width><Height>1080</Height></MaxSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

**Key Manifest Settings:**
- `ExtensionBundleId`: Unique identifier (reverse domain)
- `Host Name="PPRO"`: Targets Premiere Pro
- `CEFCommandLine --enable-nodejs`: **Essential** for Node.js in panel
- `ScriptPath`: Points to JSX host script
- `AutoVisible`: Shows panel on Premiere launch

### package.json (Build Metadata)

```json
{
  "name": "your-plugin",
  "version": "1.0.0",
  "private": true,
  "description": "Your plugin description",
  "homepage": "https://yourwebsite.com/",
  "sidestreamBuild": {
    "channel": "production",
    "onboardingChannel": "standard",
    "bundleId": "com.yourcompany.yourplugin",
    "extensionId": "com.yourcompany.yourplugin.panel",
    "displayName": "Your Plugin Name",
    "localProductionAccount": false
  },
  "scripts": {
    "download:binaries": "node scripts/download-binaries.js",
    "package:zxp": "sh scripts/package-zxp.sh",
    "install:cep": "node scripts/install-staged-extension.js --channel both --replace-existing"
  }
}
```

---

## Panel UI (HTML/CSS/JS)

### index.html - Entry Point

Key characteristics:
- **CSP Policy**: Allows `https:`, `http:`, `blob:`, `data:` for media playback
- **Theme System**: CSS custom properties with `[data-theme="light/dark"]`
- **Preconnect**: DNS prefetch for YouTube domains
- **Module Loading**: Loads `CSInterface.js` first, then `app.js`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self' data: blob: https: http:; 
             script-src 'self' 'unsafe-inline' 'unsafe-eval';" />
  <title>Your Plugin</title>
  <link rel="stylesheet" href="./css/main.css" />
</head>
<body>
  <main class="app-shell">
    <!-- Your UI structure -->
  </main>
  <script src="./lib/CSInterface.js"></script>
  <script src="./js/app.js"></script>
</body>
</html>
```

### CSS Architecture (main.css)

**Design Token System** (CSS Custom Properties):
```css
:root {
  --bg: #1d1d1d;
  --surface: #1d1d1d;
  --surface-soft: #222222;
  --text: #f1f1f1;
  --text-muted: #aaaaaa;
  --accent: #ff0033;
  --info: #7cb7ff;
  --success: #8ed081;
  --danger: #ff7b72;
  --border: rgba(255, 255, 255, 0.12);
  --font-body: Roboto, Arial, sans-serif;
}

:root[data-theme="light"] {
  --bg: #f5f5f7;
  --surface: #f5f5f7;
  --text: #161617;
  --border: rgba(22, 22, 23, 0.12);
  /* ... light overrides */
}
```

**Responsive Breakpoints**: 820px, 640px, 420px

### app.js - Panel Controller (Main Entry)

**Architecture Pattern**: IIFE (Immediately Invoked Function Expression) with strict mode
```javascript
(function () {
  "use strict";
  // All code encapsulated - no global pollution
  
  // 1. Imports (Node.js modules via require)
  var path = require("path");
  var fs = require("fs");
  var downloader = require(path.join(extensionRoot, "js", "downloader"));
  
  // 2. DOM Element References (100+ elements cached)
  var searchForm = document.getElementById("search-form");
  var previewVideo = document.getElementById("preview-video");
  // ...
  
  // 3. State Management
  var currentMetadata = null;
  var activeDownloads = [];
  var previewVisible = false;
  
  // 4. Event Listeners (search, preview, download, settings)
  // 5. CEP/Host Communication
  // 6. Download Lifecycle Management
  // 7. Settings Persistence (localStorage)
  
}());
```

**Key Subsystems in app.js:**
| Subsystem | Purpose |
|-----------|---------|
| Search & Results | YouTube search, infinite scroll, metadata fetching |
| Preview System | Video/audio preview with custom YouTube-like controls |
| Download Manager | Queue, progress, speculative downloads, concurrency |
| Settings Panel | Quality, location, theme, telemetry, account |
| License/Account | Pro features, daily quotas, device management |
| Auto-Updater | GitHub releases / custom endpoint checking |

---

## Host Script (JSX/ExtendScript)

### jsx/hostscript.jsx - Premiere Pro Bridge

**Purpose**: Only way to access Premiere Pro's DOM API from the panel.

**Communication Pattern**: Panel → `CSInterface.evalScript()` → JSX → returns JSON string

```javascript
// Panel side (app.js):
csInterface.evalScript('importFileToBin("' + filePath + '")', function(result) {
  var parsed = JSON.parse(result);
  if (parsed.success) { /* imported */ }
});

// JSX side (hostscript.jsx):
function importFileToBin(filePath) {
  // 1. Get project
  // 2. Ensure "Sidestream Downloads" bin exists
  // 3. Capture playback state (was sequence playing?)
  // 4. Import file into bin
  // 5. Resume playback if it was playing
  // 6. Return serialized result object
}
```

**Key JSX Functions:**
| Function | Purpose |
|----------|---------|
| `sidestreamPing()` | Health check - returns project name |
| `getProjectDirectoryInfo()` | Returns project folder for default download location |
| `importFileToBin(filePath)` | Imports downloaded file, manages playback state |
| `sidestreamCapturePlaybackState()` | Checks if sequence was playing |
| `sidestreamResumePlaybackIfNeeded()` | Resumes playback after import |
| `sidestreamEnsureDownloadsBin()` | Creates/finds "Sidestream Downloads" bin |

**Error Handling**: All functions return serialized JSON with:
```javascript
{
  success: boolean,
  message: string,
  filePath: string,
  directoryPath: string,
  binName: string,
  playbackStateAvailable: boolean,
  playbackWasPlaying: boolean,
  playbackResumeAttempted: boolean,
  playbackResumeSucceeded: boolean,
  errorName, errorFileName, errorLine, errorSource
}
```

---

## Node.js Runtime Integration

### CEP Node.js Enable Flags (manifest.xml)
```xml
<CEFCommandLine>
  <Parameter>--enable-nodejs</Parameter>
  <Parameter>--mixed-context</Parameter>
  <Parameter>--allow-file-access</Parameter>
  <Parameter>--allow-file-access-from-files</Parameter>
</CEFCommandLine>
```

### Module Resolution in Panel
```javascript
// In app.js - resolve extension root dynamically
function resolveExtensionRoot() {
  var currentScript = document.currentScript || document.querySelector('script[src*="app.js"]');
  var scriptPath = currentScript.src.replace('file://', '');
  return path.dirname(path.dirname(scriptPath)); // .../Sidestream
}

var extensionRoot = resolveExtensionRoot();
var downloader = require(path.join(extensionRoot, "js", "downloader"));
```

**Important**: Node.js runs in the **panel process**, not a separate process. Use `require()` for CommonJS modules.

---

## Binary Management

### binary-manager.js - Runtime Binary Resolution

Manages multiple versions, platforms, and sources (bundled vs system):

```javascript
// Key responsibilities:
// 1. Discover bundled binaries (yt-dlp, ffmpeg, deno, python)
// 2. Verify SHA256 checksums against release.json
// 3. Select active binary based on platform/arch
// 4. Handle Python zipapp for yt-dlp on macOS
// 5. Fallback to system-installed binaries
// 6. Version detection (yt-dlp --version)
```

### binaries/release.json - Binary Manifest

```json
{
  "downloadedAt": "2026-07-04T03:08:54.974Z",
  "releases": {
    "ytDlp": {
      "tagName": "2026.06.09",
      "assets": [
        { "assetName": "yt-dlp.exe", "outputPath": "binaries/yt-dlp.exe", 
          "size": 18202192, "sha256": "3a48cb955d55c8821b60ccbdbbc6f61bc958f2f3d3b7ad5eaf3d83a543293a27",
          "sourceUrl": "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp.exe" }
      ]
    },
    "ffmpeg": { ... },
    "deno": { ... },
    "pythonStandalone": { ... }
  }
}
```

### Download Script: scripts/download-binaries.js
- Fetches latest releases from GitHub
- Verifies checksums
- Extracts archives (zip, tar.gz)
- Writes release.json

---

## Download Engine

### downloader.js - Core Download Logic (244KB)

**Architecture**: Promise-based with cancellation support

```javascript
// Main entry point
function downloadVideo(options) {
  // options: { url, formatType, quality, destinationDir, cancellation, onStatus, ... }
  return downloadVideoRequest(options).promise;
}

// Request structure with lifecycle
function downloadVideoRequest(options) {
  var cancellation = options.cancellation || createCancellationController();
  
  // 1. Try audio direct fast-path (FFmpeg direct stream copy)
  // 2. Quality-first flow (candidate discovery → selection → download)
  // 3. Cookie ladder (auth retries with browser cookies)
  // 4. Upcoming live retry logic
  
  return { promise, physicalTransferPromise, cancel };
}
```

**Key Flow Components:**

| Component | File | Purpose |
|-----------|------|---------|
| **Candidate Discovery** | download-candidate-discovery.js | Probe yt-dlp for available formats |
| **Candidate Selection** | download-candidate-selection.js | Pick best quality per user settings |
| **Quality-First Flow** | downloader.js | Multi-attempt download with fallbacks |
| **Cookie Jar** | cookie-jar.js | Browser cookie extraction for auth |
| **Audio Direct** | downloader.js | FFmpeg direct stream copy (no yt-dlp) |
| **Pre-resolve Cache** | downloader.js | Cache signed URLs (4min TTL) |

**Concurrency Control:**
```javascript
var PHYSICAL_DOWNLOAD_CONCURRENCY = 2;
var SPECULATIVE_DOWNLOAD_CONCURRENCY = 2;
var DOWNLOAD_CANDIDATE_WARM_CONCURRENCY = 2;
```

---

## YouTube Integration

### Search (No API Key Required)
```javascript
// Uses YouTube's internal API (InnerTube)
var YOUTUBE_SEARCH_URL = "https://www.youtube.com/youtubei/v1/search";
var YOUTUBE_SEARCH_FILTER_TOKEN = "EgIQAQ==";  // Video filter
```

### Fast Preview (Player API)
```javascript
// Uses YouTube's player API for instant preview
var YOUTUBE_FAST_PLAYER_API_URL = "https://www.youtube.com/youtubei/v1/player";
var YOUTUBE_FAST_PLAYER_API_KEY = "AIzaSy...qcW8";  // Public iOS/Android keys

// Profiles: iOS (com.google.ios.youtube), Android (com.google.android.youtube)
```

### Player Clients for yt-dlp
```javascript
// Embedded clients that work without JS runtime
YOUTUBE_SAFE_OVERRIDE_CLIENTS = {
  android_vr: true,
  tv: true,
  web_embedded: true
};
```

---

## Installation System (Windows)

### NSIS Installer Structure
```
$PLUGINSDIR/
├── installer-build.json          # Build metadata (version, commit, channel)
├── modern-wizard.bmp             # Installer UI bitmap
├── nsDialogs.dll, nsExec.dll, System.dll  # NSIS plugins
├── helpers/
│   ├── install-sidestream.ps1    # PowerShell install logic
│   └── uninstall-sidestream.ps1  # PowerShell uninstall logic
└── payload/
    └── Sidestream/               # Extension payload (copied to CEP/extensions)
```

### install-sidestream.ps1 - Key Operations

```powershell
# 1. Resolve CEP extensions directory
#    C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\

# 2. Validate payload matches installer-build.json version

# 3. Remove stale extensions (same bundle ID, different versions)

# 4. Atomic copy: temp folder → move → target

# 5. Verify installation (package.json + manifest.xml versions match)

# 6. Write installer receipt (JSON) to %ProgramData%\Sidestream\installer-receipt.json
```

**Receipt Schema** (for updates/uninstalls):
```json
{
  "schemaVersion": "sidestream_installer_receipt_v1",
  "installerReceiptIdHash": "sha256...",
  "installMethod": "windows_beta_exe",
  "packageIdentifier": "com.sidestream.downloader.windows-beta",
  "firstInstalledAt": "2026-01-15T10:30:00Z",
  "lastInstallerRunAt": "2026-07-04T03:08:54Z",
  "packageVersion": "1.0.16",
  "buildChannel": "production",
  "verification": { "status": "passed", ... }
}
```

---

## Build & Packaging Pipeline

### Build Scripts (package.json scripts)
```json
"scripts": {
  "download:binaries": "node scripts/download-binaries.js",
  "binaries:ensure": "node -e \"...check binaries exist or download...\"",
  "package:prep": "npm run binaries:ensure && node scripts/prepare-zxp.js && node scripts/install-staged-extension.js --channel prod --replace-existing",
  "package:zxp": "sh scripts/package-zxp.sh",
  "installer:windows:beta": "node scripts/build-windows-native-installer.mjs"
}
```

### ZXP Packaging (package-zxp.sh)
1. Stage extension to temp directory
2. Replace template values in manifest.xml (version, bundle ID)
3. Copy binaries per platform
4. Sign with certificate (ZXP requires code signing)
5. Output `.zxp` file

### Windows Native Installer (build-windows-native-installer.mjs)
1. Build NSIS script with embedded payload
2. Compile with `makensis`
3. Code sign `.exe` (optional)
4. Generate installer-build.json

---

## Step-by-Step: Building Your Own Plugin

### Phase 1: Project Setup

```bash
# 1. Create directory structure
mkdir -p my-plugin/{CSXS,js,jsx,css,lib,binaries}

# 2. Initialize package.json
cat > my-plugin/package.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "private": true,
  "sidestreamBuild": {
    "channel": "production",
    "bundleId": "com.mycompany.myplugin",
    "extensionId": "com.mycompany.myplugin.panel",
    "displayName": "My Plugin"
  }
}
EOF

# 3. Create manifest.xml
cat > my-plugin/CSXS/manifest.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="10.0"
  ExtensionBundleId="com.mycompany.myplugin"
  ExtensionBundleVersion="1.0.0"
  ExtensionBundleName="My Plugin">
  <ExtensionList>
    <Extension Id="com.mycompany.myplugin.panel" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList><Host Name="PPRO" Version="[14.0,99.9]" /></HostList>
    <LocaleList><Locale Code="All" /></LocaleList>
    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="10.0" /></RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.mycompany.myplugin.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/hostscript.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
            <Parameter>--allow-file-access</Parameter>
            <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>My Plugin</Menu>
          <Geometry>
            <Size><Width>400</Width><Height>600</Height></Size>
            <MinSize><Width>350</Width><Height>450</Height></MinSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
EOF
```

### Phase 2: Minimal Panel (index.html + app.js)

```html
<!-- my-plugin/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self' data: blob: https: http:; 
             script-src 'self' 'unsafe-inline' 'unsafe-eval';" />
  <title>My Plugin</title>
  <style>
    :root { --bg:#1d1d1d; --text:#f1f1f1; --accent:#ff0033; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui; padding:20px; }
    button { background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; }
  </style>
</head>
<body>
  <h1>My Plugin</h1>
  <p id="status">Ready</p>
  <button id="ping-btn">Ping Premiere</button>
  <script src="./lib/CSInterface.js"></script>
  <script src="./js/app.js"></script>
</body>
</html>
```

```javascript
// my-plugin/js/app.js
(function() {
  "use strict";
  
  var csInterface = new CSInterface();
  var pingBtn = document.getElementById("ping-btn");
  var statusEl = document.getElementById("status");
  
  pingBtn.addEventListener("click", function() {
    statusEl.textContent = "Pinging...";
    csInterface.evalScript("sidestreamPing()", function(result) {
      statusEl.textContent = "Result: " + result;
    });
  });
})();
```

### Phase 3: Host Script (jsx/hostscript.jsx)

```javascript
// my-plugin/jsx/hostscript.jsx
function sidestreamEscapeString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sidestreamSerializeResult(result) {
  return '{"success":' + (result.success ? 'true' : 'false') + 
    ',"message":"' + sidestreamEscapeString(result.message) + '"}';
}

function sidestreamPing() {
  if (app && app.project && app.project.name) {
    return sidestreamSerializeResult({
      success: true,
      message: "Premiere ready: " + app.project.name
    });
  }
  return sidestreamSerializeResult({
    success: true,
    message: "Premiere ready (no project open)"
  });
}

$.writeln("My Plugin host script loaded.");
```

### Phase 4: CSInterface.js (lib/CSInterface.js)

Copy from Sidestream or use Adobe's official version:
```javascript
// Minimal CSInterface wrapper
(function(global) {
  function CSInterface() {}
  CSInterface.prototype.evalScript = function(script, callback) {
    if (global.__adobe_cep__ && global.__adobe_cep__.evalScript) {
      global.__adobe_cep__.evalScript(script, callback);
    } else if (callback) {
      callback("EvalScript not available");
    }
  };
  global.CSInterface = CSInterface;
}(this));
```

### Phase 5: Test in Premiere Pro

1. **Developer Mode**: Enable in Premiere Pro
   - Windows: `reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1`
   - Or use `.debug` file in extension folder

2. **Install for Testing**:
   ```bash
   # Copy to CEP extensions folder
   cp -r my-plugin "C:/Program Files (x86)/Common Files/Adobe/CEP/extensions/"
   
   # Restart Premiere Pro
   # Window > Extensions > My Plugin
   ```

3. **Debug Panel**:
   - Right-click panel → Inspect Element (opens DevTools)
   - Console shows JS errors, network requests

### Phase 6: Add Node.js Features

```javascript
// In app.js - now you can use Node.js!
var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

// Example: Run external command
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    var proc = childProcess.spawn(cmd, args);
    var stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    proc.on("close", code => code === 0 ? resolve(stdout) : reject(stderr));
  });
}

// Use in event handler
pingBtn.addEventListener("click", async function() {
  try {
    var version = await runCommand("yt-dlp.exe", ["--version"]);
    statusEl.textContent = "yt-dlp version: " + version.trim();
  } catch (e) {
    statusEl.textContent = "Error: " + e;
  }
});
```

### Phase 7: Bundle Binaries

```bash
# Download yt-dlp for Windows
curl -L -o my-plugin/binaries/yt-dlp.exe \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

# Download ffmpeg (static build)
curl -L -o ffmpeg.zip https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-win32-x64
# Extract ffmpeg.exe, ffprobe.exe to my-plugin/binaries/ffmpeg/win32-x64/
```

### Phase 8: Create Binary Manager

```javascript
// my-plugin/js/binary-manager.js
var path = require("path");
var fs = require("fs");

var BINARY_DIR = path.join(__dirname, "..", "binaries");

function getYtDlpPath() {
  var p = path.join(BINARY_DIR, "yt-dlp.exe");
  if (fs.existsSync(p)) return p;
  throw new Error("yt-dlp not found at " + p);
}

function getFfmpegPath() {
  var p = path.join(BINARY_DIR, "ffmpeg", "win32-x64", "ffmpeg.exe");
  if (fs.existsSync(p)) return p;
  throw new Error("ffmpeg not found at " + p);
}

module.exports = { getYtDlpPath, getFfmpegPath };
```

### Phase 9: Build Downloader Module

```javascript
// my-plugin/js/downloader.js
var childProcess = require("child_process");
var binaryManager = require("./binary-manager");

function downloadVideo(url, outputPath, format) {
  return new Promise((resolve, reject) => {
    var ytdlp = binaryManager.getYtDlpPath();
    var args = ["-f", format || "best", "-o", outputPath, url];
    
    var proc = childProcess.spawn(ytdlp, args);
    proc.on("close", code => {
      if (code === 0) resolve(outputPath);
      else reject(new Error("yt-dlp exited with code " + code));
    });
  });
}

module.exports = { downloadVideo };
```

### Phase 10: Package as ZXP (for distribution)

```bash
# 1. Get a code signing certificate (required for ZXP)
# 2. Use Adobe ZXP command line tool or custom script
# 3. Or use the NSIS installer approach like Sidestream
```

### Phase 11: Create Windows Installer (NSIS)

```nsis
; my-plugin/installer.nsi
Name "My Plugin"
OutFile "MyPlugin-Installer.exe"
InstallDir "$PROGRAMFILES\MyPlugin"

Section
  ; Copy extension to CEP extensions
  SetOutPath "$COMMONFILES\Adobe\CEP\extensions\MyPlugin"
  File /r "payload\MyPlugin\*"
  
  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd
```

---

## Critical Implementation Details

### 1. **CEP Node.js Context**
- `--mixed-context` allows both browser and Node.js globals
- `require()` works for `.js` and `.json` files
- `__dirname`, `__filename` available
- `process.platform`, `process.arch` for platform detection

### 2. **File System Access**
- `--allow-file-access` + `--allow-file-access-from-files` enables `fs` module
- Use `fs.readFileSync`, `fs.writeFileSync`, `childProcess.spawn`
- Paths: `path.join(__dirname, "..", "binaries", "yt-dlp.exe")`

### 3. **Panel ↔ Host Communication**
```javascript
// Panel → Host (async, callback-based)
csInterface.evalScript('myJSXFunction("arg1", "arg2")', function(result) {
  var parsed = JSON.parse(result);
});

// Host → Panel (via CSInterface events)
// In JSX: csInterface.evalScript('window.dispatchEvent(new CustomEvent("myEvent", {detail: data}))')
```

### 4. **Settings Persistence**
```javascript
// Panel uses localStorage (survives restart)
var SETTINGS_KEY = "myplugin.settings.v1";
function saveSettings(obj) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
}
function loadSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
}
```

### 5. **Premiere Project Integration**
```javascript
// In hostscript.jsx - get project folder for default downloads
function getProjectDirectoryInfo() {
  if (!app.project || !app.project.path) {
    return serialize({ success: false, message: "Save project first" });
  }
  var projFile = new File(app.project.path);
  return serialize({ 
    success: true, 
    directoryPath: projFile.parent.fsName,
    filePath: projFile.fsName 
  });
}
```

### 6. **Debugging Tips**
- **Panel DevTools**: Right-click panel → Inspect
- **JSX Debugging**: `$.writeln("debug")` → shows in ExtendScript Toolkit / VS Code
- **Log Files**: Check `~/AppData/Roaming/Adobe/CEP/extensions/your-plugin/` for logs
- **Console.log**: Works in panel DevTools console

### 7. **Common Pitfalls**

| Issue | Solution |
|-------|----------|
| `require` not found | Ensure `--enable-nodejs --mixed-context` in manifest |
| File access denied | Add `--allow-file-access --allow-file-access-from-files` |
| JSX not executing | Check `ScriptPath` in manifest, ensure `.jsx` extension |
| Panel blank/white | Check CSP policy, DevTools for errors |
| Binaries not found | Use `path.join(__dirname, "..", "binaries", ...)` |
| yt-dlp fails on Windows | Use `.exe` extension, ensure executable permissions |
| Premiere API errors | Wrap in try/catch, check `app.project` exists |

---

## Distribution Checklist

- [ ] **Code Signing**: ZXP requires valid certificate (DigiCert, Sectigo, etc.)
- [ ] **Manifest Version**: Increment `ExtensionBundleVersion` on each release
- [ ] **Binary Versions**: Pin yt-dlp/ffmpeg versions in release.json
- [ ] **Installer Testing**: Test on clean Windows VM (no Premiere, no prior install)
- [ ] **Uninstaller**: Removes only your extension, preserves others
- [ ] **Auto-Update**: Implement updater.js checking GitHub releases or your API
- [ ] **Telemetry**: Opt-in anonymous usage stats (GDPR compliant)
- [ ] **License System**: If commercial, implement license validation (Sidestream uses device-based)

---

## Resources & References

- **CEP Cookbook**: https://github.com/Adobe-CEP/CEP-Resources
- **CEP Documentation**: https://developer.adobe.com/console/cep/
- **ExtendScript API**: https://extendscript.docsforadobe.dev/
- **yt-dlp**: https://github.com/yt-dlp/yt-dlp
- **ffmpeg-static**: https://github.com/eugeneware/ffmpeg-static
- **NSIS**: https://nsis.sourceforge.io/
- **ZXP Signing**: https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCmd

---

## Summary: Key Takeaways for Your Plugin

1. **Start Simple**: Minimal panel → host script → test in Premiere → add features
2. **Node.js is Powerful**: Use for heavy lifting (downloads, transcoding, API calls)
3. **Binaries are Essential**: Bundle yt-dlp, ffmpeg for offline/reliable operation
4. **JSX Bridge is Limited**: Only for Premiere DOM operations; do logic in Node.js
5. **Installer Matters**: Professional installer handles updates, cleanup, receipts
6. **Theme Support**: CSS custom properties make dark/light trivial
7. **Settings in localStorage**: Simple, persistent, no backend needed
8. **Error Handling**: Serialize everything across JSX boundary with error context

---

*This architecture breakdown is based on Sidestream v1.0.16. Adapt patterns to your specific needs.*