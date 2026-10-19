// Wong — Game Launcher (powered by Powerplay engine)
// Connects UI, Electron IPC bridge, and embedded HTTP server APIs

/* ── ELECTRON DETECTION & TITLEBAR ── */
(function detectElectron() {
  // window.api is exposed by our electron-preload.js contextBridge
  if (window.api && typeof window.api.ejecutar === 'function') {
    document.body.classList.add('is-electron');
  }
})();

function titlebarAction(action) {
  // Send via fetch to the embedded server which won't work for window ops,
  // so instead we use a hidden IPC shim injected by the preload.
  if (window.__electronWindow) {
    if (action === 'close')    window.__electronWindow.close();
    if (action === 'minimize') window.__electronWindow.minimize();
    if (action === 'maximize') window.__electronWindow.maximize();
    return;
  }
  // Fallback: use our custom preload IPC bridge
  if (window.api && window.api.ejecutar) {
    window.api.ejecutar('window:' + action);
  }
}

// This script is a module, while the frameless titlebar uses inline click handlers.
// Publish only this small, existing IPC-backed action so those controls remain usable.
window.titlebarAction = titlebarAction;


const app = document.querySelector('#app');
const pages = document.querySelectorAll('.page');
const toast = document.querySelector('#toast');
const toastText = document.querySelector('#toast-text');

// State
let libraryGames = [];
let bypassData = null;
let currentProviderKey = 'EA';
let selectedBypassGame = null;
let selectedLibraryGame = null;
let steamCatalog = [];
let selectedSteamGame = null;

/* Warm the large provider-hover artwork before it is needed so first interaction stays responsive. */
const PROVIDER_INTERACTION_IMAGES = [
  'Images/interacted images for providers/EA.jpg',
  'Images/interacted images for providers/Ubisoft.jpg',
  'Images/interacted images for providers/rockstar.jpg',
  'Images/interacted images for providers/Denuvo.jpg',
  'Images/interacted images for providers/playstation.jpg',
  'Images/interacted images for providers/other games.jpg'
];

function preloadProviderInteractionImages() {
  PROVIDER_INTERACTION_IMAGES.forEach(source => {
    const image = new Image();
    image.src = source;
    // decode() schedules image decoding ahead of the first hover; older Chromium versions use the cache load.
    if (typeof image.decode === 'function') image.decode().catch(() => {});
  });
}

function applyAtmosphereTheme(theme = 'light') {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('dark-theme', selectedTheme === 'dark');
  document.querySelectorAll('.atmosphere-theme-btn').forEach(button => {
    const active = button.dataset.atmosphereTheme === selectedTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  // Preserve the selected image/GIF while adapting its wash to the active atmosphere.
  if (document.querySelector('#app')?.classList.contains('has-custom-background')) {
    applyCustomThemeAppearance();
  }
}

function loadAtmosphereTheme() {
  applyAtmosphereTheme(localStorage.getItem('powerplay-atmosphere-theme') || 'light');
}
let steamSearchTimer = null;

// Fallback images
const defaultImages = [
  'https://images.hdqwalls.com/download/white-haired-girl-with-neon-sword-pi-1920x1080.jpg',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1547394765-185e1e68f34e?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1000&q=85'
];

const SOFTWARE_LINKS = {
  'EA App': 'https://www.ea.com/ea-app',
  'Rockstar Games Launcher': 'https://socialclub.rockstargames.com/rockstar-games-launcher',
  'Ubisoft Play': 'https://www.ubisoft.com/en-us/ubisoft-connect',
  'Ubisoft Connect': 'https://www.ubisoft.com/en-us/ubisoft-connect',
  'DirectX': 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  'DirectX 9': 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  'DirectX 11': 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  'DirectX 12': 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  'Microsoft Visual C++ Redistributable': 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist',
  'Visual C++': 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist',
  'VC Redist': 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist',
  '.NET': 'https://dotnet.microsoft.com/en-us/download',
  '.NET 4.8': 'https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48',
};

const PROVIDER_MAP = {
  'Electronic Arts': 'EA',
  'Ubisoft': 'UBISOFT',
  'Rockstar': 'ROCKSTAR',
  'Denuvo': 'DENUVO',
  'PlayStation': 'PlayStation',
  'Other Games': 'OTHERS'
};

/* ── UI HELPERS ── */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
  document.querySelectorAll('.card, .provider, .bypass-card').forEach(el => {
    if (!el.querySelector(':scope > .metal-orbit')) {
      el.insertAdjacentHTML('afterbegin', '<span class="metal-orbit" aria-hidden="true"></span>');
    }
  });
}

function showToast(msg) {
  if (!toastText) return;
  toastText.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function route(target) {
  app.classList.toggle('library-route', target === 'library');
  if (target === 'home') {
    app.classList.remove('inner');
    return;
  }
  app.classList.add('inner');
  pages.forEach(p => p.classList.remove('active'));
  const targetPage = document.querySelector('#' + target);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  document.querySelectorAll('[data-route]').forEach(b => {
    b.classList.toggle('active', b.dataset.route === target);
  });
  refreshIcons();
}

/* ── IPC / API WRAPPERS ── */
async function invokeApi(channel, payload) {
  if (channel === 'dialog:openDirectory' && window.api && typeof window.api.openDirectory === 'function') {
    try {
      return await window.api.openDirectory(payload);
    } catch (e) {
      console.warn('api.openDirectory failed:', e);
    }
  }
  if (window.api && typeof window.api.ejecutarAsync === 'function') {
    try {
      return await window.api.ejecutarAsync(channel, payload);
    } catch (e) {
      console.warn(`IPC invoke failed for ${channel}:`, e);
    }
  }
  return null;
}

function sendSystemAction(action, ...args) {
  if (window.api && typeof window.api.ejecutar === 'function') {
    try {
      window.api.ejecutar(action, ...args);
      return true;
    } catch (e) {
      console.warn(`System action failed: ${action}`, e);
    }
  }
  return false;
}

/* ── STEAMTOOL & LIBRARY INJECTION ── */
async function injectSteamGame(appIdInputVal) {
  const addBtn = document.querySelector('#add-button');
  const input = document.querySelector('#game-id');
  const query = String(appIdInputVal || '').trim();
  if (!query) return;

  addBtn.disabled = true;
  addBtn.classList.add('is-adding');
  const originalHtml = addBtn.innerHTML;
  addBtn.innerHTML = '<span>Injecting...</span>';

  let appId = query;
  // If user typed a game title instead of an App ID, search Steam to resolve App ID
  if (!/^\d+$/.test(query)) {
    try {
      const searchRes = await fetch(`/api/store/search?term=${encodeURIComponent(query)}`);
      if (searchRes.ok) {
        const json = await searchRes.json();
        if (json.items && json.items.length > 0) {
          appId = String(json.items[0].id);
          showToast(`Resolved "${query}" to Steam App ID ${appId}`);
        }
      }
    } catch (_) {}
  }

  if (!/^\d+$/.test(appId)) {
    showToast('Please enter a valid numeric Steam App ID.');
    addBtn.innerHTML = originalHtml;
    addBtn.classList.remove('is-adding');
    addBtn.disabled = false;
    return;
  }

  try {
    const steamBasePath = localStorage.getItem('powerplay-steam-path') || '';
    const includeManifests = localStorage.getItem('powerplay-manifests') !== 'false';

    // 1. Run SteamTool manifest injection via IPC or Server API
    let res = await invokeApi('lightningtools:addAppId', {
      appId,
      steamBasePath,
      includeManifests
    });

    if (!res) {
      const fetchRes = await fetch('/api/steamtools/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, steamBasePath, includeManifests })
      });
      if (fetchRes.ok) res = await fetchRes.json();
    }

    if (res && res.ok) {
      const gameName = res.name || `Steam App ${appId}`;
      const gameCover = res.cover || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
      const gameHero = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`;

      // 2. Add to SQLite / Library database
      await invokeApi('biblioteca:addJuego', {
        id: appId,
        nombre: gameName,
        steam_id: Number(appId),
        cover: gameCover,
        hero: gameHero,
        provider: 'SteamTool'
      });

      await fetch('/api/library/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: appId,
          name: gameName,
          steam_id: Number(appId),
          cover: gameCover,
          hero: gameHero,
          provider: 'SteamTool'
        })
      }).catch(() => {});

      input.value = '';
      showToast(`${gameName} manifests injected & added to Library!`);
      await loadLibrary();
    } else {
      showToast(`Manifest not found on GitHub repos for App ID ${appId}. Adding to Library.`);
      // Still add metadata to Library
      await addFallbackToLibrary(appId);
    }
  } catch (err) {
    console.error('SteamTool injection error:', err);
    showToast('Failed to inject Steam manifests.');
  } finally {
    addBtn.innerHTML = originalHtml;
    addBtn.classList.remove('is-adding', 'ready');
    addBtn.disabled = true;
  }
}

async function addFallbackToLibrary(appId) {
  try {
    let name = `Steam Game ${appId}`;
    let cover = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
    try {
      const details = await fetch(`/api/store/details?appids=${appId}`).then(r => r.json());
      if (details?.[appId]?.data) {
        name = details[appId].data.name || name;
        cover = details[appId].data.header_image || cover;
      }
    } catch (_) {}

    await fetch('/api/library/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, name, steam_id: Number(appId), cover, provider: 'Steam' })
    });
    await loadLibrary();
  } catch (_) {}
}

async function loadLibrary() {
  try {
    // Always fetch from the HTTP server — this triggers syncSteamToolGames() which
    // imports any Lua files added externally via SteamTool / manifest injection.
    let games = [];
    try {
      const res = await fetch('/api/library/games');
      if (res.ok) {
        const json = await res.json();
        games = json.games || [];
      }
    } catch (_) {}

    // IPC fallback (for future use — currently not implemented in main process)
    if (games.length === 0) {
      const ipcGames = await invokeApi('biblioteca:getJuegos');
      if (Array.isArray(ipcGames) && ipcGames.length > 0) games = ipcGames;
    }

    if (!games || games.length === 0) {
      // Seed default showcase library if entirely empty
      libraryGames = [
        { id: '1145360', nombre: 'Hades', steam_id: 1145360, provider: 'Supergiant Games', cover: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1145360/library_600x900_2x.jpg' },
        { id: '1086940', nombre: 'Baldur’s Gate 3', steam_id: 1086940, provider: 'Larian Studios', cover: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1086940/library_600x900_2x.jpg' },
        { id: '367520',  nombre: 'Hollow Knight', steam_id: 367520, provider: 'Team Cherry', cover: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/367520/library_600x900_2x.jpg' },
        { id: '413150',  nombre: 'Stardew Valley', steam_id: 413150, provider: 'ConcernedApe', cover: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/413150/library_600x900_2x.jpg' }
      ];
    } else {
      libraryGames = games;
    }

    renderLibrary();
  } catch (err) {
    console.error('Error loading library:', err);
  }
}

function getGamePoster(g) {
  if (!g) return defaultImages[0];
  const sid = g.steam_id || (Number(g.id) ? Number(g.id) : null);
  if (sid) {
    // If the cover was a wide header banner (header.jpg), missing, or low-res, upgrade to official 600x900 2x vertical poster
    if (!g.cover || g.cover.includes('header.jpg') || g.cover.includes('header_image') || (g.cover.includes('steamstatic') && !g.cover.includes('600x900'))) {
      return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${sid}/library_600x900_2x.jpg`;
    }
  }
  return g.cover || defaultImages[0];
}

function getGameHero(g) {
  if (!g) return defaultImages[0];
  if (g.hero && !g.hero.includes('header.jpg')) return g.hero;
  const sid = g.steam_id || (Number(g.id) ? Number(g.id) : null);
  if (sid) {
    return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${sid}/library_hero.jpg`;
  }
  return getGamePoster(g);
}

function renderLibrary() {
  const grid = document.querySelector('#library-grid');
  const countEl = document.querySelector('#game-count');
  const featureCard = document.querySelector('#latest-game');
  if (!grid) return;

  if (!libraryGames.length) {
    grid.innerHTML = '<p style="opacity:.4;text-align:center;padding:2rem;">No games in library yet. Add one above.</p>';
    if (countEl) countEl.textContent = '00 GAMES';
    return;
  }

  const countStr = String(libraryGames.length).padStart(2, '0') + ' GAMES';
  if (countEl) countEl.textContent = countStr;

  const latest = libraryGames[0];
  if (featureCard && latest) {
    featureCard.dataset.gameId = latest.id;
    featureCard.style.setProperty('--img', `url('${getGameHero(latest)}')`);
    featureCard.innerHTML = `
      <div class="card-info">
        <div>
          <small>Latest Added / ${latest.provider || 'Personal'}</small>
          <h3>${latest.nombre || latest.name}</h3>
        </div>
        <span class="card-arrow"><i data-lucide="arrow-up-right" size="14"></i></span>
      </div>
    `;
  }

  const remaining = libraryGames.slice(1);
  grid.innerHTML = remaining.map((g, idx) => `
    <article class="card" data-game-id="${g.id}" style="--img:url('${getGamePoster(g)}')">
      <div class="card-info">
        <div>
          <small>${g.provider || 'Steam'}</small>
          <h3>${g.nombre || g.name}</h3>
        </div>
        <span class="card-arrow"><i data-lucide="arrow-up-right" size="14"></i></span>
      </div>
    </article>
  `).join('');

  refreshIcons();
}

function openGameDetail(gameId) {
  const game = libraryGames.find(g => String(g.id) === String(gameId)) || libraryGames[0];
  if (!game) return;
  selectedLibraryGame = game;

  document.querySelector('#detail-title').textContent = (game.nombre || game.name) + '.';
  document.querySelector('#detail-provider').textContent = (game.provider || 'Steam') + ' Archive';
  document.querySelector('#detail-description').textContent = game.description || 'Installed game record. Ready for launch through Powerplay.';
  document.querySelector('#detail-bg').style.setProperty('--detail-img', `url('${getGameHero(game)}')`);

  route('game-detail');
}

/* ── BYPASS & PROVIDERS SECTION ── */
async function loadBypassData() {
  if (bypassData) return bypassData;
  try {
    const res = await fetch('/api/bypass/games');
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.data) {
        bypassData = json.data;
        return bypassData;
      }
    }
  } catch (e) {
    console.warn('Failed to load bypass data from local server, fetching direct:', e);
  }

  try {
    const resp = await fetch('https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json?v=' + Date.now());
    bypassData = await resp.json();
    return bypassData;
  } catch (err) {
    console.error('Failed to load bypass JSON:', err);
    return null;
  }
}

async function openProvider(providerName) {
  const appKey = PROVIDER_MAP[providerName] || 'EA';
  currentProviderKey = appKey;

  document.querySelector('#provider-name').textContent = providerName;
  document.querySelector('#provider-title').textContent = providerName + '.';
  document.querySelector('#provider-eyebrow').textContent = providerName + ' archive';

  const grid = document.querySelector('#provider-game-grid');
  grid.innerHTML = '<div style="padding:30px;color:#888;font:11px DM Mono;">LOADING ARCHIVE WORLDS…</div>';
  route('provider-games');

  const data = await loadBypassData();
  if (!data || !data[appKey]) {
    grid.innerHTML = '<div style="padding:30px;color:#888;font:11px DM Mono;">NO RECORDS FOUND FOR THIS ARCHIVE.</div>';
    return;
  }

  const entries = Object.entries(data[appKey]);
  document.querySelector('#provider-count').textContent = String(entries.length).padStart(2, '0') + ' GAMES';

  grid.innerHTML = entries.map(([appid, game]) => {
    const isUnavailable = game.disponible === false;
    const coverUrl = game.custom_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
    return `
      <div class="bypass-card" data-appid="${appid}" data-provider="${appKey}">
        <div class="bypass-card-cover" style="background-image:url('${coverUrl}')"></div>
        <div class="bypass-card-overlay"></div>
        ${isUnavailable ? '<div class="bypass-unavailable-badge"><i data-lucide="alert-triangle" size="11"></i> Unavailable</div>' : ''}
        <div class="bypass-card-content">
          <strong class="bypass-card-title">${game.name}</strong>
          <span class="bypass-card-fix">${game.nombre_fix || 'Bypass active'}</span>
        </div>
      </div>
    `;
  }).join('');

  refreshIcons();
}

async function openBypassDetail(appid, appKey) {
  let game = null;
  if (bypassData && bypassData[appKey] && bypassData[appKey][appid]) {
    game = bypassData[appKey][appid];
  } else if (bypassData) {
    // Search in all providers if not found in current appKey
    for (const [pk, games] of Object.entries(bypassData)) {
      if (games[appid]) {
        game = games[appid];
        appKey = pk;
        break;
      }
    }
  }

  if (!game) {
    showToast('Game information not found.');
    return;
  }

  selectedBypassGame = { appid: String(appid), appKey, ...game };

  // Update textual elements
  const elTitle = document.querySelector('#bd-game-title');
  if (elTitle) elTitle.textContent = game.name;

  const elFixTag = document.querySelector('#bd-fix-tag');
  if (elFixTag) elFixTag.textContent = game.nombre_fix || 'Bypass Active';

  const elAppId = document.querySelector('#bd-appid-display');
  if (elAppId) elAppId.textContent = appid;

  const elMetaAppId = document.querySelector('#bd-meta-appid');
  if (elMetaAppId) elMetaAppId.textContent = appid;

  const elMetaFix = document.querySelector('#bd-meta-fix');
  if (elMetaFix) elMetaFix.textContent = game.nombre_fix || 'Community Bypass';

  const elDevNote = document.querySelector('#bd-dev-note');
  if (elDevNote) elDevNote.textContent = game.comentarios || 'Enjoy the game ♥';

  // Badges & Meta flags
  const elBadgeExe = document.querySelector('#bd-badge-exe');
  if (elBadgeExe) elBadgeExe.style.display = game.launch_exe !== false ? 'inline-flex' : 'none';

  const elBadgeSteam = document.querySelector('#bd-badge-steam');
  if (elBadgeSteam) elBadgeSteam.style.display = game.launch_steam !== false ? 'inline-flex' : 'none';

  const elMetaExe = document.querySelector('#bd-meta-exe');
  if (elMetaExe) {
    elMetaExe.textContent = game.launch_exe !== false ? 'Yes' : 'No';
    elMetaExe.className = 'bd-meta-val ' + (game.launch_exe !== false ? 'ok' : 'no');
  }

  const elMetaSteam = document.querySelector('#bd-meta-steam');
  if (elMetaSteam) {
    elMetaSteam.textContent = game.launch_steam !== false ? 'Yes' : 'No';
    elMetaSteam.className = 'bd-meta-val ' + (game.launch_steam !== false ? 'ok' : 'no');
  }

  // Known Issues (errores)
  const elErrors = document.querySelector('#bd-error-list');
  if (elErrors) {
    const errs = Array.isArray(game.errores) ? game.errores : [];
    if (errs.length > 0) {
      elErrors.innerHTML = errs.map((err, idx) => `
        <li class="bd-error-item">
          <span class="bd-error-num">${String(idx + 1).padStart(2, '0')}</span>
          <p class="bd-error-text">${err}</p>
        </li>
      `).join('');
    } else {
      elErrors.innerHTML = `
        <li class="bd-error-item">
          <span class="bd-error-num">01</span>
          <p class="bd-error-text">No known critical issues. Follow standard instructions.</p>
        </li>
      `;
    }
  }

  // Reset Folder Selection State (Detect / Manual)
  const pathInput = document.querySelector('#bd-install-path');
  if (pathInput) pathInput.value = '';

  const statusInd = document.querySelector('#bd-folder-status-indicator');
  if (statusInd) {
    statusInd.className = 'bd-folder-status-indicator unselected';
    statusInd.innerHTML = '<i data-lucide="alert-circle" size="13"></i> <span id="bd-status-label">No folder selected</span>';
  }

  const pathVal = document.querySelector('#bd-folder-path-val');
  if (pathVal) {
    pathVal.textContent = 'Choose Detect or Manual above';
    pathVal.title = '';
  }

  // Reset Inject Button (greyed out initially until folder is selected)
  const btn = document.querySelector('#bd-apply-btn');
  const btnText = document.querySelector('#bd-btn-text');
  const bar = document.querySelector('#bd-progress-bar');
  const pct = document.querySelector('#bd-progress-percent');
  if (btn) {
    btn.disabled = true;
    btn.classList.remove('done', 'in-progress');
  }
  if (btnText) btnText.innerHTML = '<i data-lucide="zap" size="14"></i> <span>Inject</span>';
  if (bar) bar.style.width = '0%';
  if (pct) pct.textContent = '0%';

  // Set images: initial fallback then fetch high-res from Nexus API
  const heroImg = document.querySelector('#bd-hero-img');
  const logoImg = document.querySelector('#bd-game-logo');

  const defaultHero = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`;
  const defaultHeader = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  const customHero = game.custom_images?.hero_image_x2 || game.custom_images?.background || game.custom_image;

  if (heroImg) {
    heroImg.src = customHero || defaultHero;
    heroImg.onerror = () => { heroImg.src = defaultHeader; };
  }

  if (logoImg) {
    logoImg.style.display = 'none';
    if (game.custom_images?.logo_img) {
      logoImg.src = game.custom_images.logo_img;
      logoImg.style.display = 'block';
    }
  }

  // Navigate to bypass-detail
  route('bypass-detail');
  refreshIcons();

  // Asynchronously fetch high-res SteamGridDB images from Nexus worker
  try {
    const res = await fetch(`/api/bypass/images?appid=${appid}`).then(r => r.json()).catch(() => null);
    if (res?.ok) {
      if (res.hero && heroImg) heroImg.src = res.hero;
      if (res.logo && logoImg) {
        logoImg.src = res.logo;
        logoImg.style.display = 'block';
      }
    }
  } catch (_) {}
}

/* ── BYPASS FOLDER SELECTION & INJECTION ── */
async function detectGameForBypass() {
  if (!selectedBypassGame) {
    showToast('Please select a game first.');
    return;
  }

  const detectBtn = document.querySelector('#bd-detect-btn');
  const statusInd = document.querySelector('#bd-folder-status-indicator');
  const pathVal = document.querySelector('#bd-folder-path-val');
  const pathInput = document.querySelector('#bd-install-path');
  const injectBtn = document.querySelector('#bd-apply-btn');

  if (detectBtn) {
    detectBtn.disabled = true;
    detectBtn.innerHTML = '<i data-lucide="loader" class="spin" size="14"></i> <span>Detecting…</span>';
    refreshIcons();
  }

  try {
    const res = await fetch(`/api/system/detect-game-folder?name=${encodeURIComponent(selectedBypassGame.name)}&appid=${encodeURIComponent(selectedBypassGame.appid || '')}`)
      .then(r => r.json())
      .catch(() => ({ ok: false }));

    if (res?.ok && res.found && res.path) {
      if (pathInput) pathInput.value = res.path;
      if (pathVal) {
        pathVal.textContent = res.path;
        pathVal.title = res.path;
      }
      if (statusInd) {
        statusInd.className = 'bd-folder-status-indicator detected';
        statusInd.innerHTML = '<i data-lucide="check-circle" size="13"></i> <span id="bd-status-label">Detected in Steam</span>';
      }
      if (injectBtn) {
        injectBtn.disabled = false;
        injectBtn.classList.remove('done', 'in-progress');
      }
      showToast(`Detected: ${res.folderName || res.path}`);
      refreshIcons();
    } else {
      if (pathInput) pathInput.value = '';
      if (statusInd) {
        statusInd.className = 'bd-folder-status-indicator error';
        statusInd.innerHTML = '<i data-lucide="alert-circle" size="13"></i> <span id="bd-status-label">Not Found in Steam</span>';
      }
      if (pathVal) {
        pathVal.textContent = 'Not found in C:\\Program Files (x86)\\Steam\\steamapps\\common. Click Manual to select.';
        pathVal.title = '';
      }
      if (injectBtn) {
        injectBtn.disabled = true;
      }
      showToast('Could not find folder in default Steam location. Use Manual.');
      refreshIcons();
    }
  } catch (err) {
    if (statusInd) {
      statusInd.className = 'bd-folder-status-indicator error';
      statusInd.innerHTML = '<i data-lucide="alert-circle" size="13"></i> <span id="bd-status-label">Detection Error</span>';
    }
    showToast('Detection error: ' + err.message);
    refreshIcons();
  } finally {
    if (detectBtn) {
      detectBtn.disabled = false;
      detectBtn.innerHTML = '<i data-lucide="search" size="14"></i> <span>Detect</span>';
      refreshIcons();
    }
  }
}

async function manualSelectGameForBypass() {
  if (!selectedBypassGame) {
    showToast('Please select a game first.');
    return;
  }

  const statusInd = document.querySelector('#bd-folder-status-indicator');
  const pathVal = document.querySelector('#bd-folder-path-val');
  const pathInput = document.querySelector('#bd-install-path');
  const injectBtn = document.querySelector('#bd-apply-btn');

  const gName = selectedBypassGame.name || 'Selected Game';
  let dir = await invokeApi('dialog:openDirectory', {
    title: `Select root folder for ${gName} (e.g. steamapps/common/${gName})`
  });

  // Browser fallback if running in browser without electron
  if (!dir && !window.api) {
    const fileFallback = document.querySelector('#bd-file-input-fallback');
    if (fileFallback) {
      fileFallback.onchange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          const sample = files[0].webkitRelativePath || files[0].name;
          const rootFolder = sample.split('/')[0] || sample;
          const chosenDir = `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${rootFolder}`;
          onFolderConfirmed(chosenDir);
        }
      };
      fileFallback.click();
      return;
    }
  }

  if (dir) {
    onFolderConfirmed(dir);
  }

  function onFolderConfirmed(folderPath) {
    if (pathInput) pathInput.value = folderPath;
    if (pathVal) {
      pathVal.textContent = folderPath;
      pathVal.title = folderPath;
    }
    if (statusInd) {
      statusInd.className = 'bd-folder-status-indicator manual';
      statusInd.innerHTML = '<i data-lucide="check-circle" size="13"></i> <span id="bd-status-label">Manually Selected</span>';
    }
    if (injectBtn) {
      injectBtn.disabled = false;
      injectBtn.classList.remove('done', 'in-progress');
    }
    showToast(`Folder selected: ${folderPath}`);
    refreshIcons();
  }
}

async function applyBypassFix() {
  if (!selectedBypassGame) {
    showToast('No game selected.');
    return;
  }

  const btn = document.querySelector('#bd-apply-btn');
  const btnText = document.querySelector('#bd-btn-text');
  const bar = document.querySelector('#bd-progress-bar');
  const pct = document.querySelector('#bd-progress-percent');
  const pathInput = document.querySelector('#bd-install-path');

  let targetDir = pathInput ? pathInput.value.trim() : '';

  if (!targetDir) {
    showToast('Please select the game root folder first using Detect or Manual.');
    return;
  }

  // Windows Defender prompt if required
  if (selectedBypassGame.exclusion) {
    const confirm = window.confirm(
      'Windows Defender Notice:\nThis bypass patch may be flagged by antivirus as a false positive. We recommend adding the game directory to Defender exclusions.\n\nContinue with injection?'
    );
    if (!confirm) return;
  }

  // Start Download & Injection Flow
  if (btn) {
    btn.disabled = true;
    btn.classList.add('in-progress');
  }
  if (btnText) btnText.innerHTML = '<i data-lucide="loader" class="spin" size="14"></i> <span>Injecting Fix…</span>';
  refreshIcons();

  if (bar) bar.style.width = '20%';
  if (pct) pct.textContent = '20%';

  try {
    // Animate progress smoothly
    let p = 20;
    const interval = setInterval(() => {
      if (p < 85) {
        p += 5;
        if (bar) bar.style.width = p + '%';
        if (pct) pct.textContent = p + '%';
      }
    }, 400);

    const res = await fetch('/api/fixes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appid: selectedBypassGame.appid,
        destinationDir: targetDir
      })
    }).then(r => r.json()).catch(err => ({ ok: false, error: err.message }));

    clearInterval(interval);

    if (res?.ok) {
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';
      if (btn) {
        btn.classList.remove('in-progress');
        btn.classList.add('done');
        btn.disabled = true;
      }
      if (btnText) btnText.innerHTML = '<i data-lucide="check-circle" size="15"></i> <span>Injected Successfully ✓</span>';
      showToast(`Bypass for ${selectedBypassGame.name} injected into ${targetDir}!`);
      refreshIcons();
    } else {
      if (bar) bar.style.width = '0%';
      if (pct) pct.textContent = '0%';
      if (btn) {
        btn.classList.remove('in-progress');
        btn.disabled = false;
      }
      if (btnText) btnText.innerHTML = '<i data-lucide="alert-circle" size="14"></i> <span>Retry Inject</span>';
      showToast(res?.message || res?.error || 'Failed to download or inject fix.');
      refreshIcons();
    }
  } catch (err) {
    if (bar) bar.style.width = '0%';
    if (pct) pct.textContent = '0%';
    if (btn) {
      btn.classList.remove('in-progress');
      btn.disabled = false;
    }
    if (btnText) btnText.innerHTML = '<i data-lucide="alert-circle" size="14"></i> <span>Retry Inject</span>';
    showToast('Error injecting bypass fix: ' + err.message);
    refreshIcons();
  }
}

/* ── BYPASS BUTTON — Steam-style check flow ── */

// Track the detected install folder per-session for the BYPASS button
let bypassCheckFolderPath = null;

function closeAllBypassModals() {
  document.querySelectorAll('.bypass-modal-overlay.active').forEach(m => m.classList.remove('active'));
}

function openBypassModal(id) {
  closeAllBypassModals();
  const el = document.querySelector('#' + id);
  if (el) el.classList.add('active');
}

function fillBypassModalGameInfo(version, game) {
  const appid = game.appid || game.steam_id || game.id || '';
  const name  = game.name || game.nombre || `App ${appid}`;
  const icon  = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;

  const iconEl = document.querySelector(`#bm${version}-icon`);
  const nameEl = document.querySelector(`#bm${version}-game-name`);
  if (iconEl) { iconEl.src = icon; iconEl.onerror = () => { iconEl.src = ''; }; }
  if (nameEl) nameEl.textContent = name;
}

function renderDrmChips(listId, drmNames) {
  const el = document.querySelector('#' + listId);
  if (!el) return;
  el.innerHTML = drmNames.map(n => `
    <span class="bm-drm-chip">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      ${n}
    </span>
  `).join('');
}

async function handleBypassBtnClick() {
  if (!selectedBypassGame) {
    showToast('No game selected.');
    return;
  }

  const bypassBtn  = document.querySelector('#bd-steam-bypass-btn');
  const bypassLabel = document.querySelector('#bd-steam-bypass-label');

  // Set checking state
  if (bypassBtn)  bypassBtn.classList.add('checking');
  if (bypassLabel) bypassLabel.textContent = 'Checking…';

  const appid = selectedBypassGame.appid || selectedBypassGame.steam_id || selectedBypassGame.id || '';
  const name  = selectedBypassGame.name || selectedBypassGame.nombre || '';

  try {
    // ── CHECK 1: Does the game have DRM? (Steam API) ──
    const drmRes = await fetch(`/api/bypass/drm-check?appid=${encodeURIComponent(appid)}`)
      .then(r => r.json())
      .catch(() => ({ ok: false, hasDrm: false, drmNames: [] }));

    const hasDrm   = drmRes.ok && drmRes.hasDrm;
    const drmNames = drmRes.drmNames || [];

    // ── CHECK 2: Does our bypass DB have this game? ──
    const data = await loadBypassData();
    let hasBypass = false;
    if (data) {
      for (const games of Object.values(data)) {
        if (games[appid]) { hasBypass = true; break; }
      }
    }

    // ── CHECK 3: Is the game installed? ──
    let gameInstalled = false;
    let installedPath = null;
    if (hasDrm && hasBypass) {
      const folderRes = await fetch(
        `/api/system/detect-game-folder?name=${encodeURIComponent(name)}&appid=${encodeURIComponent(appid)}`
      ).then(r => r.json()).catch(() => ({ ok: false, found: false }));
      gameInstalled = folderRes.ok && folderRes.found;
      installedPath = folderRes.path || null;
    }

    // ── ROUTE TO CORRECT NOTIFICATION VERSION ──

    if (!hasDrm) {
      // V2: No DRM — safe to play
      fillBypassModalGameInfo('2', selectedBypassGame);
      openBypassModal('bypass-modal-v2');

    } else if (!hasBypass) {
      // V1: Has DRM but no bypass in app
      fillBypassModalGameInfo('1', selectedBypassGame);
      renderDrmChips('bm1-drm-list', drmNames.length ? drmNames : ['Unknown DRM']);
      openBypassModal('bypass-modal-v1');

    } else if (!gameInstalled) {
      // V3a: Has DRM + bypass available but game not installed yet
      fillBypassModalGameInfo('3a', selectedBypassGame);
      renderDrmChips('bm3a-drm-list', drmNames.length ? drmNames : ['Unknown DRM']);
      openBypassModal('bypass-modal-v3a');

    } else {
      // V3b: Has DRM + bypass + game installed → confirm folder → download
      bypassCheckFolderPath = installedPath;
      fillBypassModalGameInfo('3b', selectedBypassGame);
      const folderPathEl = document.querySelector('#bm3b-folder-path');
      if (folderPathEl) folderPathEl.textContent = installedPath;

      // Reset to confirm state
      document.querySelector('#bm3b-state-confirm').style.display = '';
      document.querySelector('#bm3b-state-downloading').style.display = 'none';
      document.querySelector('#bm3b-state-done').style.display = 'none';
      document.querySelector('#bm3b-state-error').style.display = 'none';

      openBypassModal('bypass-modal-v3b');
    }

  } catch (err) {
    showToast('Bypass check error: ' + err.message);
  } finally {
    if (bypassBtn)  bypassBtn.classList.remove('checking');
    if (bypassLabel) bypassLabel.textContent = 'BYPASS';
  }
}

async function startBypassDownloadWithProgress(targetDir) {
  // Switch to download state
  document.querySelector('#bm3b-state-confirm').style.display = 'none';
  document.querySelector('#bm3b-state-downloading').style.display = '';
  document.querySelector('#bm3b-state-done').style.display = 'none';
  document.querySelector('#bm3b-state-error').style.display = 'none';

  const fillEl  = document.querySelector('#bm3b-progress-fill');
  const pctEl   = document.querySelector('#bm3b-dl-pct');
  const etaEl   = document.querySelector('#bm3b-dl-eta');
  const speedEl = document.querySelector('#bm3b-speed');
  const fileEl  = document.querySelector('#bm3b-dl-file');

  let percent = 0;
  let startTime = Date.now();
  let lastPct = 0;

  // Simulate live speed-based progress updates while the real download runs
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const increment = Math.random() * 3.5 + 0.5;
    percent = Math.min(percent + increment, 88);

    const pctDelta  = percent - lastPct;
    const timeDelta = elapsed > 0 ? elapsed : 1;
    const speedMBps = ((pctDelta / 100) * 80 / timeDelta).toFixed(1); // Rough estimate
    const remaining = percent < 100
      ? Math.max(0, Math.round(((100 - percent) / 100 * 80) / Math.max(Number(speedMBps), 0.1)))
      : 0;

    if (fillEl)  fillEl.style.width  = percent.toFixed(1) + '%';
    if (pctEl)   pctEl.textContent   = Math.round(percent) + '%';
    if (speedEl) speedEl.textContent = `${speedMBps} MB/s`;
    if (etaEl)   etaEl.textContent   = remaining > 60
      ? `about ${Math.round(remaining / 60)} min remaining`
      : remaining > 0
        ? `about ${remaining} sec remaining`
        : 'finishing…';
  }, 500);

  try {
    const appid = selectedBypassGame.appid || selectedBypassGame.id || '';
    if (fileEl) fileEl.textContent = `bypass_${appid}.zip`;

    const res = await fetch('/api/fixes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appid, destinationDir: targetDir })
    }).then(r => r.json()).catch(err => ({ ok: false, error: err.message }));

    clearInterval(progressInterval);

    if (res?.ok) {
      // Fill to 100%
      if (fillEl)  fillEl.style.width  = '100%';
      if (pctEl)   pctEl.textContent   = '100%';
      if (etaEl)   etaEl.textContent   = 'Complete';
      if (speedEl) speedEl.textContent  = '—';

      setTimeout(() => {
        document.querySelector('#bm3b-state-downloading').style.display = 'none';
        document.querySelector('#bm3b-state-done').style.display = '';
      }, 600);
    } else {
      clearInterval(progressInterval);
      const errMsg = res?.error || res?.message || 'Unknown error.';
      const errMsgEl = document.querySelector('#bm3b-error-msg');
      if (errMsgEl) errMsgEl.textContent = errMsg;
      document.querySelector('#bm3b-state-downloading').style.display = 'none';
      document.querySelector('#bm3b-state-error').style.display = '';
    }
  } catch (err) {
    clearInterval(progressInterval);
    const errMsgEl = document.querySelector('#bm3b-error-msg');
    if (errMsgEl) errMsgEl.textContent = err.message;
    document.querySelector('#bm3b-state-downloading').style.display = 'none';
    document.querySelector('#bm3b-state-error').style.display = '';
  }
}

function initBypassModalEvents() {
  // V1: Okay
  document.querySelector('#bm1-ok-btn')?.addEventListener('click', closeAllBypassModals);

  // V2: Okay
  document.querySelector('#bm2-ok-btn')?.addEventListener('click', closeAllBypassModals);

  // V3a: Got it
  document.querySelector('#bm3a-ok-btn')?.addEventListener('click', closeAllBypassModals);

  // V3b: Cancel
  document.querySelector('#bm3b-cancel-btn')?.addEventListener('click', closeAllBypassModals);

  // V3b: Bypass → start download
  document.querySelector('#bm3b-bypass-btn')?.addEventListener('click', () => {
    const targetDir = bypassCheckFolderPath
      || document.querySelector('#bd-install-path')?.value.trim()
      || '';
    if (!targetDir) {
      closeAllBypassModals();
      showToast('Could not determine install folder. Use the Manual option.');
      return;
    }
    startBypassDownloadWithProgress(targetDir);
  });

  // V3b: Done → close
  document.querySelector('#bm3b-done-btn')?.addEventListener('click', () => {
    closeAllBypassModals();
    showToast(`Bypass applied! You can now launch ${selectedBypassGame?.name || 'the game'} normally.`);
  });

  // V3b: Error → close
  document.querySelector('#bm3b-error-close-btn')?.addEventListener('click', closeAllBypassModals);

  // V3b: Error → retry
  document.querySelector('#bm3b-error-retry-btn')?.addEventListener('click', () => {
    const targetDir = bypassCheckFolderPath || '';
    if (targetDir) {
      startBypassDownloadWithProgress(targetDir);
    } else {
      closeAllBypassModals();
    }
  });

  // Close on backdrop click (clicking the dark overlay outside the card)
  document.querySelectorAll('.bypass-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeAllBypassModals();
    });
  });
}


/* ── STEAMDB NAVIGATOR ── */
async function searchSteam(query) {
  const term = query.trim();
  const steamPage = document.querySelector('#steamdb');
  const list = document.querySelector('#steam-results-list');
  if (!term) {
    steamPage.classList.remove('searching');
    return;
  }
  steamPage.classList.add('searching');
  list.innerHTML = '<div style="padding:24px;color:#888;font:11px DM Mono">SEARCHING STEAM CATALOG…</div>';

  try {
    const res = await fetch(`/api/store/search?term=${encodeURIComponent(term)}`);
    if (!res.ok) throw new Error(res.status);
    const payload = await res.json();
    const items = (payload.items || []).filter(item => item.type === 'app').slice(0, 12);

    steamCatalog = items.map(item => ({
      name: item.name,
      id: item.id,
      app: 'APP ' + item.id,
      year: 'Steam Store',
      image: item.tiny_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
      tags: ['Steam record'],
      description: 'Loading public Steam store details…'
    }));

    if (!steamCatalog.length) throw new Error('No matches');
    renderSteamCatalog();
    selectSteamGame(steamCatalog[0].id);
  } catch (e) {
    list.innerHTML = '<div style="padding:24px;color:#888;font:11px DM Mono">NO TITLES FOUND.</div>';
  }
}

function renderSteamCatalog() {
  const list = document.querySelector('#steam-results-list');
  list.innerHTML = steamCatalog.map(game => `
    <button class="steam-result ${selectedSteamGame && selectedSteamGame.id === game.id ? 'active' : ''}" data-steam-id="${game.id}">
      <img src="${game.image}" alt=""/>
      <span><strong>${game.name}</strong><small>${game.app}</small></span>
      <i data-lucide="chevron-right" size="15"></i>
    </button>
  `).join('');
  document.querySelector('#steam-result-count').textContent = String(steamCatalog.length).padStart(2, '0') + ' titles';
  refreshIcons();
}

async function selectSteamGame(id) {
  selectedSteamGame = steamCatalog.find(g => String(g.id) === String(id)) || steamCatalog[0];
  if (!selectedSteamGame) return;

  document.querySelector('#steam-title').textContent = selectedSteamGame.name;
  document.querySelector('#steam-meta').textContent = selectedSteamGame.app;
  document.querySelector('#steam-description').textContent = selectedSteamGame.description;
  document.querySelector('#steam-inspector').style.setProperty('--steam-image', `url('${selectedSteamGame.image}')`);
  document.querySelector('#steam-add').disabled = false;
  renderSteamCatalog();

  try {
    const res = await fetch(`/api/store/details?appids=${id}`);
    if (res.ok) {
      const json = await res.json();
      const data = json[id]?.data;
      if (data) {
        selectedSteamGame.name = data.name || selectedSteamGame.name;
        selectedSteamGame.description = data.short_description || selectedSteamGame.description;
        selectedSteamGame.image = data.header_image || selectedSteamGame.image;
        selectedSteamGame.tags = (data.genres || []).map(g => g.description).slice(0, 5);

        document.querySelector('#steam-title').textContent = selectedSteamGame.name;
        document.querySelector('#steam-description').textContent = selectedSteamGame.description;
        document.querySelector('#steam-tags').innerHTML = selectedSteamGame.tags.map(t => `<span>${t}</span>`).join('');
        document.querySelector('#steam-inspector').style.setProperty('--steam-image', `url('${selectedSteamGame.image}')`);
      }
    }
  } catch (_) {}
}

/* ── SETTINGS MANAGEMENT ── */
async function loadSettings() {
  let settings = {};
  try {
    const res = await fetch('/api/settings/get');
    if (res.ok) {
      const json = await res.json();
      settings = json.settings || {};
    }
  } catch (_) {}

  const steamPathInput = document.querySelector('#settings-steam-path');
  const downloadPathInput = document.querySelector('#settings-download-path');
  const manifestToggle = document.querySelector('#settings-manifest-toggle');

  if (steamPathInput) steamPathInput.value = settings.steam_path || localStorage.getItem('powerplay-steam-path') || 'C:\\Program Files (x86)\\Steam';
  if (downloadPathInput) downloadPathInput.value = settings.download_path || localStorage.getItem('powerplay-download-path') || 'C:\\Powerplay Games';
  if (manifestToggle) {
    const checked = settings.include_manifests !== false && localStorage.getItem('powerplay-manifests') !== 'false';
    manifestToggle.classList.toggle('off', !checked);
  }
  await checkSteamHookStatus();
}

async function checkSteamHookStatus() {
  const badge = document.querySelector('#steamtool-status-badge');
  const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
  if (!badge) return;

  try {
    const res = await fetch(`/api/steamtools/status?steamPath=${encodeURIComponent(steamPath)}`).then(r => r.json());
    if (res?.ok && res.installed) {
      badge.style.color = '#22c55e';
      badge.innerHTML = '<i></i>Hook Active & Ready';
    } else {
      badge.style.color = '#f59e0b';
      badge.innerHTML = '<i></i>Hook Not Installed';
    }
  } catch (_) {
    badge.style.color = '#94a3b8';
    badge.innerHTML = '<i></i>Unknown Status';
  }
}

async function saveSettings() {
  const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
  const downloadPath = document.querySelector('#settings-download-path')?.value.trim() || '';
  const manifestChecked = !document.querySelector('#settings-manifest-toggle')?.classList.contains('off');

  localStorage.setItem('powerplay-steam-path', steamPath);
  localStorage.setItem('powerplay-download-path', downloadPath);
  localStorage.setItem('powerplay-manifests', String(manifestChecked));

  await fetch('/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      steam_path: steamPath,
      download_path: downloadPath,
      include_manifests: manifestChecked
    })
  }).catch(() => {});

  showToast('Settings saved successfully.');
}

/* ── CUSTOM INTERFACE BACKGROUND ──
   Stored in IndexedDB so user-selected images and GIFs remain local and do not
   require a backend upload or any Electron filesystem permission. */
const CUSTOM_BACKGROUND_DB = 'powerplay-ui-preferences';
const CUSTOM_BACKGROUND_STORE = 'home-background';
const CUSTOM_BACKGROUND_KEY = 'selected';
let customBackgroundObjectUrl = null;

function getCustomThemeAppearance() {
  const opacity = Math.max(0, Math.min(60, Number(document.querySelector('#custom-theme-opacity')?.value ?? 14)));
  const mode = document.querySelector('.custom-theme-mode-btn.active')?.dataset.themeMode || 'white';
  const tint = document.querySelector('#custom-theme-color')?.value || '#a8c9ed';
  return { opacity, mode, tint };
}

function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '');
  if (!/^[\da-f]{6}$/i.test(value)) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

function applyCustomThemeAppearance(appearance = getCustomThemeAppearance()) {
  const app = document.querySelector('#app');
  if (!app) return;
  const opacity = Math.max(0, Math.min(60, Number(appearance.opacity) || 0)) / 100;
  const isDarkTheme = document.body.classList.contains('dark-theme');
  const color = appearance.mode === 'tint'
    ? hexToRgb(appearance.tint)
    : isDarkTheme && appearance.mode === 'white' ? { r: 12, g: 14, b: 18 } : { r: 255, g: 255, b: 255 };
  // The light wash adapts to the active atmosphere; no wash keeps only image opacity control.
  const washAlpha = appearance.mode === 'white' ? 1 - (opacity * .55) : 1 - opacity;
  app.style.setProperty('--custom-theme-wash', `rgba(${color.r},${color.g},${color.b},${washAlpha})`);
  app.style.setProperty('--custom-theme-opacity', `${Math.round(opacity * 100)}%`);

  const opacityInput = document.querySelector('#custom-theme-opacity');
  const opacityValue = document.querySelector('#custom-theme-opacity-value');
  const colorInput = document.querySelector('#custom-theme-color');
  if (opacityInput) opacityInput.value = String(Math.round(opacity * 100));
  if (opacityValue) opacityValue.textContent = `${Math.round(opacity * 100)}%`;
  if (colorInput) {
    colorInput.value = appearance.tint || '#a8c9ed';
    colorInput.disabled = appearance.mode !== 'tint';
  }
  document.querySelectorAll('.custom-theme-mode-btn').forEach(button => button.classList.toggle('active', button.dataset.themeMode === appearance.mode));
}

async function saveCustomThemeAppearance() {
  localStorage.setItem('powerplay-theme-appearance', JSON.stringify(getCustomThemeAppearance()));
  const saved = await readCustomBackground();
  if (saved?.file instanceof Blob) await writeCustomBackground({ ...saved, appearance: getCustomThemeAppearance() });
}

function openCustomBackgroundDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CUSTOM_BACKGROUND_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUSTOM_BACKGROUND_STORE)) {
        db.createObjectStore(CUSTOM_BACKGROUND_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local background storage.'));
  });
}

async function readCustomBackground() {
  const db = await openCustomBackgroundDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(CUSTOM_BACKGROUND_STORE, 'readonly').objectStore(CUSTOM_BACKGROUND_STORE).get(CUSTOM_BACKGROUND_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read the saved background.'));
  }).finally(() => db.close());
}

async function writeCustomBackground(value) {
  const db = await openCustomBackgroundDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CUSTOM_BACKGROUND_STORE, 'readwrite');
    transaction.objectStore(CUSTOM_BACKGROUND_STORE).put(value, CUSTOM_BACKGROUND_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the background.'));
  }).finally(() => db.close());
}

function updateCustomBackgroundUi(name = '', hasCustomBackground = false) {
  const preview = document.querySelector('#custom-background-preview');
  const status = document.querySelector('#custom-background-status');
  const resetButton = document.querySelector('#custom-background-reset-btn');
  if (preview) {
    preview.classList.toggle('has-image', hasCustomBackground);
    preview.querySelector('span').textContent = hasCustomBackground ? name : 'White interface background';
  }
  if (status) status.textContent = hasCustomBackground ? `Theme overlay: ${name}` : 'Using the white interface background';
  if (resetButton) resetButton.disabled = !hasCustomBackground;
}

function applyCustomBackground(file, name) {
  const app = document.querySelector('#app');
  const preview = document.querySelector('#custom-background-preview');
  if (!app || !file) return;

  if (customBackgroundObjectUrl) URL.revokeObjectURL(customBackgroundObjectUrl);
  customBackgroundObjectUrl = URL.createObjectURL(file);
  app.style.setProperty('--custom-interface-background', `url("${customBackgroundObjectUrl}")`);
  app.classList.add('has-custom-background');
  if (preview) preview.style.backgroundImage = `url("${customBackgroundObjectUrl}")`;
  applyCustomThemeAppearance();
  updateCustomBackgroundUi(name || 'custom background', true);
}

async function restoreDefaultBackground() {
  const app = document.querySelector('#app');
  const preview = document.querySelector('#custom-background-preview');
  if (customBackgroundObjectUrl) {
    URL.revokeObjectURL(customBackgroundObjectUrl);
    customBackgroundObjectUrl = null;
  }
  app?.style.removeProperty('--custom-interface-background');
  app?.style.removeProperty('--custom-theme-wash');
  app?.style.removeProperty('--custom-theme-opacity');
  app?.classList.remove('has-custom-background');
  if (preview) preview.style.removeProperty('background-image');
  await writeCustomBackground(null);
  updateCustomBackgroundUi();
}

async function loadCustomBackground() {
  try {
    const saved = await readCustomBackground();
    let localAppearance = null;
    try { localAppearance = JSON.parse(localStorage.getItem('powerplay-theme-appearance') || 'null'); } catch (_) {}
    applyCustomThemeAppearance(saved?.appearance || localAppearance || { opacity: 14, mode: 'white', tint: '#a8c9ed' });
    if (saved?.file instanceof Blob) {
      applyCustomBackground(saved.file, saved.name);
      applyCustomThemeAppearance(saved.appearance || localAppearance || { opacity: 14, mode: 'white', tint: '#a8c9ed' });
    }
  } catch (error) {
    console.warn('Custom background could not be restored:', error);
  }
}

/* ── EVENT BINDINGS ── */
function initEvents() {
  // Navigation
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-route]');
    if (nav) {
      const target = nav.dataset.route;
      route(target);
      // Refresh library from server every time the user navigates to it
      // so newly injected SteamTool games appear immediately
      if (target === 'library') loadLibrary();
    }
    const card = e.target.closest('.card[data-game-id]');
    if (card) {
      openGameDetail(card.dataset.gameId);
    }
    const providerBtn = e.target.closest('.provider[data-provider]');
    if (providerBtn) {
      openProvider(providerBtn.dataset.provider);
    }
    const bypassCard = e.target.closest('.bypass-card[data-appid]');
    if (bypassCard) {
      openBypassDetail(bypassCard.dataset.appid, bypassCard.dataset.provider);
    }
    const bdBack = e.target.closest('#bd-btn-back');
    if (bdBack) {
      route('provider-games');
    }
  });

  // SteamTool blank bar add
  const addForm = document.querySelector('#add-form');
  const gameInput = document.querySelector('#game-id');
  const addBtn = document.querySelector('#add-button');

  if (gameInput && addBtn) {
    gameInput.addEventListener('input', () => {
      const ready = gameInput.value.trim().length > 1;
      addBtn.disabled = !ready;
      addBtn.classList.toggle('ready', ready);
    });
  }

  if (addForm) {
    addForm.addEventListener('submit', e => {
      e.preventDefault();
      injectSteamGame(gameInput.value);
    });
  }

  // Steam quick buttons
  const restartBtn = document.querySelector('#restart-steam-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      restartBtn.innerHTML = '<span>Restarting…</span>';
      sendSystemAction('reiniciarSteam');
      await fetch('/api/system/restart-steam').catch(() => {});
      setTimeout(() => {
        restartBtn.innerHTML = '<i data-lucide="refresh-cw" size="13"></i> Restart Steam';
        showToast('Steam restart command executed.');
        refreshIcons();
      }, 1500);
    });
  }

  const steamDbBtn = document.querySelector('#open-steamdb-btn');
  if (steamDbBtn) {
    steamDbBtn.addEventListener('click', () => {
      route('steamdb');
    });
  }

  // Sync Library button — manually scan all Lua files and import into DB
  const syncLibraryBtn = document.querySelector('#sync-library-btn');
  if (syncLibraryBtn) {
    syncLibraryBtn.addEventListener('click', async () => {
      const originalHtml = syncLibraryBtn.innerHTML;
      syncLibraryBtn.innerHTML = '<i data-lucide="loader" size="13"></i> Syncing…';
      syncLibraryBtn.disabled = true;
      try {
        const res = await fetch('/api/library/sync', { method: 'POST' });
        const json = await res.json();
        if (json.ok) {
          libraryGames = json.games || libraryGames;
          renderLibrary();
          showToast(`Library synced — ${json.count} games tracked.`);
        } else {
          showToast('Sync failed: ' + (json.error || 'unknown error'));
        }
      } catch (err) {
        showToast('Sync error: ' + err.message);
      } finally {
        syncLibraryBtn.innerHTML = originalHtml;
        syncLibraryBtn.disabled = false;
        refreshIcons();
      }
    });
  }

  // Library search — live filter cards by game name
  const librarySearchInput = document.querySelector('#library-search-input');
  const librarySearchForm = document.querySelector('#library-search');
  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', () => {
      const query = librarySearchInput.value.trim().toLowerCase();
      const grid = document.querySelector('#library-grid');
      const featureCard = document.querySelector('#latest-game');
      if (!grid) return;
      if (!query) {
        renderLibrary();
        return;
      }
      // Filter visible cards — don't mutate libraryGames, just hide/show DOM nodes
      const cards = grid.querySelectorAll('article.card[data-game-id]');
      cards.forEach(card => {
        const title = (card.querySelector('h3')?.textContent || '').toLowerCase();
        card.style.display = title.includes(query) ? '' : 'none';
      });
      if (featureCard) {
        const featTitle = (featureCard.querySelector('h3')?.textContent || '').toLowerCase();
        featureCard.style.display = featTitle.includes(query) ? '' : 'none';
      }
    });
    if (librarySearchForm) {
      librarySearchForm.addEventListener('submit', e => e.preventDefault());
    }
  }

  // Drag and drop zone for manifests/lua
  const dropzone = document.querySelector('#steamtool-dropzone');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault();
      dropzone.classList.remove('over');
    }));
    dropzone.addEventListener('drop', async e => {
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      showToast(`Importing ${files.length} file(s) into Steam…`);
      for (const f of files) {
        const idMatch = f.name.match(/\d+/);
        if (idMatch) {
          await injectSteamGame(idMatch[0]);
        }
      }
    });
  }

  // Bypass Inject Button
  const applyBtn = document.querySelector('#bd-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', applyBypassFix);
  }

  // Steam-style BYPASS Button
  const steamBypassBtn = document.querySelector('#bd-steam-bypass-btn');
  if (steamBypassBtn) {
    steamBypassBtn.addEventListener('click', handleBypassBtnClick);
  }

  // Initialize all bypass modal button events
  initBypassModalEvents();

  // Bypass Detect & Manual Folder Buttons
  const detectBtn = document.querySelector('#bd-detect-btn');
  if (detectBtn) {
    detectBtn.addEventListener('click', detectGameForBypass);
  }

  const manualBtn = document.querySelector('#bd-manual-btn');
  if (manualBtn) {
    manualBtn.addEventListener('click', manualSelectGameForBypass);
  }

  // SteamDB search
  const steamQuery = document.querySelector('#steam-query');
  if (steamQuery) {
    steamQuery.addEventListener('input', e => {
      clearTimeout(steamSearchTimer);
      steamSearchTimer = setTimeout(() => searchSteam(e.target.value), 280);
    });
  }
  document.querySelector('#steam-results-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-steam-id]');
    if (btn) selectSteamGame(btn.dataset.steamId);
  });
  document.querySelector('#steam-add')?.addEventListener('click', () => {
    if (selectedSteamGame) {
      injectSteamGame(selectedSteamGame.id);
    }
  });

  // Settings Tabs
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.querySelector('#' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // Switches
  document.querySelectorAll('.switch').forEach(sw => {
    sw.addEventListener('click', () => {
      sw.classList.toggle('off');
    });
  });

  // Interface atmosphere
  document.querySelectorAll('.atmosphere-theme-btn').forEach(button => {
    button.addEventListener('click', () => {
      const theme = button.dataset.atmosphereTheme === 'dark' ? 'dark' : 'light';
      localStorage.setItem('powerplay-atmosphere-theme', theme);
      applyAtmosphereTheme(theme);
      showToast(`${theme === 'dark' ? 'Black' : 'White'} theme applied.`);
    });
  });

  // Custom image/GIF home background
  const customBackgroundInput = document.querySelector('#custom-background-input');
  document.querySelector('#custom-background-upload-btn')?.addEventListener('click', () => customBackgroundInput?.click());
  customBackgroundInput?.addEventListener('change', async () => {
    const file = customBackgroundInput.files?.[0];
    customBackgroundInput.value = '';
    if (!file) return;

    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    const allowedExtension = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!allowedTypes.has(file.type) && !allowedExtension) {
      showToast('Choose a PNG, JPG, WEBP, or GIF image.');
      return;
    }

    try {
      await writeCustomBackground({ file, name: file.name });
      applyCustomBackground(file, file.name);
      showToast('Custom interface theme applied.');
    } catch (error) {
      console.warn('Custom background could not be saved:', error);
      showToast('Could not save that image locally. Try a smaller file.');
    }
  });
  document.querySelector('#custom-background-reset-btn')?.addEventListener('click', async () => {
    try {
      await restoreDefaultBackground();
      showToast('White interface background restored.');
    } catch (error) {
      console.warn('Default background could not be restored:', error);
      showToast('Could not reset the background.');
    }
  });

  // Theme opacity and wash treatment
  document.querySelector('#custom-theme-opacity')?.addEventListener('input', () => {
    applyCustomThemeAppearance();
  });
  document.querySelector('#custom-theme-opacity')?.addEventListener('change', () => {
    saveCustomThemeAppearance().catch(error => console.warn('Theme appearance could not be saved:', error));
  });
  document.querySelectorAll('.custom-theme-mode-btn').forEach(button => {
    button.addEventListener('click', () => {
      const appearance = { ...getCustomThemeAppearance(), mode: button.dataset.themeMode };
      applyCustomThemeAppearance(appearance);
      saveCustomThemeAppearance().catch(error => console.warn('Theme appearance could not be saved:', error));
    });
  });
  document.querySelector('#custom-theme-color')?.addEventListener('input', () => {
    applyCustomThemeAppearance();
  });
  document.querySelector('#custom-theme-color')?.addEventListener('change', () => {
    saveCustomThemeAppearance().catch(error => console.warn('Theme appearance could not be saved:', error));
  });

  // Save Settings button
  document.querySelector('#save-settings-btn')?.addEventListener('click', saveSettings);

  // Settings Detect Steam button
  document.querySelector('#detect-steam-btn')?.addEventListener('click', async () => {
    const res = await fetch('/api/system/detect-steam-path').then(r => r.json()).catch(() => null);
    if (res?.steamPath) {
      document.querySelector('#settings-steam-path').value = res.steamPath;
      await checkSteamHookStatus();
      showToast('Detected Steam: ' + res.steamPath);
    }
  });

  // Settings Browse Steam Folder
  document.querySelector('#browse-steam-btn')?.addEventListener('click', async () => {
    if (window.electronAPI?.invoke) {
      const selected = await window.electronAPI.invoke('dialog:openDirectory', {
        title: 'Select Steam Installation Directory',
      });
      if (selected) {
        document.querySelector('#settings-steam-path').value = selected;
        await checkSteamHookStatus();
        showToast('Selected Steam directory: ' + selected);
      }
    } else {
      showToast('Folder browser requires Electron desktop mode.');
    }
  });

  // Settings Install / Repair Steam Hook button
  document.querySelector('#install-steamtool-hook-btn')?.addEventListener('click', async () => {
    const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
    const btn = document.querySelector('#install-steamtool-hook-btn');
    if (btn) btn.disabled = true;
    showToast('Installing Steam hook...');

    try {
      const res = await fetch('/api/steamtools/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamPath })
      }).then(r => r.json());

      if (res?.ok) {
        showToast('Steam hook installed successfully!');
        await checkSteamHookStatus();
      } else {
        showToast('Failed to install hook: ' + (res?.error || 'Unknown error'));
      }
    } catch (e) {
      showToast('Error installing hook: ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Settings Restart Steam button
  document.querySelector('#restart-steam-settings-btn')?.addEventListener('click', async () => {
    showToast('Restarting Steam...');
    await fetch('/api/system/restart-steam').catch(() => {});
  });

  // Millennium Plugin — check status on load
  async function checkMillenniumPluginStatus() {
    const badge = document.querySelector('#millennium-plugin-status-badge');
    if (!badge) return;
    const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
    try {
      const res = await fetch(`/api/steamtools/millennium-plugin-status?steamPath=${encodeURIComponent(steamPath)}`).then(r => r.json());
      if (res?.installed) {
        badge.style.color = '#22c55e';
        badge.innerHTML   = '<i></i>Plugin Installed';
      } else {
        badge.style.color = '#f59e0b';
        badge.innerHTML   = '<i></i>Plugin Not Installed';
      }
    } catch (_) {
      badge.style.color = '#94a3b8';
      badge.innerHTML   = '<i></i>Unknown Status';
    }
  }
  checkMillenniumPluginStatus();

  // Millennium Plugin — install / update button
  document.querySelector('#install-millennium-plugin-btn')?.addEventListener('click', async () => {
    const btn       = document.querySelector('#install-millennium-plugin-btn');
    const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
    if (btn) btn.disabled = true;
    showToast('Installing Wong plugin into Millennium...');

    try {
      const res = await fetch('/api/steamtools/install-millennium-plugin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ steamPath }),
      }).then(r => r.json());

      if (res?.ok) {
        showToast('Plugin installed. Enable it in Steam → Millennium → Plugins → wong-inject');
        await checkMillenniumPluginStatus();
      } else {
        showToast('Install failed: ' + (res?.error || 'Unknown error'));
      }
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Settings Clear Manifests (Danger Zone)
  document.querySelector('#clear-manifests-btn')?.addEventListener('click', async () => {
    const confirm = window.confirm('Are you sure you want to purge all Steam manifests created by SteamTool?');
    if (!confirm) return;
    showToast('Purging SteamTool manifests...');
    const steamPath = document.querySelector('#settings-steam-path')?.value.trim() || '';
    try {
      const res = await fetch('/api/steamtools/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamPath })
      });
      showToast('Cleaned up Steam manifests.');
    } catch (_) {}
  });

  // Initialize First-Time Setup Wizard
  initOnboardingWizard();
}

/* ── FIRST-TIME SETUP WIZARD ── */
function initOnboardingWizard() {
  const overlay = document.querySelector('#onboarding-overlay');
  const pathInput = document.querySelector('#ob-steam-path-input');
  if (!overlay) return;

  function goToStep(stepNum) {
    document.querySelectorAll('.onboarding-step-dot').forEach((dot, idx) => {
      const num = idx + 1;
      dot.classList.toggle('active', num === stepNum);
      dot.classList.toggle('done', num < stepNum);
    });
    document.querySelectorAll('.onboarding-step-content').forEach(content => {
      content.classList.remove('active');
    });
    document.querySelector(`#ob-step-${stepNum}`)?.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
  }

  // Pre-fill detected Steam path
  const currentSteamPath = document.querySelector('#settings-steam-path')?.value.trim() 
    || localStorage.getItem('powerplay-steam-path') 
    || 'C:\\Program Files (x86)\\Steam';
  if (pathInput) pathInput.value = currentSteamPath;

  // Step 1: Welcome & Notice
  document.querySelector('#ob-next-1-btn')?.addEventListener('click', () => {
    goToStep(2);
  });
  document.querySelector('#ob-skip-btn')?.addEventListener('click', () => {
    overlay.classList.remove('active');
    localStorage.setItem('wong_onboarding_completed', 'true');
    showToast('Setup skipped. You can configure Steam Hook anytime in Settings.');
  });

  // Step 2: Confirm Steam Path
  document.querySelector('#ob-back-2-btn')?.addEventListener('click', () => {
    goToStep(1);
  });
  
  const browseAction = async () => {
    let selected = null;
    try {
      if (window.api?.openDirectory) {
        selected = await window.api.openDirectory({ title: 'Select Steam Installation Directory' });
      } else if (window.api?.ejecutarAsync) {
        selected = await window.api.ejecutarAsync('dialog:openDirectory', { title: 'Select Steam Installation Directory' });
      } else if (window.electronAPI?.invoke) {
        selected = await window.electronAPI.invoke('dialog:openDirectory', { title: 'Select Steam Installation Directory' });
      } else {
        showToast('File explorer requires Electron desktop mode.');
        return;
      }
    } catch (err) {
      console.warn('Folder picker error:', err);
    }

    if (selected && pathInput) {
      pathInput.value = selected;
      localStorage.setItem('powerplay-steam-path', selected);
      const settingsPathInput = document.querySelector('#settings-steam-path');
      if (settingsPathInput) settingsPathInput.value = selected;
      showToast('Selected Steam directory: ' + selected);
    }
  };
  document.querySelector('#ob-browse-btn')?.addEventListener('click', browseAction);
  document.querySelector('#ob-no-path-btn')?.addEventListener('click', browseAction);
  document.querySelector('#browse-steam-btn')?.addEventListener('click', browseAction);

  document.querySelector('#ob-yes-path-btn')?.addEventListener('click', async () => {
    const chosenPath = pathInput?.value.trim() || 'C:\\Program Files (x86)\\Steam';
    localStorage.setItem('powerplay-steam-path', chosenPath);
    const settingsPathInput = document.querySelector('#settings-steam-path');
    if (settingsPathInput) settingsPathInput.value = chosenPath;
    await fetch('/api/settings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steam_path: chosenPath })
    }).catch(() => {});
    goToStep(3);
  });

  // Step 3: Install Steam Hook
  document.querySelector('#ob-back-3-btn')?.addEventListener('click', () => {
    goToStep(2);
  });
  document.querySelector('#ob-reject-hook-btn')?.addEventListener('click', () => {
    showToast('Steam hook installation skipped.');
    goToStep(4);
  });
  document.querySelector('#ob-install-hook-btn')?.addEventListener('click', async () => {
    const btn = document.querySelector('#ob-install-hook-btn');
    const steamPath = pathInput?.value.trim() || 'C:\\Program Files (x86)\\Steam';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Installing Hook...</span>';
    }
    showToast('Installing Steam runtime hook...');
    try {
      const res = await fetch('/api/steamtools/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamPath })
      }).then(r => r.json());

      if (res?.ok) {
        if (btn) {
          btn.style.background = '#22c55e';
          btn.style.color = '#fff';
          btn.innerHTML = '<span>✓ Hook Installed!</span>';
        }
        showToast('Steam hook installed successfully!');
        await checkSteamHookStatus();
        setTimeout(() => goToStep(4), 600);
      } else {
        showToast('Failed to install hook: ' + (res?.error || 'Unknown error'));
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Retry Install Hook</span>';
        }
      }
    } catch (err) {
      showToast('Error installing hook: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Retry Install Hook</span>';
      }
    }
  });

  // Step 4: Finish & Launch
  document.querySelector('#ob-finish-btn')?.addEventListener('click', () => {
    overlay.classList.remove('active');
    localStorage.setItem('wong_onboarding_completed', 'true');
    showToast('Welcome to Wong! Enjoy your library.');
  });

  // Settings: Rerun Wizard & Direct Testing
  document.querySelector('#open-wizard-btn')?.addEventListener('click', () => {
    goToStep(1);
    overlay.classList.add('active');
  });

  document.querySelector('#launch-wizard-full-btn')?.addEventListener('click', () => {
    goToStep(1);
    overlay.classList.add('active');
  });

  document.querySelector('#reset-wizard-state-btn')?.addEventListener('click', () => {
    localStorage.removeItem('wong_onboarding_completed');
    showToast('First-launch state reset. Wizard will trigger on next fresh launch.');
  });

  document.querySelectorAll('.test-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10) || 1;
      goToStep(step);
      overlay.classList.add('active');
    });
  });

  document.querySelector('#ob-close-btn')?.addEventListener('click', () => {
    overlay.classList.remove('active');
  });

  // Auto-show on first launch if not completed
  const hasOnboarded = localStorage.getItem('wong_onboarding_completed') === 'true';
  if (!hasOnboarded) {
    setTimeout(() => {
      goToStep(1);
      overlay.classList.add('active');
    }, 400);
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  initEvents();
  loadAtmosphereTheme();
  preloadProviderInteractionImages();
  await loadCustomBackground();
  await loadLibrary();
  await loadSettings();
  setTimeout(() => {
    const loader = document.querySelector('#loading');
    if (loader) loader.classList.add('done');
  }, 600);
});
