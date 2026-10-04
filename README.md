<div align="center">

# ⚡ Wong — Desktop Game Launcher & Library Hub

**A lightweight, zero-restart Steam library manager and community bypass hub.**

[![Platform: Windows 10 / 11](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](#)
[![Runtime: Electron 36](https://img.shields.io/badge/runtime-Electron%2036-green.svg)](https://www.electronjs.org/)
[![Database: SQLite](https://img.shields.io/badge/database-better--sqlite3-brightgreen.svg)](https://github.com/WiseLibs/better-sqlite3)
[![UI: Vanilla CSS Bento](https://img.shields.io/badge/ui-Vanilla%20Bento%20Grid-orange.svg)](#)
[![Status: Showcase Only](https://img.shields.io/badge/status-Showcase%20Edition-red.svg)](#important-notice)

*Live Steam Ingestion · Zero Client Restart · Bento Grid Interface · Scene Bypass Repository · Denuvo Offline Token Queue*

</div>

---

> [!WARNING]
> ### Important Notice (Showcase Repository)
> **Cloning this repository will not give you a working game downloader or cracking tool.**
> 
> This public repo contains only the **desktop frontend, design system, and UI state architecture**. All runtime hook binaries (`dwmapi.dll`, `OpenSteamTool.dll`), memory pattern tables, and upstream manifest download sources have been intentionally omitted to prevent misuse and maintain repository compliance.
> 
> 📬 **Want to test or evaluate the full functional build?**  
> Contact directly at: **[technicallyprsent@gmail.com](mailto:technicallyprsent@gmail.com)**

---

## What is Wong?

Wong is a unified game launcher built with Electron and Vanilla web technologies. It bridges public Steam catalog records with local library management and community bypass tools into a single, cohesive desktop interface.

Unlike standard external tools that force you to quit Steam, run scripts, and reboot the client, Wong is built around **in-memory live hooking** — tickets and manifests are recognized on the fly without interrupting your active Steam session.

---

## Architecture Flow

```
                                  [ User Input: App ID / Title / Dropzone ]
                                                     │
                                                     ▼
                                        [ Live Steam Store Resolver ]
                                                     │
                         ┌───────────────────────────┴───────────────────────────┐
                         ▼                                                       ▼
            [ Bento Grid UI Library ]                               [ Runtime Injection Hook ]
            ├── Official 600×900 2x Poster                           ├── dwmapi.dll Proxy Loader
            ├── SQLite Metadata Cache                                ├── Memory Pattern Scanner
            └── IndexedDB Wallpaper Canvas                           └── In-Memory Entitlement Check
                                                                                 │
                                                                                 ▼
                                                                     [ Steam Client (No Restart) ]
```

---

## Visual Walkthrough & Demos

### 1. Ingestion Showcase: Adding a Game Live
Demonstrating real-time catalog search, App ID injection, and instant Bento card rendering without restarting Steam.

https://github.com/nabinnnnwongism/Wongtool/raw/main/illustration/Adding%20Game.mp4

---

### 2. Bypass & Scene Fix Injection (Demo: PRAGMATA)
Demonstrating automatic game directory detection, high-resolution asset retrieval, and one-click fix extraction.

https://github.com/nabinnnnwongism/Wongtool/raw/main/illustration/Bypassing%20example.mp4

---

## Core Systems

### 1. Live SteamTool Engine
- **Direct Library Ingestion**: Paste any numeric Steam App ID or search by title to pull game metadata and add it to your collection.
- **Zero Client Restart**: Injects runtime tickets and depot manifests dynamically. Steam picks up the entitlement immediately without requiring `taskkill /f /im steam.exe`.
- **Drag-and-Drop Ingestion**: Drop raw `.lua`, `.manifest`, or `.zip` ticket archives directly onto the interface dropzone for automated routing.

### 2. Scene Bypass & Fix Archive
Curated game fixes, standalone bypasses, and compatibility patches organized across major publisher ecosystems:

| Archive | Focus | Coverage |
| :--- | :--- | :--- |
| **Electronic Arts** | EA App runtime bypasses & offline fixes | Frostbite engine titles |
| **Ubisoft** | Connect wrapper patches & license tickets | Uplay / Connect catalog |
| **Rockstar** | Social Club bypasses & launcher emulators | RAGE engine releases |
| **Denuvo** | Scene crack integration & token managers | High-security protected titles |
| **PlayStation** | PSN overlay fixes & standalone emulators | PC port catalog |
| **Other Games** | Indie & general community fixes | Wide catalog |

Bypasses and releases are sourced from premier scene groups and community reverse engineers including **Voices38**, **RUNE**, **EMPRESS**, **FCKDRM**, **TENOKE**, and others.

---

## In Development / Early Access

### 1. Automated Denuvo Offline Activator
For uncracked Denuvo-protected games, Wong includes an automated token provisioning pipeline to generate offline activation files:

1. **Select Game**: Open **Offline Activation** and pick from available token allocations.
2. **Instant Provisioning**: If a token slot is currently open, Wong writes the activation payload straight to your game directory. You launch the game's `.exe` and play completely offline.
3. **Smart Queue System**: When daily token limits are reached, your client joins an automated queue. When your slot opens, the background service claims the token on your next PC boot, installs it, and readies the game.

> *Early Access Note: Daily token slots are limited and time-sensitive. If your machine remains offline or unresponsive when your queue window triggers, the reservation expires to pass the slot to the next user.*

### 2. Hypervisor (HV) Bypass Injection *(R&D)*
Active research into low-overhead, hypervisor-level bypass injection. The objective is to provide a clean, zero-configuration injection layer that runs without demanding risky UEFI alterations, custom boot parameters, or driver signature bypasses.

---

## Design & UI Architecture

| Module | Implementation |
| :--- | :--- |
| **Bento Grid** | CSS Grid with fixed aspect-ratio cards matching Valve's official 600×900 2x capsule format. |
| **Curved Rail** | Glossy, floating vertical navigation sidebar with SVG glyphs and hover scene previews. |
| **Atmosphere Engine** | Instant toggle between Ivory (Light) and Obsidian (Dark) palettes with persistent state. |
| **Custom Wallpapers** | Local PNG/JPG/GIF canvas stored in browser **IndexedDB** with live opacity and color wash sliders. |
| **Native Titlebar** | Frameless Electron window featuring custom drag margins and titlebar window controls. |

---

## Tech Stack

- **Runtime**: [Electron 36](https://www.electronjs.org/)
- **Backend Service**: Node.js embedded HTTP server
- **Database**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Frontend**: Vanilla HTML5, Vanilla JavaScript (ES Modules, custom SPA router)
- **Styling**: Vanilla CSS (Design Tokens, Glassmorphism, CSS Grid)
- **Icons**: [Lucide Icons](https://lucide.dev/) + Custom vector marks

---

## Setup (Showcase Build)

```bash
# Clone the repository
git clone https://github.com/nabinnnnwongism/Wongtool.git
cd Wongtool

# Install dependencies
npm install

# Run the Electron desktop client
npm start

# Or run in browser mode
npm run dev
```

---

## Testing & Contact

For closed testing builds, architecture inquiries, or developer evaluation:  
📩 **Email**: [technicallyprsent@gmail.com](mailto:technicallyprsent@gmail.com)

---

## License

This project is licensed under the [MIT License](LICENSE).
