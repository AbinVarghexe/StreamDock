# StreamDock 🎬

> **The Ultimate YouTube Browser, Player & Media Downloader for Adobe Premiere Pro.**  
> Search millions of YouTube videos, preview in real-time, and download directly into your active Premiere Pro Project Bin & Timeline with one click.

---

## ✨ Features

- 🔍 **In-Panel YouTube Search**: High-speed InnerTube API client — no YouTube Data API key required.
- ⚡ **Dual Preview Engine**:
  - **Loopback Embed Bridge**: Embedded YouTube player running on local loopback server (`127.0.0.1`), eliminating Adobe CEP `Error 153`.
  - **Direct Stream Pipe**: Dedicated `yt-dlp` streaming engine for licensed, music, and VEVO videos with embedding restrictions.
- 📥 **Premiere-Optimized Downloads**:
  - Automatically prioritizes Premiere Pro-compatible video (**H.264 / AVC1**) and audio (**AAC / mp4a**) to avoid codec import errors.
  - Quality options up to **8K / 4K / 1440p / 1080p / 720p / 480p**.
  - Audio-only extraction: **MP3 (320kbps)**, **WAV (Lossless PCM)**, and **AAC**.
- ⏱️ **1-Click Premiere Automation**:
  - Automatically imports downloaded clips directly into the active Premiere Pro Project Bin.
  - Optional: Automatically inserts the media clip onto the active sequence timeline at the playhead position.
- ⚙️ **Self-Contained & Zero Config**:
  - Works with bundled `yt-dlp` and `FFmpeg` engines without needing system environment setup.

---

## 🚀 Quick Install Guide (For Users)

### Windows (1-Click Method)

1. Download the latest release package: `StreamDock-v1.0.0-Premiere-Pro-Extension.zip` (from Releases or the `dist/` folder).
2. Extract the `.zip` archive.
3. Double-click **`INSTALL.bat`**.
4. Open (or restart) **Adobe Premiere Pro**.
5. In the top menu, navigate to:
   ```text
   Window ➔ Extensions ➔ StreamDock
   ```

---

### Manual Installation (Windows & macOS)

#### 1. Copy Files to the Adobe CEP Extensions Folder

- **Windows**:
  ```text
  %APPDATA%\Adobe\CEP\extensions\com.streamdock.youtube.downloader
  ```
  *(e.g., `C:\Users\<YourUser>\AppData\Roaming\Adobe\CEP\extensions\com.streamdock.youtube.downloader`)*

- **macOS**:
  ```text
  ~/Library/Application Support/Adobe/CEP/extensions/com.streamdock.youtube.downloader
  ```

#### 2. Enable Adobe CEP PlayerDebugMode

Because this is an unsigned developer extension, enable CEP debug mode so Premiere Pro loads it:

- **Windows** (Run in PowerShell / Command Prompt):
  ```powershell
  reg add "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f
  reg add "HKCU\Software\Adobe\CSXS.17" /v PlayerDebugMode /t REG_SZ /d 1 /f
  ```

- **macOS** (Run in Terminal):
  ```bash
  defaults write com.adobe.CSXS.10 PlayerDebugMode 1
  defaults write com.adobe.CSXS.11 PlayerDebugMode 1
  defaults write com.adobe.CSXS.12 PlayerDebugMode 1
  defaults write com.adobe.CSXS.13 PlayerDebugMode 1
  defaults write com.adobe.CSXS.14 PlayerDebugMode 1
  defaults write com.adobe.CSXS.15 PlayerDebugMode 1
  defaults write com.adobe.CSXS.16 PlayerDebugMode 1
  defaults write com.adobe.CSXS.17 PlayerDebugMode 1
  ```

---

## 🛠️ Developer Setup & Packaging

If you want to modify or build the extension from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- Adobe Premiere Pro CC 2020 through 2026+

### Commands

1. **Download / Verify Bundled Binaries**:
   ```bash
   npm run download:binaries
   ```
   *Downloads `yt-dlp.exe` and `ffmpeg` into `binaries/`.*

2. **Deploy to Local Premiere Pro**:
   ```bash
   npm run deploy
   ```
   *Copies project files directly to `%APPDATA%\Adobe\CEP\extensions\...` and enables debug registry keys.*

3. **Build Distributable Share Package**:
   ```bash
   npm run package
   ```
   *Creates `dist/StreamDock-v1.0.0-Premiere-Pro-Extension.zip` containing the bundled binary engines, `INSTALL.bat`, and documentation ready to share.*

---

## 📁 Project Structure

```text
com.streamdock.youtube.downloader/
├── CSXS/
│   └── manifest.xml             # CEP Extension definition, permissions & versions
├── binaries/                    # Bundled yt-dlp & FFmpeg binaries (offline engines)
├── css/
│   └── main.css                 # Premiere Pro themed dark/light UI styling
├── js/
│   ├── app.js                   # UI controller, state manager, search & modal handlers
│   ├── binary-manager.js        # Detection, path validation & probing for yt-dlp/ffmpeg
│   ├── download-candidate-selection.js # Smart codec & format selection rules (H.264/AAC)
│   ├── downloader.js            # yt-dlp child process runner & progress parsing
│   ├── preview-server.js        # Local loopback bridge & direct stream HTTP server
│   └── youtube-search.js        # InnerTube API search engine
├── jsx/
│   └── hostscript.jsx           # ExtendScript host bridge (Bin & Timeline automation)
├── lib/
│   └── CSInterface.js           # Adobe CEP runtime communication library
├── scripts/
│   ├── download-binaries.js     # Helper to fetch latest binaries
│   ├── install-staged-extension.js # Local CEP deployment script
│   └── package-extension.js     # Standalone release builder
├── .debug                       # Remote debugging port configuration
├── index.html                   # Extension markup & layout
├── package.json                 # Project configuration
└── README.md                    # Documentation
```

---

## ❓ Troubleshooting & FAQ

### Video shows "Error 153"
- StreamDock includes a built-in local HTTP bridge server (`127.0.0.1:<random-port>`) that automatically assigns valid `origin` and `widget_referrer` headers to satisfy YouTube's iframe security requirements.

### Licensed / Music / VEVO videos stuck on thumbnail
- Click the **`▶ yt-dlp Stream`** button in the modal header, or click **`Play with yt-dlp`** in the bottom banner. This switches playback to StreamDock's direct streaming pipeline, which fetches the decrypted video chunks in real-time.

### Panel is blank or not showing under Window ➔ Extensions
- Ensure you have run `INSTALL.bat` (or enabled `PlayerDebugMode` in the Windows registry).
- Restart Adobe Premiere Pro after installing.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
