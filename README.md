# Wong — The Ultimate Game Launcher & Library Hub

> **A next-generation, cinematic desktop gaming hub and library manager crafted with Electron, Vanilla CSS, and Node.js.**  
> Built with Bento grid layout principles, dynamic atmospheric illumination, real-time Steam catalog discovery, and integrated community bypass pipelines.

---

> [!IMPORTANT]
> ### ⚠️ PUBLIC REPOSITORY NOTICE: SHOWCASE ONLY
> **Cloning or downloading this repository will NOT provide an operational game downloader or cracking tool.**
> 
> This public repository contains only the **Frontend Design System, Desktop UI, and Application Architecture**. All proprietary hook binaries, native injection DLLs, and private upstream repository endpoints have been deliberately stripped to maintain safety and compliance.
> 
> 📩 **Interested in testing or evaluating the functional build?**  
> Send an email inquiry to: **[technicallyprsent@gmail.com](mailto:technicallyprsent@gmail.com)**

---

## ⚡ Core Engine Capabilities

### 1. Live SteamTool Integration
* **Instant Library Ingestion**: The ability to add any Steam App ID or game title directly into your personal launcher library.
* **Zero-Restart Live Injection**: Unlike conventional Steam tools that require force-terminating and rebooting the Steam client, Wong’s runtime hooks work **live**. Entitlements and manifests are injected dynamically without interrupting active Steam sessions.

### 2. Bypass & Scene Fix Repository
* **Curated Publisher Archives**: Seamless access to game fixes, compatibility layers, and bypasses across major ecosystems (Electronic Arts, Ubisoft, Rockstar, Denuvo, PlayStation, and standalone PC releases).
* **Powered by Premier Scene Releases**: Curated and verified releases engineered by top-tier scene groups and crackers including **Voices38**, **RUNE**, **EMPRESS**, **FCKDRM**, **TENOKE**, and community reverse engineers.

---

## 🔬 In Development & Early Access Features

### 1. Automated Denuvo Offline Activator *(Early Access)*
For anticipated or high-security releases that lack traditional cracks, Wong incorporates an automated Denuvo offline token provisioning pipeline:

* **How It Works**:
  1. Navigate to **Offline Activation** within Wong.
  2. Select from the curated catalog of active game token pools.
  3. **Instant Token Deployment**: If a token slot is available, Wong automatically retrieves and configures the token directly inside your local game installation directory—launch the `.exe` directly and play completely offline.
  4. **Smart Queue System**: If token capacity is currently exhausted, your client is placed in an automated priority queue. Once a slot opens, the Wong background service receives the token, automatically installs it into your target game directory, and notifies you when ready.
* **Early Access Advisory**:  
  *This is an experimental early-access feature with limited daily allocation. Queue slots are time-sensitive; if your client is offline or inactive when your queue window opens, your token reservation may expire to allow the next user in line.*

### 2. Hypervisor (HV) Bypass Injection *(Active R&D)*
* An advanced hypervisor-level bypass subsystem currently in research and development.
* **Goal**: Deliver a transparent, one-click HV injection layer that executes securely without requiring cumbersome OS modifications, custom boot parameters, or risky manual environment setups.

---

## ✨ Interface & Aesthetic Features

* **🍱 Dynamic Bento Grid Library**: Clean, modular cards presenting high-resolution official Steam 600×900 2x vertical game capsules.
* **🪐 Metallic Orbit Borders**: Interactive rotating conic-gradient micro-animations on focused cards.
* **🔍 Live SteamDB Catalog Navigator**: Real-time debounced search directly querying Valve's official Steam Store API for metadata, genres, and cover assets.
* **🎨 Custom Background & Atmosphere Engine**:
  * Instant toggle between **Black (Obsidian)** and **White (Ivory)** interface atmospheres.
  * Local image & animated GIF background customizer stored in browser **IndexedDB**, with real-time controls for opacity (0–60%), white wash, color wash, and custom tints.
* **🧭 Parabolic Curved Sidebar**: Glossy glassmorphic navigation rail with custom glyphs and hover scene reveals.
* **🪟 Frameless Electron Window**: Custom titlebar drag region with integrated minimize, maximize/restore, and close buttons.
* **🧙 Interactive Setup Wizard**: Guided 4-step glassmorphic onboarding modal for verifying paths and configuring settings.
* **💾 Local SQLite Persistence**: High-performance local library storage powered by `better-sqlite3`.

---

## 🛠️ Tech Stack

* **Runtime:** [Electron](https://www.electronjs.org/) (Frameless Desktop Container)
* **Backend:** Node.js (Embedded HTTP microservice & SQLite storage)
* **Database:** SQLite (`better-sqlite3`)
* **Frontend:** Vanilla HTML5, Vanilla JavaScript (ES Modules, SPA Router)
* **Styling:** Vanilla CSS with Design Tokens, Glassmorphism, and CSS Grid
* **Icons:** [Lucide Icons](https://lucide.dev/) + Custom UI vector marks

---

## 🚀 Quick Start (Showcase Edition)

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* npm or yarn

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/wong-desktop.git
   cd wong-desktop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Launch the desktop application:**
   ```bash
   npm start
   ```

   *Alternatively, run in browser development mode:*
   ```bash
   npm run dev
   ```
   Then open `http://localhost:4173` in your browser.

---

## 🛡️ Architecture & Security Disclaimer

This repository contains only the **Frontend Design System, User Interface, and Simulated Architecture**. 

To maintain compliance and system safety:
* Third-party injection binaries and runtime hook DLLs (`dwmapi.dll`, `OpenSteamTool.dll`) are omitted.
* The application runs in **Showcase Mode**: catalog queries and metadata are retrieved live from Valve's official Steam Store API, while file ingestion and patch states are safely simulated through local SQLite records.

---

## 📬 Contact & Testing Requests

For closed beta testing, inquiries, or evaluations:  
📧 **Email:** [technicallyprsent@gmail.com](mailto:technicallyprsent@gmail.com)

---

## 📄 License

This project is distributed under the [MIT License](LICENSE).
