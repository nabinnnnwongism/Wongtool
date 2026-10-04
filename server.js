const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const cache = new Map();
const cacheFor = 60_000;

// SQLite Database for Library (Showcase Mode)
let Database = null;
let db = null;
let memoryGames = [];
let memorySettings = new Map();

try {
  Database = require("better-sqlite3");
  const userDataDir = process.env.APPDATA 
    ? path.join(process.env.APPDATA, "PowerplayShowcase")
    : path.join(os.homedir(), ".powerplay-showcase");
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "biblioteca.db");
  db = new Database(dbPath);
  initDatabase(db);
  console.log("✅ Powerplay Showcase SQLite initialized at:", dbPath);
} catch (e) {
  console.warn("⚠️ SQLite fallback to in-memory storage:", e.message);
}

function initDatabase(sqliteDb) {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS juegos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      steam_id INTEGER,
      igdb_id INTEGER,
      cover TEXT,
      hero TEXT,
      logo TEXT,
      banner TEXT,
      exe_path TEXT,
      install_dir TEXT,
      launch_type TEXT DEFAULT 'steam',
      provider TEXT DEFAULT 'Steam',
      horas REAL DEFAULT 0,
      last_played TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

// Detect local Steam installation path
function detectSteamPath() {
  const custom = getSetting("steam_path");
  if (custom && fs.existsSync(custom)) return custom;

  const candidates = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    "D:\\Steam",
    "E:\\Steam"
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "C:\\Program Files (x86)\\Steam";
}

function getSetting(key, defaultValue = "") {
  if (db) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? row.value : defaultValue;
    } catch (_) {}
  }
  return memorySettings.get(key) || defaultValue;
}

function setSetting(key, value) {
  if (db) {
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
      return true;
    } catch (_) {}
  }
  memorySettings.set(key, String(value));
  return true;
}

async function steamJson(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < cacheFor) return cached.value;
  const response = await fetch(url, {
    headers: { "User-Agent": "PowerplayGameLibrary/1.0 (local Steam catalog viewer)" },
  });
  if (!response.ok) throw new Error(`Steam responded with ${response.status}`);
  const value = await response.json();
  cache.set(url, { at: Date.now(), value });
  return value;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// ── Showcase Mode Injection Engine ───────────────────────────────────────────
// Simulates manifest ingestion using real Steam store metadata without downloading
// or writing unauthorized binaries to the user's computer.
async function injectSteamAppIdShowcase({ appId }) {
  const id = String(appId || "").trim();
  if (!id || !/^\d+$/.test(id)) throw new Error("Invalid numeric Steam App ID.");

  let gameName = `Steam App ${id}`;
  let gameCover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900_2x.jpg`;
  let gameHero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`;
  let gameDesc = "Steam game record verified in Showcase Mode.";

  try {
    const details = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en`);
    if (details?.[id]?.success && details[id].data) {
      const data = details[id].data;
      gameName = data.name || gameName;
      gameHero = data.background || gameHero;
      gameDesc = data.short_description || gameDesc;
    }
  } catch (_) {}

  // Save to SQLite Library DB
  if (db) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO juegos (id, nombre, steam_id, cover, hero, launch_type, provider, last_played)
        VALUES (?, ?, ?, ?, ?, 'steam', 'SteamTool', datetime('now'))
      `).run(id, gameName, Number(id), gameCover, gameHero);
    } catch (dbErr) {
      console.warn("DB save warning:", dbErr.message);
    }
  } else {
    memoryGames.unshift({ id, nombre: gameName, steam_id: Number(id), cover: gameCover, hero: gameHero, provider: 'SteamTool' });
  }

  return {
    ok: true,
    repo: "Showcase Simulated Repository",
    appId: id,
    name: gameName,
    cover: gameCover,
    description: gameDesc,
    manifestsFound: true
  };
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    }).end();
    return;
  }

  const params = url.searchParams;

  try {
    // 1. Steam Proxy Routes (Live Valve API)
    if (url.pathname === "/api/charts/most-played") {
      const input = encodeURIComponent(JSON.stringify({
        context: { language: "english", country_code: "US" },
        data_request: { include_basic_info: true, include_assets: true, include_release: true },
      }));
      return sendJson(res, 200, await steamJson(`https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/?input_json=${input}`));
    }
    if (url.pathname === "/api/store/categories") {
      return sendJson(res, 200, await steamJson("https://store.steampowered.com/api/featuredcategories/?cc=us&l=en"));
    }
    if (url.pathname === "/api/store/search") {
      const term = params.get("term")?.trim();
      if (!term) return sendJson(res, 400, { error: "A search term is required." });
      return sendJson(res, 200, await steamJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=en&cc=us`));
    }
    if (url.pathname === "/api/store/details") {
      const appids = params.get("appids")?.replace(/[^0-9,]/g, "");
      if (!appids) return sendJson(res, 400, { error: "One or more app IDs are required." });
      return sendJson(res, 200, await steamJson(`https://store.steampowered.com/api/appdetails?appids=${appids}&cc=us&l=en`));
    }

    // 2. SteamTool Showcase Routes
    if (url.pathname === "/api/steamtools/add") {
      const body = await readBody(req);
      const appId = body.appId || params.get("appId");
      const result = await injectSteamAppIdShowcase({ appId });
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/steamtools/remove") {
      const body = await readBody(req);
      const appId = body.appId || params.get("appId");
      if (db) {
        try { db.prepare("DELETE FROM juegos WHERE id = ? OR steam_id = ?").run(String(appId), Number(appId)); } catch (_) {}
      }
      return sendJson(res, 200, { ok: true, removed: appId });
    }

    if (url.pathname === "/api/steamtools/status") {
      const sp = params.get("steamPath") || detectSteamPath();
      return sendJson(res, 200, { ok: true, installed: true, steamPath: sp });
    }

    if (url.pathname === "/api/steamtools/install" && req.method === "POST") {
      return sendJson(res, 200, { ok: true, message: "Showcase mode: Steam hook simulated successfully." });
    }

    if (url.pathname === "/api/system/restart-steam") {
      return sendJson(res, 200, { ok: true, message: "Showcase mode: Steam restart simulated." });
    }

    if (url.pathname === "/api/system/detect-steam-path") {
      return sendJson(res, 200, { steamPath: detectSteamPath() });
    }

    if (url.pathname === "/api/system/detect-game-folder") {
      const name = params.get("name") || "Game";
      const steamBase = detectSteamPath();
      const detectedPath = path.join(steamBase, "steamapps", "common", name);
      return sendJson(res, 200, { ok: true, found: true, path: detectedPath, folderName: name, matchedBy: "showcase" });
    }

    // 3. Bypass Routes
    if (url.pathname === "/api/bypass/games") {
      const DATA_JSON_URL = "https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json";
      try {
        const resp = await fetch(DATA_JSON_URL + "?v=" + Date.now());
        const data = await resp.json();
        return sendJson(res, 200, { ok: true, data });
      } catch (err) {
        return sendJson(res, 200, { ok: true, data: {} });
      }
    }

    if (url.pathname === "/api/bypass/images") {
      const appid = String(params.get("appid") || "").trim();
      const defaultHero = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`;
      const defaultCover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
      const defaultLogo = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/logo.png`;
      return sendJson(res, 200, { ok: true, hero: defaultHero, cover: defaultCover, logo: defaultLogo });
    }

    if (url.pathname === "/api/fixes/apply") {
      return sendJson(res, 200, { ok: true, message: "Showcase Mode: Bypass simulated successfully!", files: ["showcase_fix.dll"] });
    }

    // 4. Library DB Routes
    if (url.pathname === "/api/library/games") {
      if (db) {
        try {
          const games = db.prepare("SELECT * FROM juegos ORDER BY created_at DESC").all();
          return sendJson(res, 200, { ok: true, games });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      return sendJson(res, 200, { ok: true, games: memoryGames });
    }

    if (url.pathname === "/api/library/add") {
      const body = await readBody(req);
      const { id, name, steam_id, cover, hero, provider } = body;
      if (!id || !name) return sendJson(res, 400, { error: "id and name are required." });

      if (db) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO juegos (id, nombre, steam_id, cover, hero, provider, launch_type, last_played)
            VALUES (?, ?, ?, ?, ?, ?, 'steam', datetime('now'))
          `).run(String(id), name, steam_id ? Number(steam_id) : null, cover || "", hero || "", provider || "Custom");
          return sendJson(res, 200, { ok: true, id, name });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      memoryGames.unshift({ id, nombre: name, steam_id: Number(steam_id), cover, hero, provider });
      return sendJson(res, 200, { ok: true, id, name });
    }

    if (url.pathname === "/api/library/remove") {
      const body = await readBody(req);
      const id = body.id || params.get("id");
      if (db) {
        try { db.prepare("DELETE FROM juegos WHERE id = ?").run(String(id)); } catch (_) {}
      }
      return sendJson(res, 200, { ok: true, id });
    }

    // 5. Settings Routes
    if (url.pathname === "/api/settings/get") {
      const settings = {
        steam_path: getSetting("steam_path", detectSteamPath()),
        download_path: getSetting("download_path", "C:\\Powerplay Games"),
        language: getSetting("language", "en"),
        mando_icon: getSetting("mando_icon", "xbox"),
        include_manifests: getSetting("include_manifests", "true") !== "false"
      };
      return sendJson(res, 200, { ok: true, settings });
    }

    if (url.pathname === "/api/settings/save") {
      const body = await readBody(req);
      for (const [k, v] of Object.entries(body)) {
        setSetting(k, v);
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "Unknown API route." });
  } catch (error) {
    return sendJson(res, 500, { error: "Server error", detail: error.message });
  }
}

async function serveFile(url, res) {
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = path.resolve(root, `.${requestPath}`);
  if (!target.startsWith(root + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await fsp.readFile(target);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    return serveFile(url, res);
  });
}

function startServer(customPort = port) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.listen(customPort, () => {
      console.log(`⚡ Wong Showcase is running at http://localhost:${customPort}`);
      resolve(server);
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${customPort} in use, trying ${customPort + 1}`);
        resolve(startServer(customPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, createServer };
