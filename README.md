# Wong — The Ultimate Game Launcher & Library Hub

> **A modern, cinematic desktop gaming hub and library manager crafted with Electron, Vanilla CSS, and Node.js.**  
> Designed with Bento grid architecture, glassmorphic atmospheric lighting, and real-time Steam catalog exploration.

---

## ✨ Features & Highlights

* **🍱 Dynamic Bento Grid Library**: Clean, modular card layout rendering high-definition official Steam 600×900 2x vertical game posters.
* **🪐 Metallic Orbit Borders**: Custom rotating conic-gradient micro-animations on interactive cards.
* **🔍 Live SteamDB Catalog Navigator**: Real-time debounced search directly querying Valve's official Steam Store API for metadata, genres, and artwork.
* **🎨 Custom Background & Atmosphere Engine**:
  * Seamlessly toggle between **Black (Obsidian)** and **White (Ivory)** interface atmospheres.
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

## 🚀 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* npm or yarn

### Installation

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

## 🛡️ Architecture & Showcase Note

This repository contains the complete **User Interface, Frontend Design System, and Desktop Architecture**. 

To maintain compliance and system safety:
* External third-party injection binaries and runtime hook DLLs are omitted.
* The application runs in **Showcase Mode**: catalog queries and metadata are retrieved live from Valve's official Steam Store API, while file ingestion and patch states are safely simulated through local SQLite records.

---

## 📄 License

This project is distributed under the [MIT License](LICENSE).
