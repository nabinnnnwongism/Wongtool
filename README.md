<div align="center">

# ⚡ Wong — Steam Library Unlocker & Game Claim Tool

**A standalone Steam plugin that lets you claim any game from the Store and install it instantly — no account purchase required.**

[![Platform: Windows 10 / 11](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](#)
[![Runtime: Electron 36](https://img.shields.io/badge/runtime-Electron%2036-green.svg)](https://www.electronjs.org/)
[![Hook: OpenSteamTool](https://img.shields.io/badge/hook-OpenSteamTool-orange.svg)](https://github.com/OpenSteam001/OpenSteamTool)
[![Plugin: WongOS / Millennium](https://img.shields.io/badge/loader-WongOS-purple.svg)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

*Steam Store Claim Button · 1-Click Library Injection · Auto Steam Restart · Standalone One-Click Installer*

</div>

---

## What is Wong?

Wong is a fully self-contained Steam modification toolkit. It injects directly into the Steam client (no separate window needed) and adds a **"Claim"** button to every game on the Steam Store. When you click Claim:

1. Wong's background service (`wong-daemon`) contacts its manifest server and downloads the depot ticket for that game.
2. A Lua entitlement ticket is written to `Steam\config\lua\<AppID>.lua` — the exact format Steam's license engine reads.
3. A native dialog appears asking **"Restart Steam Now?"** — one click and Steam restarts with the game fully unlocked in your Library.
4. The game appears in your Steam Library ready to download and install normally.

No cracked executables. No modified Steam files. Pure license ticket injection via OpenSteamTool's in-memory hook.

---

## How it Works (Architecture)

```
Steam Store (Browser)
       │
       ▼ [Claim button injected by wong-inject plugin]
       │
       ▼
wong-daemon (localhost:4173)
  ├── Downloads depot manifest from manifest CDN
  ├── Writes Steam\config\lua\<AppID>.lua
  ├── Writes Steam\config\stplug-in\<AppID>.lua
  └── Returns game name + OK response
       │
       ▼
"Restart Steam Now?" dialog
       │
       ▼
Steam restarts → reads new Lua tickets → Game appears in Library ✓
```

### Components

| Component | Location | Purpose |
|---|---|---|
| **wong-daemon.js** | `wong-daemon.js` | Ultra-lightweight Node.js headless server. Runs on port 4173 with ~18 MB RAM. No console window. |
| **server.js** | `server.js` | Full backend API: manifest download, Lua injection, library DB, Steam path detection, restart API. |
| **wong-inject plugin** | `wong-inject/` | WongOS/Millennium Steam plugin. Injects the Claim button into the Steam Store CEF browser. |
| **OpenSteamTool hook** | `steamtools_assets/` | `xinput1_4.dll` → `OpenSteamTool.dll` → hooks `steamclient64.dll` to read Lua tickets. |
| **Wong-Setup.exe** | Releases tab | One-click Rust installer. Detects Steam, extracts all components, registers daemon autostart. |
| **Electron app** | `index.html`, `js/app.js` | Optional desktop app UI: Library manager, SteamDB search, bypass archive, settings wizard. |

---

## How the Steam Hook Works

Wong uses **OpenSteamTool** — an open-source Steam license hook. Here's the chain:

```
Steam.exe launches
       │
       ▼
steamui.dll imports xinput1_4.dll (controller API)
       │
       ▼
xinput1_4.dll (proxy) → loads OpenSteamTool.dll
       │
       ▼
OpenSteamTool scans steamclient64.dll memory patterns
(pattern definitions in opensteamtool/pattern/steamclient/)
       │
       ▼
Patches the license entitlement check in memory
       │
       ▼
Reads Steam\config\lua\*.lua — executes addappid() for each file
       │
       ▼
Steam thinks you own those App IDs
```

No Steam files are permanently modified. The hook only lives in memory while Steam is running. Remove the DLLs and Steam returns to normal.

---

## Repository Structure

```
Wong/
├── index.html              # Electron desktop app UI
├── electron-main.js        # Electron window manager
├── electron-preload.js     # Secure IPC bridge
├── server.js               # Full backend API server
├── wong-daemon.js          # Headless daemon entry point
├── package.json            # Node.js dependencies
├── start-daemon.vbs        # Silent daemon launcher (no console)
├── stop-daemon.bat         # Daemon shutdown script
│
├── js/
│   └── app.js              # Full frontend SPA logic
│
├── css/
│   └── style.css           # Complete design system
│
├── steamtools_assets/      # Hook DLLs and pattern definitions
│   ├── dwmapi.dll          # Legacy proxy (older Steam versions)
│   ├── xinput1_4.dll       # Active proxy loader for Steam 64-bit
│   ├── OpenSteamTool.dll   # Core memory hook engine
│   ├── cloud_redirect.dll  # Cloud save redirect hook
│   ├── opensteamtool/
│   │   ├── ipc/steamclient/      # IPC pattern definitions per steamclient64.dll hash
│   │   └── pattern/
│   │       ├── steamclient/      # Memory patch patterns per steamclient64.dll hash
│   │       └── steamui/         # Memory patch patterns per steamui.dll hash
│   └── millennium_plugin/        # Fallback Millennium plugin loader
│
├── wong-inject/            # Steam Store Claim Button plugin (WongOS/Millennium)
│   ├── frontend/index.js   # CEF frontend: injects Claim button, handles UI
│   ├── backend/main.py     # Python backend sidecar (minimal)
│   ├── metadata.json       # Plugin metadata
│   └── plugin.json         # Plugin entry configuration
│
└── installer/              # Standalone one-click installer (Rust)
    ├── Cargo.toml
    └── src/main.rs         # Rust installer source
```

---

## Installation (For Developers / Self-Build)

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://rustup.rs/) (for building the installer)
- Steam installed at default path

### Run the Electron App

```bash
# Clone the repository
git clone https://github.com/nabinnnnwongism/Wongtool.git
cd Wongtool

# Install dependencies
npm install

# Start the Electron desktop app
npm start
```

### Build the Standalone Installer (Rust)

```bash
cd installer
cargo build --release
# Output: installer/target/release/installer.exe
```

The installer bundles `payload.zip` (all Steam hook files + daemon) and extracts it all in one click.

### Run Only the Daemon (Headless)

If you just want the background API without the Electron window:

```bash
node wong-daemon.js
# Starts on localhost:4173 silently
```

---

## Standalone Installer (No Dev Setup Needed)

For end users who just want to install and use it, download `Wong-Setup.exe` from the **[Releases](../../releases)** tab.

The installer:
1. Auto-detects your Steam path (registry + default paths)
2. Kills Steam if running
3. Extracts all hook DLLs, plugins, and daemon into the correct locations
4. Registers `wong-daemon.exe` to auto-start silently on Windows login
5. Offers to launch Steam immediately

**After install**, just open Steam, go to any game's Store page — the **Claim** button will be there.

---

## OpenSteamTool Pattern Updates

The `steamtools_assets/opensteamtool/pattern/` folder contains memory scan patterns keyed by the SHA-256 hash of your installed `steamclient64.dll` and `steamui.dll`. When Steam updates, new pattern files are needed.

Current patterns are included for:
- `steamclient64.dll`: `E9045710...` (latest as of Oct 2026)
- `steamui.dll`: `1B945794...` (latest as of Oct 2026)

If Steam updates and Claim stops working, this is the first place to check.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop App | [Electron 36](https://www.electronjs.org/) |
| Backend API | Node.js native HTTP server |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Frontend | Vanilla HTML5, Vanilla JS (ES Modules, custom SPA router) |
| Styling | Vanilla CSS (Glassmorphism, CSS Grid, Bento layout) |
| Steam Plugin | WongOS / [Millennium](https://github.com/shdwmtr/millennium) loader |
| Hook Engine | [OpenSteamTool](https://github.com/OpenSteam001/OpenSteamTool) |
| Installer | [Rust](https://www.rust-lang.org/) with embedded zip payload |

---

## License

This project is licensed under the [MIT License](LICENSE).
