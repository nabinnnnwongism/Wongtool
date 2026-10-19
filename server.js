const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, exec } = require("node:child_process");
const { URL } = require("node:url");
const extract = require("extract-zip");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const cache = new Map();
const cacheFor = 60_000;

// SQLite Database for Library
let Database = null;
let db = null;
try {
  Database = require("better-sqlite3");
  const userDataDir = process.env.APPDATA 
    ? path.join(process.env.APPDATA, "Powerplay")
    : path.join(os.homedir(), ".powerplay");
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "biblioteca.db");
  db = new Database(dbPath);
  initDatabase(db);
  console.log("✅ Powerplay SQLite Library database initialized at:", dbPath);
} catch (e) {
  console.warn("⚠️ SQLite fallback to JSON storage:", e.message);
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

  // Migrate any existing library covers that used the horizontal banner (header.jpg) to the official 600x900 vertical poster
  try {
    sqliteDb.exec(`
      UPDATE juegos 
      SET cover = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/' || COALESCE(steam_id, id) || '/library_600x900_2x.jpg'
      WHERE (cover LIKE '%header.jpg%' OR cover LIKE '%header_image%' OR cover IS NULL OR cover = '') 
        AND (steam_id IS NOT NULL OR (id GLOB '[0-9]*'));
    `);
  } catch (_) {}
}

// Repositories used by LightningTools / SteamTool
const STEAM_MANIFEST_REPOS = [
  "https://github.com/LightnigFast/ProjectLightningManifests",
  "https://github.com/SPIN0ZAi/SB_manifest_DB",
  "https://github.com/dvahana2424-web/sojogamesdatabase1",
  "https://github.com/hammerwebsite12/sojogames2",
  "https://github.com/SteamAutoCracks/ManifestHub",
];

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
  try {
    const custom = getSetting("steam_path");
    if (custom && fs.existsSync(custom)) return custom;
  } catch (_) {}

  const candidates = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    "D:\\Program Files (x86)\\Steam",
    "D:\\Program Files\\Steam",
    "C:\\Steam",
    "D:\\Steam",
    "E:\\Steam"
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "C:\\Program Files (x86)\\Steam";
}

function normalizeForMatch(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[®™©_:'"\-\.\,\(\)\[\]\!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function detectGameFolder(gameName, appId) {
  const commonLocations = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common",
    "C:\\Program Files\\Steam\\steamapps\\common",
    "D:\\Steam\\steamapps\\common",
    "D:\\SteamLibrary\\steamapps\\common",
    "E:\\Steam\\steamapps\\common",
    "E:\\SteamLibrary\\steamapps\\common",
  ];

  const detectedBase = detectSteamPath();
  if (detectedBase) {
    const customCommon = path.join(detectedBase, "steamapps", "common");
    if (!commonLocations.includes(customCommon)) {
      commonLocations.unshift(customCommon);
    }
  }

  // 1. Check Steam appmanifest_<appid>.acf for exact installdir if appId provided
  if (appId && /^\d+$/.test(String(appId).trim())) {
    const cleanId = String(appId).trim();
    for (const commonLoc of commonLocations) {
      const steamappsDir = path.dirname(commonLoc);
      const manifestPath = path.join(steamappsDir, `appmanifest_${cleanId}.acf`);
      try {
        if (fs.existsSync(manifestPath)) {
          const content = await fsp.readFile(manifestPath, "utf8");
          const m = content.match(/"installdir"\s+"([^"]+)"/i);
          if (m && m[1]) {
            const resolvedPath = path.join(commonLoc, m[1]);
            if (fs.existsSync(resolvedPath)) {
              return { found: true, path: resolvedPath, folderName: m[1], matchedBy: "appmanifest" };
            }
          }
        }
      } catch (_) {}
    }
  }

  // 2. Scan directories in C:\Program Files (x86)\Steam\steamapps\common and other common locations
  const targetNorm = normalizeForMatch(gameName);
  const targetStrict = targetNorm.replace(/\s+/g, '');

  for (const commonLoc of commonLocations) {
    try {
      if (!fs.existsSync(commonLoc)) continue;
      const entries = await fsp.readdir(commonLoc, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      // A. Exact match (case-insensitive)
      for (const d of dirs) {
        if (d.toLowerCase() === String(gameName).trim().toLowerCase()) {
          return { found: true, path: path.join(commonLoc, d), folderName: d, matchedBy: "exact" };
        }
      }

      // B. Normalized match (punctuation and spacing ignored)
      for (const d of dirs) {
        if (normalizeForMatch(d) === targetNorm) {
          return { found: true, path: path.join(commonLoc, d), folderName: d, matchedBy: "normalized" };
        }
      }

      // C. Strict alphanumeric match (e.g. MirrorsEdge matching Mirror's Edge)
      if (targetStrict.length >= 3) {
        for (const d of dirs) {
          const dStrict = normalizeForMatch(d).replace(/\s+/g, '');
          if (dStrict && (dStrict === targetStrict || dStrict.includes(targetStrict) || targetStrict.includes(dStrict))) {
            return { found: true, path: path.join(commonLoc, d), folderName: d, matchedBy: "fuzzy" };
          }
        }
      }
    } catch (_) {}
  }

  return {
    found: false,
    path: null,
    defaultSearchPath: "C:\\Program Files (x86)\\Steam\\steamapps\\common"
  };
}

function getSetting(key, defaultValue = "") {
  if (db) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? row.value : defaultValue;
    } catch (_) {}
  }
  return defaultValue;
}

function setSetting(key, value) {
  if (db) {
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
      return true;
    } catch (_) {}
  }
  return false;
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

// SteamTool Implementation (Manifests & Lua injection)
async function downloadZip(url, outPath) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Powerplay-SteamTool",
      "accept": "application/zip,application/octet-stream,*/*",
    },
  }).catch(() => null);

  if (!res || !res.ok) return false;
  const ab = await res.arrayBuffer();
  await fsp.writeFile(outPath, Buffer.from(ab));
  return true;
}

async function walkFiles(rootDir) {
  const results = [];
  async function walk(current) {
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch { return; }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) results.push(full);
    }
  }
  await walk(rootDir);
  return results;
}

function writeFilteredLines(srcText, { keepLine }) {
  const out = [];
  for (const rawLine of String(srcText).split(/\r?\n/)) {
    if (keepLine(rawLine)) out.push(rawLine);
  }
  out.push("", "-- Powered by Powerplay⚡");
  return out.join("\n");
}

async function processExtractedRepoFiles(extractDir, repoUrl, pluginFolder, configDepotCacheFolder, luaFolder, rootDepotCacheFolder, includeManifests) {
  const files = await walkFiles(extractDir);
  const repoTag = String(repoUrl);

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (!fileName) continue;

    const lower = fileName.toLowerCase();
    const isLua = lower.endsWith(".lua");
    const isManifest = lower.endsWith(".manifest");

    if (isManifest && includeManifests) {
      await fsp.copyFile(filePath, path.join(configDepotCacheFolder, fileName)).catch(() => {});
      if (rootDepotCacheFolder) {
        await fsp.copyFile(filePath, path.join(rootDepotCacheFolder, fileName)).catch(() => {});
      }
      continue;
    }

    if (isLua) {
      const src = await fsp.readFile(filePath, "utf8").catch(() => "");
      let filtered = src;
      if (repoTag.includes("SPIN0ZAi")) {
        filtered = writeFilteredLines(src, {
          keepLine: (line) => {
            const l = String(line).trimStart();
            return l.startsWith("addappid(") || l.startsWith("adddlc(") || (includeManifests && l.startsWith("setManifestid("));
          },
        });
      } else {
        filtered = writeFilteredLines(src, {
          keepLine: (line) => includeManifests || !/setmanifest/i.test(String(line)),
        });
      }

      await fsp.writeFile(path.join(pluginFolder, fileName), filtered, "utf8").catch(() => {});
      if (luaFolder) {
        await fsp.writeFile(path.join(luaFolder, fileName), filtered, "utf8").catch(() => {});
      }
    }
  }
}

function getSteamToolsAssetsDir() {
  const candidates = [];

  // 1. Packaged Electron extraResources (Real physical disk path outside app.asar)
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "steamtools_assets"));
  }

  // 2. Parent of app.asar (resources folder)
  if (__dirname.includes("app.asar")) {
    const resDir = path.dirname(__dirname.replace(/\\app\.asar.*/, ""));
    candidates.push(path.join(resDir, "steamtools_assets"));
    candidates.push(path.join(process.resourcesPath || "", "steamtools_assets"));
  }

  // 3. Execution and dev paths
  candidates.push(path.join(process.cwd(), "steamtools_assets"));
  candidates.push(path.join(__dirname, "steamtools_assets"));
  candidates.push(path.join(__dirname, "..", "steamtools_assets"));

  // First pass: Prioritize paths that are NOT inside an asar archive
  for (const c of candidates) {
    if (!c.includes("app.asar") && fs.existsSync(c)) {
      return c;
    }
  }

  // Fallback for dev mode
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function isSteamToolsInstalled(steamPath) {
  const p = String(steamPath || detectSteamPath()).trim();
  const dwmapi = path.join(p, "dwmapi.dll");
  const opensteamtool = path.join(p, "opensteamtool");
  return fs.existsSync(dwmapi) && fs.existsSync(opensteamtool);
}

async function closeSteamIfRunning() {
  if (process.platform !== "win32") return;
  return new Promise((resolve) => {
    exec("taskkill /F /IM steam.exe", () => resolve());
  });
}

async function copyDirectory(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, dstPath);
    } else {
      await fsp.copyFile(srcPath, dstPath);
    }
  }
}

async function installSteamToolsHook(targetSteamPath) {
  const steamPath = String(targetSteamPath || detectSteamPath()).trim();
  const assetsDir = getSteamToolsAssetsDir();
  if (!assetsDir) {
    throw new Error("SteamTools runtime assets directory could not be located.");
  }

  if (!fs.existsSync(steamPath)) {
    await fsp.mkdir(steamPath, { recursive: true });
  }

  // 1. Safely terminate Steam if it's currently running
  await closeSteamIfRunning();

  // 2. Remove obsolete or conflicting legacy files
  try { await fsp.rm(path.join(steamPath, "steam.cfg"), { force: true }); } catch (_) {}
  try { await fsp.rm(path.join(steamPath, "hid.dll"), { force: true }); } catch (_) {}

  // 3. Copy hook DLLs
  const dlls = ["dwmapi.dll", "OpenSteamTool.dll", "cloud_redirect.dll"];
  for (const dll of dlls) {
    const src = path.join(assetsDir, dll);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, path.join(steamPath, dll));
    }
  }

  // 4. Copy opensteamtool directory recursively
  const srcOst = path.join(assetsDir, "opensteamtool");
  const dstOst = path.join(steamPath, "opensteamtool");
  if (fs.existsSync(srcOst)) {
    if (fsp.cp) {
      await fsp.cp(srcOst, dstOst, { recursive: true, force: true });
    } else {
      await copyDirectory(srcOst, dstOst);
    }
  }

  // 5. Ensure required directories exist
  const dirs = [
    path.join(steamPath, "config", "stplug-in"),
    path.join(steamPath, "config", "lua"),
    path.join(steamPath, "config", "depotcache"),
    path.join(steamPath, "depotcache"),
  ];
  for (const d of dirs) {
    await fsp.mkdir(d, { recursive: true }).catch(() => {});
  }

  console.log(`[SteamTools] Hook installed successfully into ${steamPath}`);
  return { ok: true, steamPath };
}

async function injectSteamAppId({ steamBasePath, appId, includeManifests = true }) {
  const steamPath = String(steamBasePath || detectSteamPath()).trim();
  const id = String(appId || "").trim();
  if (!id || !/^\d+$/.test(id)) throw new Error("Invalid numeric Steam App ID.");

  // Automatic bootstrap: if SteamTools hook is not installed on this PC yet, install it now!
  if (!isSteamToolsInstalled(steamPath)) {
    console.log(`[SteamTools] Steam hook missing in ${steamPath}. Auto-installing...`);
    try {
      await installSteamToolsHook(steamPath);
    } catch (hookErr) {
      console.warn("[SteamTools] Auto-install hook warning:", hookErr.message);
    }
  }

  const pluginFolder = path.join(steamPath, "config", "stplug-in");
  const configDepotCacheFolder = path.join(steamPath, "config", "depotcache");
  const rootDepotCacheFolder = path.join(steamPath, "depotcache");
  const luaFolder = path.join(steamPath, "config", "lua");

  await fsp.mkdir(pluginFolder, { recursive: true }).catch(() => {});
  if (includeManifests) {
    await fsp.mkdir(configDepotCacheFolder, { recursive: true }).catch(() => {});
    await fsp.mkdir(rootDepotCacheFolder, { recursive: true }).catch(() => {});
  }
  await fsp.mkdir(luaFolder, { recursive: true }).catch(() => {});

  let foundRepo = null;
  for (const repo of STEAM_MANIFEST_REPOS) {
    const zipUrl = `${repo}/archive/refs/heads/${id}.zip`;
    const tmpDir = path.join(os.tmpdir(), `powerplay-steamtool-${crypto.randomBytes(6).toString("hex")}`);
    const zipPath = path.join(tmpDir, `${id}.zip`);
    const extractDir = path.join(tmpDir, "extract");

    try {
      await fsp.mkdir(tmpDir, { recursive: true });
      await fsp.mkdir(extractDir, { recursive: true });

      const ok = await downloadZip(zipUrl, zipPath);
      if (!ok) {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        continue;
      }

      await extract(zipPath, { dir: extractDir });
      await processExtractedRepoFiles(
        extractDir,
        repo,
        pluginFolder,
        configDepotCacheFolder,
        luaFolder,
        rootDepotCacheFolder,
        includeManifests
      );

      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      foundRepo = repo;
      break;
    } catch (e) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Always guarantee that a valid SteamTools Lua ticket exists for this AppID
  const pluginLua = path.join(pluginFolder, `${id}.lua`);
  const configLua = path.join(luaFolder, `${id}.lua`);
  if (!fs.existsSync(pluginLua)) {
    const defaultLua = `addappid(${id})\n-- Powered by Wong⚡\n`;
    await fsp.writeFile(pluginLua, defaultLua, "utf8").catch(() => {});
  }
  if (!fs.existsSync(configLua)) {
    const defaultLua = `addappid(${id})\n-- Powered by Wong⚡\n`;
    await fsp.writeFile(configLua, defaultLua, "utf8").catch(() => {});
  }

  // Fetch Steam game metadata to return rich object (using official 600x900 vertical poster)
  let gameName = `Steam App ${id}`;
  let gameCover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900_2x.jpg`;
  let gameHero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`;
  let gameDesc = "Steam Tool manifest injected.";

  try {
    const details = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en`);
    if (details?.[id]?.success && details[id].data) {
      const data = details[id].data;
      gameName = data.name || gameName;
      // Note: data.header_image is a landscape banner (header.jpg); keep gameCover as vertical 600x900 2x capsule for Bento cards!
      gameHero = data.background || gameHero;
      gameDesc = data.short_description || gameDesc;
    }
  } catch (_) {}

  // Save to SQLite Library DB if available
  if (db) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO juegos (id, nombre, steam_id, cover, hero, launch_type, provider, last_played)
        VALUES (?, ?, ?, ?, ?, 'steam', 'SteamTool', datetime('now'))
      `).run(id, gameName, Number(id), gameCover, gameHero);
    } catch (dbErr) {
      console.warn("DB save warning:", dbErr.message);
    }
  }

  return {
    ok: true,
    repo: foundRepo,
    appId: id,
    name: gameName,
    cover: gameCover,
    description: gameDesc,
    manifestsFound: Boolean(foundRepo)
  };
}

async function syncSteamToolGames() {
  if (!db) return;
  const steamPath = detectSteamPath();
  if (!steamPath) return;

  const candidateDirs = [
    path.join(steamPath, "config", "stplug-in"),
    path.join(steamPath, "config", "lua")
  ];

  const foundAppIds = new Map();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith(".lua")) continue;
        const m = f.match(/^(\d+)\.lua$/);
        if (!m) continue;
        const appId = m[1];
        if (foundAppIds.has(appId) && foundAppIds.get(appId)?.name) continue;

        let name = null;
        try {
          const content = fs.readFileSync(path.join(dir, f), "utf8");
          const nameMatch = content.match(/addappid\s*\(\s*\d+\s*\)\s*--\s*([^\r\n]+)/i) ||
                            content.match(/^--\s*([^\r\n]+)/m);
          if (nameMatch) {
            const raw = nameMatch[1].trim();
            if (!raw.includes("Depot") && !raw.includes("Powered by") && !raw.includes("Made with love")) {
              name = raw;
            }
          }
        } catch (_) {}

        foundAppIds.set(appId, { name });
      }
    } catch (_) {}
  }

  if (foundAppIds.size === 0) return;

  let existing = new Map();
  try {
    const rows = db.prepare("SELECT id, nombre FROM juegos").all();
    for (const r of rows) existing.set(String(r.id), r.nombre);
  } catch (_) {}

  const toInsert = [];
  const needsNameFetch = [];

  for (const [appId, info] of foundAppIds.entries()) {
    if (!existing.has(appId)) {
      const gameName = info.name || `Steam App ${appId}`;
      const gameCover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;
      const gameHero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`;
      toInsert.push({ id: appId, name: gameName, cover: gameCover, hero: gameHero });
      if (!info.name) {
        needsNameFetch.push(appId);
      }
    } else if (existing.get(appId)?.startsWith("Steam App ") && info.name) {
      try {
        db.prepare("UPDATE juegos SET nombre = ? WHERE id = ?").run(info.name, appId);
      } catch (_) {}
    }
  }

  if (toInsert.length > 0) {
    try {
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO juegos (id, nombre, steam_id, cover, hero, launch_type, provider, last_played)
        VALUES (?, ?, ?, ?, ?, 'steam', 'SteamTool', datetime('now'))
      `);
      const insertMany = db.transaction((games) => {
        for (const g of games) {
          insertStmt.run(g.id, g.name, Number(g.id), g.cover, g.hero);
        }
      });
      insertMany(toInsert);
      console.log(`[Wong Sync] Synced ${toInsert.length} SteamTool games into library database.`);
    } catch (e) {
      console.warn("[Wong Sync] Bulk insert warning:", e.message);
    }
  }

  if (needsNameFetch.length > 0) {
    resolveMissingGameNames(needsNameFetch).catch(() => {});
  }
}

async function resolveMissingGameNames(appIds) {
  if (!db || !appIds || appIds.length === 0) return;
  for (let i = 0; i < appIds.length; i += 5) {
    const batch = appIds.slice(i, i + 5);
    await Promise.all(batch.map(async (id) => {
      try {
        const details = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=en`);
        if (details?.[id]?.data?.name) {
          const resolvedName = details[id].data.name;
          const hero = details[id].data.background || null;
          db.prepare(`
            UPDATE juegos
            SET nombre = ?, hero = COALESCE(?, hero)
            WHERE id = ? AND nombre LIKE 'Steam App %'
          `).run(resolvedName, hero, id);
        }
      } catch (_) {}
    }));
  }
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
    // 1. Steam Proxy Routes
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

    // 2. SteamTool / LightningTools Routes
    if (url.pathname === "/api/steamtools/add") {
      const body = await readBody(req);
      const appId = body.appId || params.get("appId");
      const steamBasePath = body.steamBasePath || params.get("steamBasePath") || detectSteamPath();
      const includeManifests = body.includeManifests !== false;

      const result = await injectSteamAppId({ steamBasePath, appId, includeManifests });
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/steamtools/remove") {
      const body = await readBody(req);
      const appId = body.appId || params.get("appId");
      const steamPath = body.steamBasePath || detectSteamPath();
      if (!appId) return sendJson(res, 400, { error: "appId required" });

      const filesToRemove = [
        path.join(steamPath, "config", "stplug-in", `${appId}.lua`),
        path.join(steamPath, "config", "lua", `${appId}.lua`),
        path.join(steamPath, "config", "depotcache", `${appId}.manifest`),
        path.join(steamPath, "depotcache", `${appId}.manifest`)
      ];

      for (const f of filesToRemove) {
        await fsp.rm(f, { force: true }).catch(() => {});
      }
      if (db) {
        try { db.prepare("DELETE FROM juegos WHERE id = ? OR steam_id = ?").run(String(appId), Number(appId)); } catch (_) {}
      }
      return sendJson(res, 200, { ok: true, removed: appId });
    }

    // SteamTools Hook Management Routes
    if (url.pathname === "/api/steamtools/status") {
      const sp = params.get("steamPath") || detectSteamPath();
      const installed = isSteamToolsInstalled(sp);
      return sendJson(res, 200, { ok: true, installed, steamPath: sp });
    }

    if (url.pathname === "/api/steamtools/install" && req.method === "POST") {
      const body = await readBody(req);
      const sp = body?.steamPath || detectSteamPath();
      try {
        const result = await installSteamToolsHook(sp);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    if (url.pathname === "/api/system/restart-steam") {
      if (process.platform === "win32") {
        const steamExeCandidates = [
          path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam", "Steam.exe"),
          path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Steam", "Steam.exe"),
          "C:\\Steam\\Steam.exe",
          "D:\\Steam\\Steam.exe"
        ];
        const steamExe = steamExeCandidates.find(p => fs.existsSync(p));

        exec("taskkill /f /im steam.exe", () => {
          if (steamExe) {
            exec(`"${steamExe}"`, (err) => {
              if (err) console.error("Error restarting Steam:", err);
            });
          }
        });
        return sendJson(res, 200, { ok: true, message: "Steam restart command initiated." });
      }
      return sendJson(res, 200, { ok: false, message: "Steam restart supported on Windows." });
    }

    if (url.pathname === "/api/system/detect-steam-path") {
      return sendJson(res, 200, { steamPath: detectSteamPath() });
    }

    if (url.pathname === "/api/system/detect-game-folder") {
      const name = params.get("name") || "";
      const appid = params.get("appid") || "";
      if (!name && !appid) {
        return sendJson(res, 400, { ok: false, error: "name or appid required" });
      }
      const detection = await detectGameFolder(name, appid);
      return sendJson(res, 200, { ok: true, ...detection });
    }

    // 3. Bypass Routes
    if (url.pathname === "/api/bypass/games") {
      const DATA_JSON_URL = "https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json";
      try {
        const resp = await fetch(DATA_JSON_URL + "?v=" + Date.now());
        const data = await resp.json();
        return sendJson(res, 200, { ok: true, data });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: "Failed to fetch bypass database.", detail: err.message });
      }
    }

    // DRM detection via Steam Store categories
    if (url.pathname === "/api/bypass/drm-check") {
      const appid = String(params.get("appid") || "").trim();
      if (!appid || !/^\d+$/.test(appid)) {
        return sendJson(res, 400, { ok: false, error: "Valid numeric appid required." });
      }

      // DRM-related Steam category IDs and their human-readable names
      const DRM_CATEGORIES = {
        22:  "Steam DRM",
        18:  "Valve Anti-Cheat (VAC)",
        29:  "Steam Trading Cards",  // not DRM but included for completeness
        // Third-party DRM are NOT in Steam categories — we detect via genres/tags below
      };

      // Known DRM strings found in game descriptions, genres, or categories
      const DRM_KEYWORDS = [
        { key: "denuvo",      label: "Denuvo Anti-Tamper" },
        { key: "easyanticheat", label: "Easy Anti-Cheat (EAC)" },
        { key: "easy anti-cheat", label: "Easy Anti-Cheat (EAC)" },
        { key: "battleye",    label: "BattlEye" },
        { key: "battle eye",  label: "BattlEye" },
        { key: "nprotect",    label: "nProtect GameGuard" },
        { key: "gameguard",   label: "nProtect GameGuard" },
        { key: "securom",     label: "SecuROM" },
        { key: "starforce",   label: "StarForce" },
        { key: "tages",       label: "TAGES" },
        { key: "arxan",       label: "Arxan" },
        { key: "Uplay",       label: "Ubisoft Connect (Uplay)" },
        { key: "ubisoft connect", label: "Ubisoft Connect" },
        { key: "rockstar games launcher", label: "Rockstar Games Launcher" },
        { key: "online features require", label: "3rd-Party Online DRM" },
        { key: "requires 3rd-party", label: "3rd-Party DRM" },
        { key: "ea account", label: "EA App (Origin)" },
        { key: "ea app",     label: "EA App" },
        { key: "origin",     label: "EA App (Origin)" },
        { key: "games for windows", label: "Games for Windows LIVE" },
        { key: "steam drm",  label: "Steam DRM" },
        { key: "steamworks",  label: "Steamworks DRM" },
      ];

      try {
        const details = await steamJson(
          `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`
        );

        if (!details?.[appid]?.success || !details[appid].data) {
          return sendJson(res, 200, { ok: true, hasDrm: false, drmNames: [], reason: "no_store_data" });
        }

        const data = details[appid].data;
        const categories = (data.categories || []).map(c => c.id);
        const drmNames = new Set();

        // 1. Check Steam category 22 = "Steam DRM"
        if (categories.includes(22)) drmNames.add("Steam DRM");
        // Category 18 = "VAC Enabled"
        if (categories.includes(18)) drmNames.add("Valve Anti-Cheat (VAC)");

        // 2. Keyword scan: description + legal notice + genre names
        const scanText = [
          data.short_description || "",
          data.detailed_description || "",
          data.legal_notice || "",
          (data.genres || []).map(g => g.description).join(" "),
          (data.categories || []).map(c => c.description).join(" "),
        ].join(" ").toLowerCase();

        for (const { key, label } of DRM_KEYWORDS) {
          if (scanText.includes(key.toLowerCase())) {
            drmNames.add(label);
          }
        }

        // De-duplicate: if both "Steam DRM" and "Steamworks DRM" appear, keep only more specific
        if (drmNames.has("Steamworks DRM") && drmNames.has("Steam DRM")) drmNames.delete("Steamworks DRM");
        if (drmNames.has("EA App (Origin)") && drmNames.has("EA App")) drmNames.delete("EA App (Origin)");

        const drmArray = Array.from(drmNames);
        return sendJson(res, 200, {
          ok: true,
          appid,
          name: data.name || `App ${appid}`,
          hasDrm: drmArray.length > 0,
          drmNames: drmArray,
        });
      } catch (err) {
        console.error("[Wong DRM Check] Error:", err.message);
        return sendJson(res, 502, { ok: false, error: err.message });
      }
    }


    // 4. Library DB Routes
    if (url.pathname === "/api/library/games") {
      if (db) {
        try {
          await syncSteamToolGames();
          const games = db.prepare("SELECT * FROM juegos ORDER BY created_at DESC").all();
          for (const g of games) {
            const sid = g.steam_id || (Number(g.id) ? Number(g.id) : null);
            if (sid && (!g.cover || g.cover.includes('header.jpg') || g.cover.includes('header_image'))) {
              g.cover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${sid}/library_600x900_2x.jpg`;
            }
          }
          return sendJson(res, 200, { ok: true, games });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      return sendJson(res, 200, { ok: true, games: [] });
    }

    if (url.pathname === "/api/library/sync" && req.method === "POST") {
      try {
        await syncSteamToolGames();
        const games = db ? db.prepare("SELECT * FROM juegos ORDER BY created_at DESC").all() : [];
        return sendJson(res, 200, { ok: true, count: games.length, games });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    if (url.pathname === "/api/library/check") {
      const appId = params.get("appId") || params.get("id");
      if (!appId) return sendJson(res, 400, { ok: false, error: "appId required" });
      if (db) {
        try {
          const numId = Number(appId);
          const row = db.prepare(
            "SELECT id, nombre, steam_id FROM juegos WHERE id = ? OR (steam_id IS NOT NULL AND steam_id = ?)"
          ).get(String(appId), isNaN(numId) ? null : numId);
          if (row) {
            return sendJson(res, 200, { ok: true, claimed: true, game: row });
          }
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      return sendJson(res, 200, { ok: true, claimed: false });
    }

    if (url.pathname === "/api/library/ids") {
      if (db) {
        try {
          const rows = db.prepare("SELECT id, steam_id FROM juegos").all();
          const ids = new Set();
          for (const r of rows) {
            if (r.id) ids.add(String(r.id));
            if (r.steam_id) ids.add(String(r.steam_id));
          }
          return sendJson(res, 200, { ok: true, ids: Array.from(ids) });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      return sendJson(res, 200, { ok: true, ids: [] });
    }

    if (url.pathname === "/api/library/add") {
      const body = await readBody(req);
      const { id, name, steam_id, cover, hero, provider, launch_type } = body;
      if (!id || !name) return sendJson(res, 400, { error: "id and name are required." });

      if (db) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO juegos (id, nombre, steam_id, cover, hero, provider, launch_type, last_played)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(String(id), name, steam_id ? Number(steam_id) : null, cover || "", hero || "", provider || "Custom", launch_type || "steam");
          return sendJson(res, 200, { ok: true, id, name });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
      }
      return sendJson(res, 200, { ok: true, id, name });
    }

    if (url.pathname === "/api/library/remove") {
      const body = await readBody(req);
      const id = body.id || params.get("id");
      if (!id) return sendJson(res, 400, { error: "id required" });

      if (db) {
        try {
          db.prepare("DELETE FROM juegos WHERE id = ?").run(String(id));
          return sendJson(res, 200, { ok: true, id });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: e.message });
        }
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
        include_manifests: getSetting("include_manifests", "true") !== "false",
        igdb_client_id: getSetting("igdb_client_id", ""),
        igdb_client_secret: getSetting("igdb_client_secret", "")
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

    // 6. Fixes / Bypass Fix Installer Routes
    if (url.pathname === "/api/bypass/images") {
      const appid = String(params.get("appid") || "").trim();
      if (!appid) return sendJson(res, 400, { ok: false, error: "appid is required" });

      const NEXUS_API_URLS = [
        "https://nexus-images-2.pages.dev/api",
        "https://nexus-images.pages.dev/api",
        "https://nexus-worker-mirror.pages.dev/api",
      ];

      let imgData = null;
      for (const baseUrl of NEXUS_API_URLS) {
        try {
          const nUrl = new URL(baseUrl);
          nUrl.searchParams.set("appid", appid);
          const nr = await fetch(nUrl.toString(), { headers: { "user-agent": "Wong/1.0" } });
          if (nr.ok) {
            const nj = await nr.json();
            if (nj?.success && (nj.hero || nj.cover || nj.logo)) {
              imgData = nj;
              break;
            }
          }
        } catch (_) {}
      }

      const defaultHero = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`;
      const defaultCover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
      const defaultLogo = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/logo.png`;

      return sendJson(res, 200, {
        ok: true,
        hero: imgData?.hero || defaultHero,
        cover: imgData?.cover || defaultCover,
        logo: imgData?.logo || defaultLogo,
      });
    }

    if (url.pathname === "/api/fixes/apply") {
      const body = await readBody(req);
      const appid = String(body.appid || params.get("appid") || "").trim();
      const destinationDir = String(body.destinationDir || params.get("destinationDir") || "").trim();

      if (!appid) return sendJson(res, 400, { ok: false, error: "appid is required" });
      if (!destinationDir) return sendJson(res, 400, { ok: false, error: "destinationDir is required" });

      try {
        // Query Nexus Cloudflare Worker for fix download URLs
        const NEXUS_API_URLS = [
          "https://nexus-images-2.pages.dev/api",
          "https://nexus-images.pages.dev/api",
          "https://nexus-worker-mirror.pages.dev/api",
        ];

        let filesPayload = null;
        for (const baseUrl of NEXUS_API_URLS) {
          try {
            const nUrl = new URL(baseUrl);
            nUrl.searchParams.set("appid", appid);
            nUrl.searchParams.set("type", "fix");
            const nr = await fetch(nUrl.toString(), { headers: { "user-agent": "Wong/1.0" } });
            if (nr.ok) {
              const nj = await nr.json();
              if (nj?.success && Array.isArray(nj.files) && nj.files.length > 0) {
                filesPayload = nj.files;
                break;
              }
            }
          } catch (_) {}
        }

        if (!filesPayload || !filesPayload.length) {
          return sendJson(res, 404, { ok: false, reason: "fix_not_found", message: "No fix files found for this game." });
        }

        await fsp.mkdir(destinationDir, { recursive: true });
        const saved = [];

        for (const fileInfo of filesPayload) {
          const outPath = path.join(destinationDir, fileInfo.name);
          console.log(`[Wong Fixes] Downloading ${fileInfo.name} (${fileInfo.size || 0} bytes)...`);
          
          const fileRes = await fetch(fileInfo.download_url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Wong/1.0" },
            redirect: "follow",
          });

          if (!fileRes.ok) {
            throw new Error(`Failed to download ${fileInfo.name}: HTTP ${fileRes.status}`);
          }

          const buf = Buffer.from(await fileRes.arrayBuffer());
          await fsp.writeFile(outPath, buf);
          saved.push(outPath);
          console.log(`[Wong Fixes] Saved ${fileInfo.name} (${buf.length} bytes)`);
        }

        // Extract any zip archives found into destinationDir
        for (const fp of saved) {
          if (fp.toLowerCase().endsWith(".zip")) {
            console.log(`[Wong Fixes] Extracting ${fp} to ${destinationDir}...`);
            try { 
              await extract(fp, { dir: path.resolve(destinationDir) }); 
            } catch (extErr) {
              console.warn(`[Wong Fixes] extract-zip warning:`, extErr.message);
            }
            // Remove the temporary archive after extraction
            await fsp.rm(fp, { force: true }).catch(() => {});
          }
        }

        return sendJson(res, 200, { ok: true, message: "Fix applied successfully!", files: filesPayload.map(f => f.name) });
      } catch (err) {
        console.error(`[Wong Fixes] Error applying fix:`, err);
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 7. Millennium Plugin Install Route
    if (url.pathname === "/api/steamtools/install-millennium-plugin" && req.method === "POST") {
      const body = await readBody(req);
      const sp = String(body?.steamPath || detectSteamPath()).trim();
      const pluginDst = path.join(sp, "plugins", "wong-inject");

      try {
        const assetsDir = getSteamToolsAssetsDir();
        if (!assetsDir) throw new Error("Could not locate steamtools_assets directory.");

        const pluginSrc = path.join(assetsDir, "millennium_plugin");
        if (!fs.existsSync(pluginSrc)) {
          throw new Error("millennium_plugin source assets not found in steamtools_assets.");
        }

        // Copy the entire millennium_plugin folder into Steam/plugins/wong-inject/
        await fsp.mkdir(path.dirname(pluginDst), { recursive: true });
        await fsp.cp(pluginSrc, pluginDst, { recursive: true, force: true });

        console.log(`[Wong] Millennium plugin installed to: ${pluginDst}`);
        return sendJson(res, 200, { ok: true, pluginPath: pluginDst });
      } catch (err) {
        console.error("[Wong] Millennium plugin install error:", err.message);
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // Millennium Plugin Status Check
    if (url.pathname === "/api/steamtools/millennium-plugin-status") {
      const sp = params.get("steamPath") || detectSteamPath();
      const pluginDir = path.join(sp, "plugins", "wong-inject");
      const installed = fs.existsSync(path.join(pluginDir, "plugin.json"));
      return sendJson(res, 200, { ok: true, installed, pluginPath: pluginDir });
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
      console.log(`⚡ Powerplay is running at http://localhost:${customPort}`);
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
