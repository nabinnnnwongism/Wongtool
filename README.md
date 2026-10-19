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

## The games that have bypasses inbuilt from the app

Wong includes integrated bypass definitions and auto-detection for titles protected by third-party DRM (Denuvo, Ubisoft Connect, EA app, Rockstar Games Launcher, etc.). Below is the complete catalog of supported games grouped by category:

<details open>
<summary><b>UBISOFT (41 Games)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `33230` | Assassin's Creed II |
| `33440` | Driver San Francisco |
| `48190` | Assassin's Creed Brotherhood |
| `201870` | Assassins Creed Revelations |
| `208480` | Assassin's Creed III |
| `220240` | Far Cry 3 |
| `233270` | Far Cry® 3 Blood Dragon |
| `235600` | Tom Clancy's Splinter Cell Blacklist |
| `241560` | The Crew |
| `242050` | Assassin's Creed IV Black Flag |
| `242550` | Rayman Legends |
| `243470` | Watch_Dogs |
| `289650` | Assassins Creed Unity |
| `298110` | Far Cry 4 |
| `311560` | Assassin's Creed Rogue |
| `354380` | Assassins Creed Chronicles China |
| `359610` | Assassin's Creed Chronicles India |
| `368500` | Assassin's Creed Syndicate |
| `371660` | Far Cry Primal |
| `446560` | Just Dance 2017 |
| `447040` | Watch_Dogs 2 |
| `460920` | Steep |
| `460930` | Tom Clancy's Ghost Recon Wildlands |
| `488790` | South Park The Fractured But Whole |
| `552520` | Far Cry 5 |
| `582160` | Assassins Creed Origins |
| `646910` | The Crew 2 |
| `812140` | Assassins Creed Odyssey |
| `911400` | Assassins Creed III Remastered |
| `916440` | Anno 1800 |
| `939960` | Far Cry New Dawn |
| `2208920` | Assassin's Creed Valhalla |
| `2239550` | Watch Dogs: Legion |
| `2290180` | Riders Republic |
| `2698940` | The Crew Motorfest |
| `2751000` | Prince of Persia The Lost Crown |
| `2840770` | Avatar: Frontiers of Pandora |
| `2842040` | Star Wars Outlaws |
| `3035570` | Assassin's Creed Mirage |
| `3159330` | Assassin's Creed Shadows |
| `3751950` | Assassin's Creed Black Flag Resynced |

</details>

<details open>
<summary><b>EA (37 Games)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `17410` | Mirror's Edge |
| `47870` | Need for Speed Hot Pursuit |
| `1134570` | F1 2021 |
| `1172380` | STAR WARS Jedi La Orden caída |
| `1222670` | The Sims 4 |
| `1222680` | Need for Speed Heat |
| `1222700` | A Way Out |
| `1225560` | Unravel |
| `1225570` | Unravel 2 |
| `1233570` | Mirror's Edge Catalyst |
| `1237950` | STAR WARS Battlefront II |
| `1238820` | Battlefield 3 |
| `1238840` | Battlefield 1 |
| `1238860` | Battlefield 4 |
| `1238880` | Battlefield™ Hardline |
| `1262560` | Need for Speed Most Wanted |
| `1262580` | Need for Speed Payback |
| `1262600` | Need For Speed Rivals |
| `1313860` | EA SPORTS FIFA 21 |
| `1328660` | Need for Speed Hot Pursuit Remastered |
| `1426210` | It Takes Two |
| `1506830` | FIFA 22 |
| `1692250` | F1 2022 |
| `1693980` | Dead Space |
| `1774580` | STAR WARS Jedi La Orden caída |
| `1811260` | FIFA 23 |
| `1846380` | Need for Speed Unbound |
| `1938010` | WILD HEARTS |
| `2001120` | Unravel 2 |
| `2669320` | EA SPORTS FC 25 |
| `2807960` | Battlefield 6 |
| `3059520` | F1 25 |
| `3405690` | EA SPORTS FC 26 |
| `3654560` | Plants vs Zombies Replanted |
| `3940610` | EA SPORTS™ Madden NFL 27 |
| `4032350` | EA SPORTS™ College Football 27 |
| `4080220` | EA SPORTS FC™ 27 |

</details>

<details open>
<summary><b>ROCKSTAR (11 Games)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `12200` | Bully: Scholarship Edition |
| `12210` | Grand Theft Auto IV: The Complete Edition |
| `110800` | L.A. Noire |
| `204100` | Max Payne 3 |
| `271590` | Grand Theft Auto V Legacy |
| `1174180` | Red Dead Redemption 2 |
| `1546970` | Grand Theft Auto III - The Definitive Edition |
| `1546990` | Grand Theft Auto: Vice City - The Definitive Edition |
| `1547000` | Grand Theft Auto San Andreas - The Definitive Edition |
| `2668510` | Red Dead Redemption |
| `3240220` | Grand Theft Auto V Enhanced |

</details>

<details open>
<summary><b>DENUVO (45 Games)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `39140` | FINAL FANTASY VII |
| `225540` | Just Cause 3 |
| `234140` | Mad Max |
| `287700` | METAL GEAR SOLID V: THE PHANTOM PAIN |
| `312660` | Sniper Elite 4 |
| `356190` | Middle-earth™: Shadow of War™ |
| `493340` | Planet Coaster |
| `517630` | Just Cause 4 |
| `532210` | Life is Strange 2 |
| `594570` | Total War: WARHAMMER II |
| `637100` | Sonic Forces™ |
| `668580` | Atomic Heart |
| `678950` | DRAGON BALL FighterZ |
| `700600` | Evil Genius 2 |
| `779340` | Total War: THREE KINGDOMS |
| `785260` | Team Sonic Racing™ |
| `801800` | Atomfall™ |
| `953580` | Tourist Bus Simulator |
| `990080` | Hogwarts Legacy |
| `1100600` | Football Manager 2020 |
| `1113000` | Persona 4 Golden |
| `1222690` | Dragon Age™ Inquisition |
| `1237320` | Sonic Frontiers |
| `1244460` | Jurassic World Evolution 2 |
| `1382330` | Persona 5 Strikers |
| `1490890` | Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles |
| `1687950` | Persona 5 Royale |
| `1874000` | Life is Strange Double Exposure |
| `1904540` | Football Manager 2023 |
| `1941540` | Mafia: The Old Country |
| `1971870` | Mortal Kombat 1 |
| `2050650` | Resident Evil 4 Remake |
| `2055290` | Sonic Colors: Ultimate™ |
| `2161700` | Persona 3 Reload |
| `2215200` | LEGO® Batman™: Legacy of the Dark Knight |
| `2358720` | Black Myth: Wukong |
| `2680010` | The First Berserker: Khazan |
| `2928600` | Demon Slayer -Kimetsu no Yaiba- The Hinokami Chronicles 2 |
| `3017860` | DOOM: The Dark Ages |
| `3321460` | Crimson Desert |
| `3357650` | PRAGMATA |
| `3483510` | The Adventures of Elliot: The Millennium Tales |
| `3489700` | Stellar Blade |
| `3764200` | Resident Evil Requiem |
| `3768760` | 007 First Light |

</details>

<details open>
<summary><b>PlayStation (1 Game)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `2428810` | LEGO® Horizon Adventures™ |

</details>

<details open>
<summary><b>OTHERS (35 Games)</b></summary>

| App ID | Game Title |
| :--- | :--- |
| `7940` | Call of Duty 4 Modern Warfare |
| `10180` | Call of Duty Modern Warfare 2 |
| `42700` | Call of Duty Black Ops |
| `50130` | Mafia II |
| `115300` | Call of Duty Modern Warfare 3 |
| `202970` | Call of Duty Black Ops II |
| `203140` | Hitman: Absolution |
| `209160` | Call of Duty Ghosts |
| `224060` | Deadpool |
| `255480` | NBA 2K14 |
| `292730` | Call of Duty Infinite Warfare |
| `311210` | Call of Duty Black Ops III |
| `752590` | A Plague Tale: Innocence |
| `782330` | DOOM Eternal |
| `939850` | The Dark Pictures Anthology: Man of Medan |
| `1114150` | CarX Street |
| `1250410` | Microsoft Flight Simulator (2020) |
| `1401590` | Disney Dreamlight Valley |
| `1466860` | Age of Empires IV: Anniversary Edition |
| `1498570` | THE KING OF FIGHTERS XV |
| `1659040` | HITMAN World of Assassination |
| `1985810` | Call of Duty Black Ops Cold War |
| `2000950` | Call of Duty Modern Warfare (2019) |
| `2054970` | Dragon's Dogma 2 |
| `2172910` | CAPTAIN TSUBASA 2: WORLD FIGHTERS |
| `2373990` | Solo Leveling: ARISE OVERDRIVE |
| `2399420` | Le Mans Ultimate |
| `2806050` | Halo: Campaign Evolved |
| `2933620` | Call of Duty Black Ops 6 |
| `3010850` | Gears of War: E-Day |
| `3265250` | MindsEye |
| `3595230` | Call of Duty: Modern Warfare II |
| `3595270` | Call of Duty: Modern Warfare III |
| `4356430` | NBA 2K27 |
| `4435490` | Call of Duty®: Modern Warfare® 4 |

</details>

> **Total Verified Bypasses Cataloged:** 170 games across all platforms and DRM layers.


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
