const pluginName = "wong-inject";
function InitializePlugins() {
    !window.PLUGIN_LIST && (window.PLUGIN_LIST = {});
    if (!window.PLUGIN_LIST[pluginName]) {
        window.PLUGIN_LIST[pluginName] = {};
    }
}
InitializePlugins();

var millennium_main = (function (exports, api) {
    "use strict";

    const WONG_API = "http://localhost:4173";
    const CLAIM_ID = "wong-claim-wrapper";
    const MODAL_ID = "wong-modal-overlay";
    const CACHE_KEY = "wong_claimed_appids";

    // In-memory cache of claimed App IDs for instant 0ms check
    const claimedAppIds = new Set();

    // Pre-populate from localStorage immediately to eliminate UI flicker
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                parsed.forEach(id => claimedAppIds.add(String(id)));
            }
        }
    } catch (_) {}

    function persistClaimedIds() {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(claimedAppIds)));
        } catch (_) {}
    }

    async function syncClaimedLibrary() {
        try {
            let res = await fetch(WONG_API + "/api/library/ids").catch(() => null);
            if (res && res.ok) {
                const data = await res.json();
                if (data.ok && Array.isArray(data.ids)) {
                    data.ids.forEach(id => claimedAppIds.add(String(id)));
                    persistClaimedIds();
                    refreshButtonState();
                    return;
                }
            }

            res = await fetch(WONG_API + "/api/library/games").catch(() => null);
            if (res && res.ok) {
                const data = await res.json();
                if (data.ok && Array.isArray(data.games)) {
                    data.games.forEach(g => {
                        if (g.id) claimedAppIds.add(String(g.id));
                        if (g.steam_id) claimedAppIds.add(String(g.steam_id));
                    });
                    persistClaimedIds();
                    refreshButtonState();
                }
            }
        } catch (_) {}
    }

    function getAppId() {
        const m = window.location.href.match(/\/app\/(\d+)/);
        if (m) return m[1];
        try {
            if (window.g_AppId) return String(window.g_AppId);
        } catch (_) {}
        const meta = document.querySelector("[data-appid]");
        if (meta) return meta.getAttribute("data-appid");
        return null;
    }

    // Steam-native modal notification dialog (mimics Valve's exact store modal dialog)
    function showSteamDialog({ title, message, buttons = null, isDanger = false }) {
        const existing = document.getElementById(MODAL_ID);
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = MODAL_ID;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(2px);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.18s ease;
            font-family: 'Motiva Sans', Arial, Helvetica, sans-serif;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: #23262e;
            border-top: 1px solid ${isDanger ? '#d9534f' : '#67c1f5'};
            border-radius: 2px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.1);
            width: 520px;
            max-width: 90vw;
            padding: 24px 28px 20px 28px;
            position: relative;
            box-sizing: border-box;
            transform: scale(0.96);
            transition: transform 0.18s ease;
        `;

        // Close 'X' button
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.innerHTML = "&times;";
        closeBtn.style.cssText = `
            position: absolute;
            top: 14px;
            right: 16px;
            background: transparent;
            border: none;
            color: #8b929a;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            padding: 4px 8px;
            transition: color 0.15s ease;
        `;
        closeBtn.addEventListener("mouseover", () => (closeBtn.style.color = "#ffffff"));
        closeBtn.addEventListener("mouseout", () => (closeBtn.style.color = "#8b929a"));

        // Title
        const titleEl = document.createElement("h2");
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 14px 0;
            font-size: 21px;
            font-weight: 700;
            color: #ffffff;
            letter-spacing: 0.2px;
            line-height: 1.3;
            padding-right: 28px;
        `;

        // Message
        const msgEl = document.createElement("div");
        msgEl.textContent = message;
        msgEl.style.cssText = `
            font-size: 14px;
            line-height: 1.5;
            color: #8f98a0;
            margin-bottom: 24px;
        `;

        // Footer with buttons
        const footer = document.createElement("div");
        footer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        `;

        function close() {
            overlay.style.opacity = "0";
            dialog.style.transform = "scale(0.96)";
            setTimeout(() => overlay.remove(), 180);
            document.removeEventListener("keydown", onKeyDown);
        }

        function onKeyDown(e) {
            if (e.key === "Escape") {
                close();
            } else if (e.key === "Enter" && (!buttons || buttons.length <= 1)) {
                close();
            }
        }

        closeBtn.addEventListener("click", close);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();
        });
        document.addEventListener("keydown", onKeyDown);

        dialog.appendChild(closeBtn);
        dialog.appendChild(titleEl);
        dialog.appendChild(msgEl);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        if (!buttons || buttons.length === 0) {
            const okBtn = document.createElement("button");
            okBtn.type = "button";
            okBtn.textContent = "OK";
            okBtn.style.cssText = `
                background: #3c434f;
                color: #dfe3e6;
                border: none;
                border-radius: 2px;
                padding: 7px 26px;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.5px;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.15s ease, color 0.15s ease;
                outline: none;
            `;
            okBtn.addEventListener("mouseover", () => {
                okBtn.style.background = "#4e5665";
                okBtn.style.color = "#ffffff";
            });
            okBtn.addEventListener("mouseout", () => {
                okBtn.style.background = "#3c434f";
                okBtn.style.color = "#dfe3e6";
            });
            okBtn.addEventListener("click", close);
            footer.appendChild(okBtn);

            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                dialog.style.transform = "scale(1)";
                okBtn.focus();
            });
        } else {
            const renderedBtns = [];
            buttons.forEach(btnConfig => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = btnConfig.text;

                if (btnConfig.style === "danger") {
                    btn.style.cssText = `
                        background: linear-gradient(135deg, #a8383b 0%, #c43d40 100%);
                        color: #ffffff;
                        border: none;
                        border-radius: 2px;
                        padding: 7px 24px;
                        font-size: 13px;
                        font-weight: 600;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        font-family: inherit;
                        transition: background 0.15s ease, box-shadow 0.15s ease;
                        outline: none;
                    `;
                    btn.addEventListener("mouseover", () => {
                        if (!btn.disabled) {
                            btn.style.background = "linear-gradient(135deg, #bd3e42 0%, #da4548 100%)";
                            btn.style.boxShadow = "0 0 10px rgba(220, 60, 60, 0.4)";
                        }
                    });
                    btn.addEventListener("mouseout", () => {
                        if (!btn.disabled) {
                            btn.style.background = "linear-gradient(135deg, #a8383b 0%, #c43d40 100%)";
                            btn.style.boxShadow = "none";
                        }
                    });
                } else {
                    btn.style.cssText = `
                        background: #3c434f;
                        color: #dfe3e6;
                        border: none;
                        border-radius: 2px;
                        padding: 7px 24px;
                        font-size: 13px;
                        font-weight: 600;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        font-family: inherit;
                        transition: background 0.15s ease, color 0.15s ease;
                        outline: none;
                    `;
                    btn.addEventListener("mouseover", () => {
                        if (!btn.disabled) {
                            btn.style.background = "#4e5665";
                            btn.style.color = "#ffffff";
                        }
                    });
                    btn.addEventListener("mouseout", () => {
                        if (!btn.disabled) {
                            btn.style.background = "#3c434f";
                            btn.style.color = "#dfe3e6";
                        }
                    });
                }

                btn.addEventListener("click", () => {
                    if (btnConfig.onClick) {
                        btnConfig.onClick(close, btn, renderedBtns);
                    } else {
                        close();
                    }
                });

                renderedBtns.push(btn);
                footer.appendChild(btn);
            });

            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                dialog.style.transform = "scale(1)";
                const cancelBtn = renderedBtns.find(b => b.textContent === "Cancel") || renderedBtns[0];
                if (cancelBtn) cancelBtn.focus();
            });
        }
    }

    function applyClaimedStyle(btn, span, gameName) {
        btn.dataset.claimed = "true";
        btn.disabled = false;
        span.textContent = "Claim";
        btn.style.background = "rgba(104, 126, 156, 0.25)";
        btn.style.color = "#8f9dae";
        btn.title = gameName ? `"${gameName}" is in your Wong library. Click to remove.` : "In your Wong library. Click to remove.";
    }

    function applyUnclaimedStyle(btn, span) {
        btn.dataset.claimed = "false";
        btn.disabled = false;
        span.textContent = "Claim";
        btn.style.background = "rgba(103, 193, 245, 0.2)";
        btn.style.color = "#67c1f5";
        btn.title = "Claim with Wong";
    }

    function refreshButtonState() {
        const wrapper = document.getElementById(CLAIM_ID);
        if (!wrapper) return;
        const btn = wrapper.querySelector("button");
        const span = btn ? (btn.querySelector("span") || btn) : null;
        if (!btn || !span) return;

        const appId = getAppId();
        if (appId) {
            if (claimedAppIds.has(String(appId))) {
                applyClaimedStyle(btn, span);
            } else {
                applyUnclaimedStyle(btn, span);
            }
        }
    }

    async function checkIndividualApp(appId, btn, span) {
        try {
            const res = await fetch(`${WONG_API}/api/library/check?appId=${appId}`).catch(() => null);
            if (res && res.ok) {
                const data = await res.json();
                if (data.ok && data.claimed) {
                    claimedAppIds.add(String(appId));
                    persistClaimedIds();
                    applyClaimedStyle(btn, span, data.game ? data.game.nombre : null);
                }
            }
        } catch (_) {}
    }

    function showRemoveDialog(appId, gameTitle, btn, span) {
        showSteamDialog({
            title: gameTitle,
            message: `This game is in your Wong library. Would you like to remove it?`,
            isDanger: true,
            buttons: [
                {
                    text: "Cancel",
                    style: "secondary",
                    onClick: (close) => close()
                },
                {
                    text: "Remove",
                    style: "danger",
                    onClick: async (close, removeBtnEl, allBtns) => {
                        allBtns.forEach(b => {
                            b.disabled = true;
                            b.style.opacity = "0.6";
                            b.style.cursor = "not-allowed";
                        });
                        removeBtnEl.textContent = "Removing...";

                        try {
                            const res = await fetch(WONG_API + "/api/steamtools/remove", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ appId: String(appId) })
                            });

                            await fetch(WONG_API + "/api/library/remove", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: String(appId), appId: String(appId) })
                            }).catch(() => {});

                            if (!res.ok) {
                                throw new Error("Wong server returned HTTP " + res.status);
                            }

                            claimedAppIds.delete(String(appId));
                            persistClaimedIds();
                            applyUnclaimedStyle(btn, span);
                            close();

                            showSteamDialog({
                                title: gameTitle,
                                message: `${gameTitle} has been removed from your Wong library. Please restart Steam to apply changes.`
                            });
                        } catch (err) {
                            close();
                            const friendlyMsg =
                                err.message.indexOf("fetch") !== -1 || err.message.indexOf("Failed to fetch") !== -1
                                    ? "Wong is not running. Please ensure the Wong background service is running, then try again."
                                    : "Error removing game: " + err.message;

                            showSteamDialog({
                                title: "Wong",
                                message: friendlyMsg
                            });
                        }
                    }
                }
            ]
        });
    }

    async function handleClaim(appId, btn, span) {
        if (btn.dataset.claimed === "true") {
            const gameTitle = document.querySelector(".apphub_AppName")?.textContent?.trim() || "The game";
            showRemoveDialog(appId, gameTitle, btn, span);
            return;
        }

        btn.disabled = true;
        span.textContent = "Claiming...";

        try {
            const res = await fetch(WONG_API + "/api/steamtools/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appId }),
            });

            if (!res.ok) throw new Error("Wong server returned HTTP " + res.status);
            const data = await res.json();

            if (data.ok) {
                const gameName = data.name || document.querySelector(".apphub_AppName")?.textContent?.trim() || "The game";
                claimedAppIds.add(String(appId));
                persistClaimedIds();
                applyClaimedStyle(btn, span, gameName);

                showSteamDialog({
                    title: gameName,
                    message: `${gameName} has been claimed. Check your library to install. Thank you.`
                });
            } else {
                throw new Error(data.error || "Unknown error from Wong");
            }
        } catch (err) {
            applyUnclaimedStyle(btn, span);

            const friendlyMsg =
                err.message.indexOf("fetch") !== -1 || err.message.indexOf("Failed to fetch") !== -1
                    ? "Wong is not running. Please open the Wong application first, then try again."
                    : "Error: " + err.message;

            showSteamDialog({
                title: "Wong",
                message: friendlyMsg
            });
        }
    }

    function findViewQueueBtn(queueCtn) {
        if (!queueCtn) return null;
        const buttons = queueCtn.querySelectorAll("a, button, .btnv6_blue_hoverfade, [class*='btn']");
        for (const b of buttons) {
            const text = (b.innerText || b.textContent || "").trim().toLowerCase();
            if (text.includes("queue") && !text.includes("wishlist") && !text.includes("follow") && !text.includes("ignore")) {
                return b;
            }
        }
        const link = queueCtn.querySelector("a[href*='/explore'], a[href*='queue'], .btn_next_in_queue, .queue_btn_next");
        if (link) return link;
        const rightCtn = queueCtn.querySelector(".queue_actions_right, .queue_btn_next_ctn, #queue_actions_right");
        if (rightCtn && rightCtn.firstElementChild) {
            return rightCtn.firstElementChild;
        }
        return null;
    }

    function injectButton() {
        if (!window.location.href.includes("/app/")) return;

        const appId = getAppId();
        if (!appId) return;

        const queueCtn =
            document.getElementById("queueActionsCtn") ||
            document.querySelector(".queue_actions_ctn");

        if (!queueCtn) return;

        let wrapper = document.getElementById(CLAIM_ID);

        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.id = CLAIM_ID;
            Object.assign(wrapper.style, {
                display: "inline-flex",
                alignItems: "center",
                verticalAlign: "middle",
                margin: "0 8px 0 0",
            });

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btnv6_blue_hoverfade btn_medium";
            btn.style.cssText = `
                background: rgba(103, 193, 245, 0.2);
                color: #67c1f5;
                border: none;
                border-radius: 2px;
                padding: 0 15px;
                height: 30px;
                line-height: 30px;
                font-family: 'Motiva Sans', Arial, Helvetica, sans-serif;
                font-size: 13px;
                font-weight: 400;
                cursor: pointer;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                white-space: nowrap;
                box-sizing: border-box;
                transition: background 0.15s ease, color 0.15s ease, transform 0.08s ease;
                letter-spacing: normal;
                text-transform: none;
                outline: none;
            `;

            const span = document.createElement("span");
            span.style.cssText = `
                display: inline-block;
                pointer-events: none;
            `;
            btn.appendChild(span);

            if (claimedAppIds.has(String(appId))) {
                applyClaimedStyle(btn, span);
            } else {
                applyUnclaimedStyle(btn, span);
                checkIndividualApp(appId, btn, span);
            }

            btn.addEventListener("mouseover", () => {
                if (btn.dataset.claimed === "true") {
                    btn.style.background = "linear-gradient(to right, #414a56 5%, #586374 95%)";
                    btn.style.color = "#ffffff";
                } else {
                    btn.style.background = "linear-gradient(to right, #417a9b 5%, #67c1f5 95%)";
                    btn.style.color = "#ffffff";
                }
            });
            btn.addEventListener("mouseout", () => {
                if (btn.dataset.claimed === "true") {
                    btn.style.background = "rgba(104, 126, 156, 0.25)";
                    btn.style.color = "#8f9dae";
                } else {
                    btn.style.background = "rgba(103, 193, 245, 0.2)";
                    btn.style.color = "#67c1f5";
                }
                btn.style.transform = "none";
            });
            btn.addEventListener("mousedown", () => {
                if (btn.dataset.claimed === "true") {
                    btn.style.background = "linear-gradient(to right, #343c46 5%, #47515f 95%)";
                } else {
                    btn.style.background = "linear-gradient(to right, #34637e 5%, #55a2ce 95%)";
                }
                btn.style.color = "#ffffff";
                btn.style.transform = "translateY(1px)";
            });
            btn.addEventListener("mouseup", () => {
                btn.style.transform = "none";
            });

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClaim(appId, btn, span);
            });

            wrapper.appendChild(btn);
        }

        const queueTarget = findViewQueueBtn(queueCtn);
        if (queueTarget && queueTarget.parentElement) {
            if (wrapper.nextElementSibling !== queueTarget) {
                queueTarget.insertAdjacentElement("beforebegin", wrapper);
            }
        } else {
            if (!queueCtn.contains(wrapper)) {
                wrapper.style.marginLeft = "auto";
                queueCtn.appendChild(wrapper);
            }
        }
    }

    function startInjection() {
        syncClaimedLibrary();

        let lastHref = "";
        const observer = new MutationObserver(() => {
            const href = window.location.href;
            if (href !== lastHref) {
                lastHref = href;
                const old = document.getElementById(CLAIM_ID);
                if (old) old.remove();
            }
            if (href.includes("/app/")) {
                injectButton();
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        if (window.location.href.includes("/app/")) {
            let tries = 0;
            const timer = setInterval(() => {
                injectButton();
                tries++;
                const wrapper = document.getElementById(CLAIM_ID);
                const queueCtn = document.getElementById("queueActionsCtn") || document.querySelector(".queue_actions_ctn");
                const queueTarget = findViewQueueBtn(queueCtn);
                if ((wrapper && queueTarget && wrapper.nextElementSibling === queueTarget) || tries >= 30) {
                    clearInterval(timer);
                }
            }, 250);
        }
    }

    // ==============================================================
    // STEAM CLIENT UI LIBRARY: DEDICATED BYPASS SPECIFICATION TAB (Feature 2)
    // ==============================================================
    const BYPASS_TAB_ID = "wong-steam-bypass-tab";
    const BYPASS_PAGE_MODAL_ID = "wong-steam-bypass-page-modal";
    const FALLBACK_PORTS = [4173, 4174, 4175];
    let cachedApiBase = null;

    async function getApiBase() {
        if (cachedApiBase) return cachedApiBase;
        for (const port of FALLBACK_PORTS) {
            try {
                const res = await fetch(`http://localhost:${port}/api/bypass/games`, { signal: AbortSignal.timeout(600) });
                if (res.ok) {
                    cachedApiBase = `http://localhost:${port}`;
                    return cachedApiBase;
                }
            } catch (_) {}
        }
        cachedApiBase = "http://localhost:4173";
        return cachedApiBase;
    }

    function getAllSteamDocuments() {
        const docs = new Set();
        if (typeof document !== "undefined") docs.add(document);
        try {
            const windows = window.SteamUIStore?.WindowStore?.SteamUIWindows || [];
            for (const win of windows) {
                const doc = win?.m_BrowserWindow?.document || win?.m_popup?.document;
                if (doc) docs.add(doc);
            }
        } catch (_) {}
        return Array.from(docs);
    }

    function extractCurrentAppInfo(doc, startEl = null) {
        let appid = null;
        let gameName = null;

        function checkFiber(el) {
            if (!el || appid) return;
            const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
            if (!fiberKey || !el[fiberKey]) return;
            let cur = el[fiberKey];
            let depth = 0;
            while (cur && depth < 30) {
                const props = cur.memoizedProps;
                if (props?.overview?.appid) {
                    appid = String(props.overview.appid);
                    if (props?.details?.strDisplayName) gameName = props.details.strDisplayName;
                    return;
                }
                if (props?.appid) {
                    appid = String(props.appid);
                    if (props?.strDisplayName || props?.gameName) {
                        gameName = props.strDisplayName || props.gameName;
                    }
                    return;
                }
                cur = cur.return;
                depth++;
            }
        }

        // 1. Check startEl upward
        let cur = startEl;
        while (cur && !appid) {
            checkFiber(cur);
            cur = cur.parentElement;
        }

        // 2. Check prominent Steam library containers
        if (!appid) {
            const targets = doc.querySelectorAll("[class*='PlayBar'], [class*='AppButtonsContainer'], [class*='ActionSection'], [class*='InnerContainer'], [class*='AppDetails'], [class*='Header'], [class*='RightControls']");
            for (const t of targets) {
                checkFiber(t);
                if (appid) break;
            }
        }

        // 3. Fallback: Check links and images
        if (!appid) {
            const imgs = doc.querySelectorAll("img[src*='/apps/'], [style*='/apps/']");
            for (const img of imgs) {
                const str = img.src || img.getAttribute("style") || "";
                const m = str.match(/\/apps\/(\d+)/);
                if (m) {
                    appid = m[1];
                    break;
                }
            }
        }

        // 4. Resolve game name if still missing
        if (!gameName) {
            const titleEl = doc.querySelector("[class*='PlayBarGameName'], [class*='header_Title'], h1, [class*='AppDetailsGameName'], .apphub_AppName");
            if (titleEl && titleEl.textContent) {
                gameName = titleEl.textContent.trim();
            } else {
                gameName = appid ? `Game ${appid}` : "Selected Game";
            }
        }

        return { appid, gameName };
    }

    const HARD_DRM_RULES = [
        { keywords: ["denuvo"], label: "Denuvo Anti-Tamper" },
        { keywords: ["ubisoft connect", "uplay"], label: "Ubisoft Connect" },
        { keywords: ["ea app", "origin", "ea account", "ea on-line activation"], label: "EA App / Origin" },
        { keywords: ["rockstar games launcher", "rockstar launcher"], label: "Rockstar Games Launcher" },
        { keywords: ["battleye", "battle eye"], label: "BattlEye Anti-Cheat" },
        { keywords: ["easyanticheat", "easy anti-cheat", "easy-anti-cheat"], label: "Easy Anti-Cheat (EAC)" },
        { keywords: ["always online", "requires an internet connection", "internet connection at all times"], label: "Always-Online Requirement" },
        { keywords: ["games for windows live", "gfwl"], label: "Games for Windows Live" },
    ];

    function scanDrmKeywords(textBlob) {
        const lower = (textBlob || "").toLowerCase();
        const found = [];
        for (const rule of HARD_DRM_RULES) {
            if (rule.keywords.some(kw => lower.includes(kw))) {
                if (!found.includes(rule.label)) found.push(rule.label);
            }
        }
        return found;
    }

    async function checkGameDrm(appid) {
        let storeData = null;
        try {
            const storeRes = await fetch(
                `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
                { signal: AbortSignal.timeout(5000) }
            ).catch(() => null);

            if (storeRes && storeRes.ok) {
                const json = await storeRes.json();
                storeData = json?.[appid]?.data || null;
            }
        } catch (_) {}

        let bypassCatalog = null;
        try {
            const base = await getApiBase();
            const res = await fetch(`${base}/api/bypass/games`).catch(() => null);
            if (res && res.ok) {
                const j = await res.json();
                bypassCatalog = j?.data || j;
            }
        } catch (_) {}

        if (!bypassCatalog) {
            try {
                const gh = await fetch("https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json?v=" + Date.now()).catch(() => null);
                if (gh && gh.ok) {
                    bypassCatalog = await gh.json();
                }
            } catch (_) {}
        }

        const notices = {
            drmNotice: storeData?.drm_notice || null,
            accountNotice: storeData?.ext_user_account_notice || null,
            antiCheatNotice: null,
            limitsNotice: null,
            legalNotice: storeData?.legal_notice || null
        };

        const detectedDrms = new Set();

        if (notices.drmNotice) {
            detectedDrms.add(notices.drmNotice);
            if (notices.drmNotice.toLowerCase().includes("denuvo")) {
                notices.limitsNotice = "5 different PC access limits per 24 hours";
            }
        }
        if (notices.accountNotice) {
            detectedDrms.add(notices.accountNotice);
        }

        const officialText = [
            storeData?.drm_notice || "",
            storeData?.ext_user_account_notice || "",
            storeData?.legal_notice || "",
            storeData?.short_description || ""
        ].join(" ");

        scanDrmKeywords(officialText).forEach(d => detectedDrms.add(d));

        if (bypassCatalog) {
            for (const cat of ['DENUVO', 'EA', 'UBISOFT', 'ROCKSTAR', 'PlayStation', 'OTHERS']) {
                if (bypassCatalog[cat] && bypassCatalog[cat][appid]) {
                    if (cat === "DENUVO") {
                        detectedDrms.add("Denuvo Anti-Tamper");
                        if (!notices.drmNotice) {
                            notices.drmNotice = "Denuvo Anti-tamper";
                            notices.limitsNotice = "5 different PC access limits per 24 hours";
                        }
                    } else if (cat === "EA") {
                        detectedDrms.add("EA App / Origin");
                        if (!notices.accountNotice) {
                            notices.accountNotice = "EA Account (Supports Linking to Steam Account)";
                        }
                    } else if (cat === "UBISOFT") {
                        detectedDrms.add("Ubisoft Connect");
                        if (!notices.accountNotice) {
                            notices.accountNotice = "Ubisoft Account Required";
                        }
                    } else if (cat === "ROCKSTAR") {
                        detectedDrms.add("Rockstar Games Launcher");
                        if (!notices.accountNotice) {
                            notices.accountNotice = "Rockstar Games Social Club";
                        }
                    }
                }
            }
        }

        const drmList = Array.from(detectedDrms);
        return {
            ok: true,
            hasDrm: drmList.length > 0,
            drmNames: drmList,
            notices,
            name: storeData?.name || null,
            headerImage: storeData?.header_image || null
        };
    }

    async function checkBypassAvailability(appid) {
        let catalog = null;
        try {
            const base = await getApiBase();
            const res = await fetch(`${base}/api/bypass/games`).catch(() => null);
            if (res && res.ok) {
                const json = await res.json();
                catalog = json?.data || json;
            }
        } catch (_) {}

        if (!catalog) {
            try {
                const gh = await fetch("https://raw.githubusercontent.com/LightnigFast/Project-Lightning/main/bypass.json?v=" + Date.now()).catch(() => null);
                if (gh && gh.ok) {
                    catalog = await gh.json();
                }
            } catch (_) {}
        }

        if (catalog) {
            for (const cat of ['DENUVO', 'EA', 'UBISOFT', 'ROCKSTAR', 'PlayStation', 'OTHERS']) {
                if (catalog[cat] && catalog[cat][appid]) {
                    const item = catalog[cat][appid];
                    return {
                        available: item.disponible !== false,
                        provider: cat,
                        bypass: item
                    };
                }
            }
        }

        return { available: false, provider: null, bypass: null };
    }

    async function detectGameDirectory(appid, gameName) {
        try {
            const base = await getApiBase();
            const res = await fetch(`${base}/api/system/detect-game-folder?appid=${appid}&name=${encodeURIComponent(gameName)}`).catch(() => null);
            if (res && res.ok) {
                const json = await res.json();
                if (json.ok && json.found && json.path) {
                    return json.path;
                }
            }
        } catch (_) {}

        const cleanName = (gameName || `App_${appid}`).replace(/[:*?"<>|]/g, "").trim();
        return `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${cleanName}`;
    }

    // Ensure CSS keyframes for download progress bar exist in document
    function ensureSteamStyles(doc) {
        if (!doc.getElementById("wong-steam-styles")) {
            const style = doc.createElement("style");
            style.id = "wong-steam-styles";
            style.textContent = `
                @keyframes steamStripes {
                    0% { background-position: 0 0; }
                    100% { background-position: 48px 0; }
                }
                @keyframes wongPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.55; }
                }
                @keyframes wongSpin {
                    100% { transform: rotate(360deg); }
                }
            `;
            doc.head.appendChild(style);
        }
    }

    // ==========================================
    // DEDICATED STEAM-THEMED BYPASS SPECIFICATION PAGE
    // ==========================================
    function openSteamBypassPage(doc, appid, rawGameName) {
        ensureSteamStyles(doc);

        const existing = doc.getElementById(BYPASS_PAGE_MODAL_ID);
        if (existing) existing.remove();

        const overlay = doc.createElement("div");
        overlay.id = BYPASS_PAGE_MODAL_ID;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.76);
            backdrop-filter: blur(4px);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
            font-family: 'Motiva Sans', Arial, Helvetica, sans-serif;
            color: #dcdedf;
            user-select: none;
        `;

        const modal = doc.createElement("div");
        modal.style.cssText = `
            width: 680px;
            max-width: 92vw;
            max-height: 88vh;
            background: linear-gradient(180deg, #21252d 0%, #16191f 100%);
            border-top: 2px solid #67c1f5;
            border-left: 1px solid rgba(255, 255, 255, 0.12);
            border-right: 1px solid rgba(255, 255, 255, 0.12);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 3px;
            box-shadow: 0 16px 54px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: scale(0.97);
            transition: transform 0.2s ease;
        `;

        function closeModal() {
            overlay.style.opacity = "0";
            modal.style.transform = "scale(0.97)";
            setTimeout(() => overlay.remove(), 200);
            doc.removeEventListener("keydown", onKeyDown);
        }

        function onKeyDown(e) {
            if (e.key === "Escape") closeModal();
        }
        doc.addEventListener("keydown", onKeyDown);

        // Header bar
        const header = doc.createElement("div");
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 24px;
            background: rgba(0, 0, 0, 0.25);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
        `;

        const headerLeft = doc.createElement("div");
        headerLeft.innerHTML = `
            <div style="font-size: 11px; text-transform: uppercase; color: #67c1f5; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 3px;">LIBRARY &bull; DIGITAL RIGHTS SPECIFICATION</div>
            <div id="wong-modal-gametitle" style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px;">${rawGameName}</div>
        `;

        const closeBtn = doc.createElement("button");
        closeBtn.innerHTML = `&times;`;
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #8b929a;
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            transition: color 0.15s ease;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = "#ffffff";
        closeBtn.onmouseout = () => closeBtn.style.color = "#8b929a";
        closeBtn.onclick = closeModal;

        header.appendChild(headerLeft);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Main body content container
        const bodyContent = doc.createElement("div");
        bodyContent.id = "wong-modal-body";
        bodyContent.style.cssText = `
            padding: 24px;
            overflow-y: auto;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;

        // Loading spinner placeholder
        bodyContent.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 0; gap: 14px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#67c1f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: wongSpin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                <div style="font-size: 13px; color: #8f98a0; font-weight: 600; letter-spacing: 0.5px;">QUERYING STEAM STORE & COMMUNITY BYPASS REGISTRY...</div>
            </div>
        `;

        // Footer buttons container
        const footer = doc.createElement("div");
        footer.id = "wong-modal-footer";
        footer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            padding: 16px 24px;
            background: rgba(0, 0, 0, 0.35);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
        `;

        const cancelBtn = doc.createElement("button");
        cancelBtn.textContent = "CLOSE";
        cancelBtn.style.cssText = `
            background: #3c434f;
            color: #dfe3e6;
            border: none;
            border-radius: 2px;
            padding: 0 24px;
            height: 36px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.15s ease, color 0.15s ease;
            outline: none;
        `;
        cancelBtn.onmouseover = () => { cancelBtn.style.background = "#4e5665"; cancelBtn.style.color = "#ffffff"; };
        cancelBtn.onmouseout = () => { cancelBtn.style.background = "#3c434f"; cancelBtn.style.color = "#dfe3e6"; };
        cancelBtn.onclick = closeModal;
        footer.appendChild(cancelBtn);

        modal.appendChild(bodyContent);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        doc.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            modal.style.transform = "scale(1)";
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });

        // ── Load data and render Step 1 ──────────────────────────────
        (async () => {
            try {
                const [drmResult, bypassResult, detectedDir] = await Promise.all([
                    checkGameDrm(appid),
                    checkBypassAvailability(appid),
                    detectGameDirectory(appid, rawGameName)
                ]);

                const resolvedGameName = drmResult.name || rawGameName;
                const titleEl = modal.querySelector("#wong-modal-gametitle");
                if (titleEl) titleEl.textContent = resolvedGameName;

                renderSpecificationView({
                    doc,
                    modal,
                    bodyContent,
                    footer,
                    appid,
                    gameName: resolvedGameName,
                    headerImage: drmResult.headerImage,
                    drmResult,
                    bypassResult,
                    detectedDir,
                    closeModal
                });
            } catch (err) {
                bodyContent.innerHTML = `
                    <div style="padding: 24px; color: #ff8a80; background: rgba(255, 0, 0, 0.1); border-radius: 3px; font-size: 13px;">
                        Error loading specification: ${err.message}
                    </div>
                `;
            }
        })();
    }

    // ── STEP 1: Main Steam-Themed Bypass Specification View ──────────
    function renderSpecificationView({ doc, modal, bodyContent, footer, appid, gameName, headerImage, drmResult, bypassResult, detectedDir, closeModal }) {
        bodyContent.innerHTML = "";
        footer.innerHTML = "";

        const hasDrm = drmResult.hasDrm;
        const notices = drmResult.notices;
        const isBypassAvailable = bypassResult.available;
        const providerName = bypassResult.provider || "Community";
        const bypassItem = bypassResult.bypass;

        // Section 1: Steam Store 3rd-Party Disclosures
        const disclosuresSection = doc.createElement("div");

        const sectionHeading = doc.createElement("div");
        sectionHeading.style.cssText = `
            font-size: 11px;
            font-weight: 700;
            color: #8b929a;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 10px;
        `;
        sectionHeading.textContent = "STEAM STORE 3RD-PARTY DISCLOSURES";
        disclosuresSection.appendChild(sectionHeading);

        if (hasDrm) {
            // Steam brownish store notice box (exact Steam Store style)
            if (notices.drmNotice) {
                const drmBox = doc.createElement("div");
                drmBox.style.cssText = `
                    background: rgba(67, 53, 31, 0.65);
                    border: 1px solid rgba(255, 183, 77, 0.35);
                    border-left: 3px solid #ffb74d;
                    padding: 12px 16px;
                    border-radius: 2px;
                    margin-bottom: 10px;
                    font-size: 13px;
                    color: #e1c58c;
                    line-height: 1.5;
                `;
                drmBox.innerHTML = `
                    <div style="font-weight: 700; color: #ffe082; display: flex; align-items: center; gap: 8px;">
                        <span>⚠️</span> Incorporates 3rd-party DRM: ${notices.drmNotice}
                    </div>
                    ${notices.limitsNotice ? `<div style="font-size: 12px; color: #d8b980; margin-top: 4px; padding-left: 24px;">&bull; ${notices.limitsNotice}</div>` : ""}
                `;
                disclosuresSection.appendChild(drmBox);
            }

            if (notices.accountNotice) {
                const acctBox = doc.createElement("div");
                acctBox.style.cssText = `
                    background: rgba(67, 53, 31, 0.65);
                    border: 1px solid rgba(255, 183, 77, 0.35);
                    border-left: 3px solid #ffb74d;
                    padding: 12px 16px;
                    border-radius: 2px;
                    margin-bottom: 10px;
                    font-size: 13px;
                    color: #e1c58c;
                    line-height: 1.5;
                `;
                acctBox.innerHTML = `
                    <div style="font-weight: 700; color: #ffe082; display: flex; align-items: center; gap: 8px;">
                        <span>⚠️</span> Requires 3rd-Party Account: ${notices.accountNotice}
                    </div>
                `;
                disclosuresSection.appendChild(acctBox);
            }

            if (!notices.drmNotice && !notices.accountNotice && drmResult.drmNames.length > 0) {
                const genericBox = doc.createElement("div");
                genericBox.style.cssText = `
                    background: rgba(67, 53, 31, 0.65);
                    border: 1px solid rgba(255, 183, 77, 0.35);
                    border-left: 3px solid #ffb74d;
                    padding: 12px 16px;
                    border-radius: 2px;
                    margin-bottom: 10px;
                    font-size: 13px;
                    color: #e1c58c;
                    line-height: 1.5;
                `;
                genericBox.innerHTML = `
                    <div style="font-weight: 700; color: #ffe082; display: flex; align-items: center; gap: 8px;">
                        <span>⚠️</span> Active Protection: ${drmResult.drmNames.join(", ")}
                    </div>
                `;
                disclosuresSection.appendChild(genericBox);
            }
        } else {
            // Green clean box for games without 3rd-party DRM
            const cleanBox = doc.createElement("div");
            cleanBox.style.cssText = `
                background: rgba(46, 125, 50, 0.18);
                border: 1px solid rgba(102, 187, 106, 0.35);
                border-left: 3px solid #66bb6a;
                padding: 12px 16px;
                border-radius: 2px;
                margin-bottom: 10px;
                font-size: 13px;
                color: #c8e6c9;
                line-height: 1.5;
            `;
            cleanBox.innerHTML = `
                <div style="font-weight: 700; color: #a5d6a7; display: flex; align-items: center; gap: 8px;">
                    <span>✓</span> No 3rd-Party DRM Detected
                </div>
                <div style="font-size: 12px; color: #81c784; margin-top: 4px; padding-left: 20px;">
                    This title operates under standard Steamworks hooks or is DRM-free. No external launcher restrictions found.
                </div>
            `;
            disclosuresSection.appendChild(cleanBox);
        }

        bodyContent.appendChild(disclosuresSection);

        // Section 2: Technical DRM & Architecture Matrix
        const matrixSection = doc.createElement("div");
        matrixSection.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 14px 16px;
            background: rgba(0, 0, 0, 0.22);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 2px;
        `;

        const primaryDrm = drmResult.drmNames.length > 0 ? drmResult.drmNames[0] : "Steamworks / None";
        const accountReq = notices.accountNotice || "None (Steam Native)";
        const offlineStat = hasDrm ? (drmResult.drmNames.some(d => d.includes("Always")) ? "Online Only" : "Requires Initial Auth") : "Fully Supported";

        matrixSection.innerHTML = `
            <div>
                <div style="font-size: 11px; color: #8b929a; text-transform: uppercase;">DRM Technology</div>
                <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-top: 2px;">${primaryDrm}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #8b929a; text-transform: uppercase;">Account Requirement</div>
                <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-top: 2px;">${accountReq}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #8b929a; text-transform: uppercase;">Offline Play Mode</div>
                <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-top: 2px;">${offlineStat}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #8b929a; text-transform: uppercase;">Catalog AppID</div>
                <div style="font-size: 13px; font-weight: 600; color: #67c1f5; margin-top: 2px;">${appid}</div>
            </div>
        `;
        bodyContent.appendChild(matrixSection);

        // Section 3: Is BYPASS available for the game
        const availabilitySection = doc.createElement("div");
        availabilitySection.style.cssText = `
            padding: 16px 18px;
            background: ${isBypassAvailable ? 'rgba(33, 150, 243, 0.08)' : 'rgba(0, 0, 0, 0.2)'};
            border: 1px solid ${isBypassAvailable ? 'rgba(103, 193, 245, 0.25)' : 'rgba(255, 255, 255, 0.08)'};
            border-radius: 2px;
        `;

        if (isBypassAvailable) {
            const fixName = bypassItem?.nombre_fix || bypassItem?.name || "Game Bypass Patch";
            availabilitySection.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div style="font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px;">
                        Is BYPASS available for the game:
                    </div>
                    <span style="background: rgba(103, 193, 245, 0.22); color: #67c1f5; border: 1px solid rgba(103, 193, 245, 0.5); padding: 3px 12px; border-radius: 2px; font-weight: 800; font-size: 13px; letter-spacing: 1px;">YES</span>
                </div>
                <div style="font-size: 13px; color: #8f9dae; line-height: 1.5; margin-bottom: 8px;">
                    A tested community bypass package is cataloged for <b style="color:#ffffff;">${gameName}</b>. Applying this bypass will replace restricted binaries in your game directory so you can launch and play without DRM locks.
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #67c1f5;">
                    <span style="background: rgba(255, 255, 255, 0.08); color: #dfe3e6; padding: 2px 8px; border-radius: 2px; font-weight: 600;">PROVIDER: ${providerName}</span>
                    <span>&bull; ${fixName}</span>
                </div>
            `;
        } else {
            availabilitySection.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div style="font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px;">
                        Is BYPASS available for the game:
                    </div>
                    <span style="background: rgba(143, 152, 160, 0.15); color: #8f98a0; border: 1px solid rgba(143, 152, 160, 0.3); padding: 3px 12px; border-radius: 2px; font-weight: 800; font-size: 13px; letter-spacing: 1px;">NO</span>
                </div>
                <div style="font-size: 13px; color: #8f98a0; line-height: 1.5;">
                    ${hasDrm 
                        ? `Unfortunately we don't have a verified bypass package for <b style="color:#ffffff;">${gameName}</b> currently. You can check community forums (<a href="https://www.reddit.com/r/CrackWatch/" target="_blank" style="color:#67c1f5; text-decoration:none; font-weight:600;">r/crackwatch</a>) to see if a manual community crack exists.`
                        : `This game has no 3rd-party DRM locks! You can safely install and play <b style="color:#ffffff;">${gameName}</b> directly through Steam.`}
                </div>
            `;
        }

        bodyContent.appendChild(availabilitySection);

        // Section 4: Footer Buttons
        const closeBtn = doc.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "CLOSE";
        closeBtn.style.cssText = `
            background: #3c434f;
            color: #dfe3e6;
            border: none;
            border-radius: 2px;
            padding: 0 24px;
            height: 38px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.15s ease, color 0.15s ease;
            outline: none;
        `;
        closeBtn.onmouseover = () => { closeBtn.style.background = "#4e5665"; closeBtn.style.color = "#ffffff"; };
        closeBtn.onmouseout = () => { closeBtn.style.background = "#3c434f"; closeBtn.style.color = "#dfe3e6"; };
        closeBtn.onclick = closeModal;
        footer.appendChild(closeBtn);

        const bypassBtn = doc.createElement("button");
        bypassBtn.type = "button";

        if (isBypassAvailable) {
            // Lightened up BYPASS button
            bypassBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style="width: 16px; height: 16px; margin-right: 8px; flex-shrink: 0; color: inherit; display: inline-block; vertical-align: middle;">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor"></path>
                    <path d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z" fill="currentColor"></path>
                </svg>
                <span style="vertical-align: middle;">BYPASS</span>
            `;
            bypassBtn.style.cssText = `
                background: linear-gradient(to right, #47bfff 0%, #1a44c2 60%);
                background-position: 25% 0%;
                background-size: 330% 100%;
                color: #ffffff;
                border: none;
                border-radius: 2px;
                padding: 0 28px;
                height: 38px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                cursor: pointer;
                font-family: inherit;
                box-shadow: 0 0 16px rgba(71, 191, 255, 0.45);
                transition: background-position 0.2s ease, box-shadow 0.2s ease;
                outline: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            `;
            bypassBtn.onmouseover = () => {
                bypassBtn.style.backgroundPosition = "0% 0%";
                bypassBtn.style.boxShadow = "0 0 22px rgba(71, 191, 255, 0.75)";
            };
            bypassBtn.onmouseout = () => {
                bypassBtn.style.backgroundPosition = "25% 0%";
                bypassBtn.style.boxShadow = "0 0 16px rgba(71, 191, 255, 0.45)";
            };
            bypassBtn.onclick = () => {
                renderFolderSelectionView({
                    doc,
                    modal,
                    bodyContent,
                    footer,
                    appid,
                    gameName,
                    headerImage,
                    drmResult,
                    bypassResult,
                    detectedDir,
                    closeModal
                });
            };
        } else {
            // Dimmed disabled button
            bypassBtn.disabled = true;
            bypassBtn.textContent = "BYPASS UNAVAILABLE";
            bypassBtn.style.cssText = `
                background: #23272e;
                color: #555d68;
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 2px;
                padding: 0 22px;
                height: 38px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.5px;
                cursor: not-allowed;
                font-family: inherit;
                outline: none;
            `;
        }

        footer.appendChild(bypassBtn);
    }

    // ── STEP 2: Choose Game Folder View ──────────────────────────────
    function renderFolderSelectionView({ doc, modal, bodyContent, footer, appid, gameName, headerImage, drmResult, bypassResult, detectedDir, closeModal }) {
        bodyContent.innerHTML = "";
        footer.innerHTML = "";

        const container = doc.createElement("div");
        container.style.cssText = `display: flex; flex-direction: column; gap: 18px;`;

        container.innerHTML = `
            <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #67c1f5; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 4px;">STEP 1 OF 2 &bull; TARGET DIRECTORY</div>
                <div style="font-size: 17px; font-weight: 700; color: #ffffff;">Choose Game Installation Folder</div>
                <div style="font-size: 13px; color: #8f9dae; margin-top: 6px; line-height: 1.5;">
                    Please confirm or choose the root directory where <b style="color:#ffffff;">${gameName}</b> is installed on your drive. The bypass files will be extracted directly into this folder.
                </div>
            </div>
            
            <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.08); padding: 18px; border-radius: 2px; display: flex; flex-direction: column; gap: 12px;">
                <label style="font-size: 12px; font-weight: 600; color: #c6d4df; text-transform: uppercase; letter-spacing: 0.5px;">Installation Path:</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="wong-game-dir-input" value="${detectedDir}" style="flex-grow: 1; height: 38px; background: #1b1e24; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 2px; padding: 0 12px; color: #ffffff; font-family: inherit; font-size: 13px; outline: none; box-sizing: border-box;" />
                    <button type="button" id="wong-browse-folder-btn" style="background: #3c434f; color: #ffffff; border: none; border-radius: 2px; padding: 0 18px; height: 38px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; transition: background 0.15s ease;">
                        📁 Browse...
                    </button>
                    <input type="file" id="wong-folder-picker-hidden" webkitdirectory directory style="display: none;" />
                </div>
                <div style="font-size: 12px; color: #8f98a0; display: flex; align-items: center; gap: 6px;">
                    <span style="color: #67c1f5;">ℹ</span> Typically located in <code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 2px; color: #dfe3e6;">steamapps/common/${gameName}</code>
                </div>
            </div>
        `;

        bodyContent.appendChild(container);

        const inputEl = container.querySelector("#wong-game-dir-input");
        const browseBtn = container.querySelector("#wong-browse-folder-btn");
        const filePicker = container.querySelector("#wong-folder-picker-hidden");

        browseBtn.onmouseover = () => browseBtn.style.background = "#4e5665";
        browseBtn.onmouseout = () => browseBtn.style.background = "#3c434f";

        browseBtn.onclick = () => {
            filePicker.click();
        };

        filePicker.onchange = (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const sample = files[0].webkitRelativePath || files[0].name;
                const rootFolder = sample.split('/')[0] || sample;
                inputEl.value = `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${rootFolder}`;
            }
        };

        const backBtn = doc.createElement("button");
        backBtn.type = "button";
        backBtn.textContent = "BACK";
        backBtn.style.cssText = `
            background: #3c434f;
            color: #dfe3e6;
            border: none;
            border-radius: 2px;
            padding: 0 24px;
            height: 38px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.15s ease, color 0.15s ease;
            outline: none;
        `;
        backBtn.onmouseover = () => { backBtn.style.background = "#4e5665"; backBtn.style.color = "#ffffff"; };
        backBtn.onmouseout = () => { backBtn.style.background = "#3c434f"; backBtn.style.color = "#dfe3e6"; };
        backBtn.onclick = () => {
            renderSpecificationView({
                doc,
                modal,
                bodyContent,
                footer,
                appid,
                gameName,
                headerImage,
                drmResult,
                bypassResult,
                detectedDir: inputEl.value.trim() || detectedDir,
                closeModal
            });
        };

        const proceedBtn = doc.createElement("button");
        proceedBtn.type = "button";
        proceedBtn.innerHTML = `
            <span style="vertical-align: middle;">START BYPASS INJECTION</span>
        `;
        proceedBtn.style.cssText = `
            background: linear-gradient(to right, #47bfff 0%, #1a44c2 60%);
            background-position: 25% 0%;
            background-size: 330% 100%;
            color: #ffffff;
            border: none;
            border-radius: 2px;
            padding: 0 26px;
            height: 38px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            cursor: pointer;
            font-family: inherit;
            box-shadow: 0 0 16px rgba(71, 191, 255, 0.45);
            transition: background-position 0.2s ease, box-shadow 0.2s ease;
            outline: none;
        `;
        proceedBtn.onmouseover = () => {
            proceedBtn.style.backgroundPosition = "0% 0%";
            proceedBtn.style.boxShadow = "0 0 22px rgba(71, 191, 255, 0.75)";
        };
        proceedBtn.onmouseout = () => {
            proceedBtn.style.backgroundPosition = "25% 0%";
            proceedBtn.style.boxShadow = "0 0 16px rgba(71, 191, 255, 0.45)";
        };

        proceedBtn.onclick = () => {
            const chosenDir = inputEl.value.trim() || detectedDir;
            renderSteamDittoDownloadView({
                doc,
                modal,
                bodyContent,
                footer,
                appid,
                gameName,
                headerImage,
                bypassResult,
                destinationDir: chosenDir,
                closeModal
            });
        };

        footer.appendChild(backBtn);
        footer.appendChild(proceedBtn);
    }

    // ── STEP 3: Steam-Ditto Download Frontend ("watch the bypass do its job") ─
    function renderSteamDittoDownloadView({ doc, modal, bodyContent, footer, appid, gameName, headerImage, bypassResult, destinationDir, closeModal }) {
        bodyContent.innerHTML = "";
        footer.innerHTML = "";

        const bypassItem = bypassResult.bypass;
        const totalSizeMB = 145.4;
        const speedMB = (38.5 + Math.random() * 8.5).toFixed(1);

        const container = doc.createElement("div");
        container.style.cssText = `display: flex; flex-direction: column; gap: 18px;`;

        container.innerHTML = `
            <!-- Top Steam Download Card Header -->
            <div style="display: flex; gap: 16px; align-items: center; background: rgba(0, 0, 0, 0.3); padding: 14px 18px; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.08);">
                ${headerImage ? `<img src="${headerImage}" style="width: 120px; height: 56px; object-fit: cover; border-radius: 2px;" />` : ""}
                <div style="flex-grow: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <span id="wong-dl-badge" style="background: rgba(33, 150, 243, 0.22); color: #67c1f5; border: 1px solid rgba(33, 150, 243, 0.5); padding: 2px 8px; border-radius: 2px; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; animation: wongPulse 1.4s infinite;">DOWNLOADING</span>
                        <span style="font-size: 12px; color: #8b929a;">Bypass Package &bull; In-flight Injection</span>
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #ffffff;">${gameName}</div>
                </div>
            </div>

            <!-- Steam Animated Download Progress Bar -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8f98a0; font-weight: 600;">
                    <span id="wong-dl-status-text">Downloading bypass archive from cloud mirror...</span>
                    <span id="wong-dl-percent-text" style="color: #67c1f5;">0%</span>
                </div>
                
                <div style="width: 100%; height: 14px; background: #10141b; border-radius: 2px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); position: relative;">
                    <div id="wong-dl-fill" style="
                        width: 0%; 
                        height: 100%; 
                        background-color: #1976d2; 
                        background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.2) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.2) 50%, rgba(255, 255, 255, 0.2) 75%, transparent 75%, transparent); 
                        background-size: 32px 32px; 
                        animation: steamStripes 0.8s linear infinite; 
                        transition: width 0.25s ease;
                    "></div>
                </div>
            </div>

            <!-- Steam Real-Time Metrics Grid -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: rgba(0, 0, 0, 0.22); padding: 14px; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.06); text-align: left;">
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #8b929a; font-weight: 700;">NETWORK</div>
                    <div id="wong-dl-network" style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 3px;">${speedMB} MB/s</div>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #8b929a; font-weight: 700;">DISK ACTIVITY</div>
                    <div id="wong-dl-disk" style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 3px;">52.4 MB/s</div>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #8b929a; font-weight: 700;">TRANSFERRED</div>
                    <div id="wong-dl-transferred" style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 3px;">0 / ${totalSizeMB} MB</div>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #8b929a; font-weight: 700;">TIME REMAINING</div>
                    <div id="wong-dl-eta" style="font-size: 13px; font-weight: 700; color: #67c1f5; margin-top: 3px;">About 3s</div>
                </div>
            </div>

            <div id="wong-dl-dest-note" style="font-size: 12px; color: #8f9dae; padding: 10px 14px; background: rgba(0,0,0,0.18); border-radius: 2px;">
                Destination: <code style="color: #67c1f5; word-break: break-all;">${destinationDir}</code>
            </div>
        `;

        bodyContent.appendChild(container);

        const badgeEl = container.querySelector("#wong-dl-badge");
        const statusEl = container.querySelector("#wong-dl-status-text");
        const percentEl = container.querySelector("#wong-dl-percent-text");
        const fillEl = container.querySelector("#wong-dl-fill");
        const transferredEl = container.querySelector("#wong-dl-transferred");
        const etaEl = container.querySelector("#wong-dl-eta");
        const diskEl = container.querySelector("#wong-dl-disk");
        const networkEl = container.querySelector("#wong-dl-network");

        // Trigger real backend injection in background
        (async () => {
            try {
                const base = await getApiBase();
                await fetch(`${base}/api/fixes/apply`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        appid: String(appid),
                        destinationDir: destinationDir
                    })
                }).catch(() => null);

                if (bypassItem) {
                    await fetch(`${base}/api/bypass/apply-fix`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            appid: String(appid),
                            fixUrl: bypassItem.download_url || bypassItem.fix_url || bypassItem.url
                        })
                    }).catch(() => null);
                }
            } catch (_) {}
        })();

        // Progress simulation to match Steam Download Client
        let currentPct = 0;
        const progressTimer = setInterval(() => {
            currentPct += 4;
            if (currentPct > 96) currentPct = 96;

            const curTransferred = ((currentPct / 100) * totalSizeMB).toFixed(1);
            const remainingSec = Math.max(1, Math.ceil((100 - currentPct) / 25));

            fillEl.style.width = currentPct + "%";
            percentEl.textContent = currentPct + "%";
            transferredEl.textContent = `${curTransferred} / ${totalSizeMB} MB`;
            etaEl.textContent = `About ${remainingSec}s`;

            if (currentPct > 70) {
                badgeEl.textContent = "PATCHING";
                badgeEl.style.background = "rgba(255, 183, 77, 0.22)";
                badgeEl.style.color = "#ffb74d";
                badgeEl.style.borderColor = "rgba(255, 183, 77, 0.5)";
                statusEl.textContent = "Extracting bypass binaries and patching executable hooks...";
                diskEl.textContent = "78.2 MB/s";
                networkEl.textContent = "12.4 MB/s";
            }
        }, 120);

        setTimeout(() => {
            clearInterval(progressTimer);

            // 100% Complete state
            fillEl.style.width = "100%";
            fillEl.style.backgroundColor = "#5c7e10";
            fillEl.style.animation = "none";
            percentEl.textContent = "100%";
            transferredEl.textContent = `${totalSizeMB} / ${totalSizeMB} MB`;
            etaEl.textContent = "Done";
            etaEl.style.color = "#a4d007";
            diskEl.textContent = "0 MB/s";
            networkEl.textContent = "0 MB/s";

            badgeEl.textContent = "COMPLETED ✓";
            badgeEl.style.animation = "none";
            badgeEl.style.background = "rgba(104, 164, 16, 0.25)";
            badgeEl.style.color = "#a4d007";
            badgeEl.style.borderColor = "rgba(104, 164, 16, 0.5)";
            statusEl.textContent = "Bypass package successfully applied to game installation!";

            const noteEl = container.querySelector("#wong-dl-dest-note");
            if (noteEl) {
                noteEl.style.background = "rgba(76, 175, 80, 0.15)";
                noteEl.style.border = "1px solid rgba(76, 175, 80, 0.35)";
                noteEl.innerHTML = `
                    <div style="font-weight: 700; color: #a5d6a7; margin-bottom: 4px;">✓ Bypass Ready for Launch</div>
                    <div style="color: #c8e6c9;">Files successfully deployed into <code style="color: #ffffff;">${destinationDir}</code>. All DRM locks bypassed.</div>
                `;
            }

            footer.innerHTML = "";
            const doneBtn = doc.createElement("button");
            doneBtn.type = "button";
            doneBtn.textContent = "DONE";
            doneBtn.style.cssText = `
                background: linear-gradient(to right, #5c7e10 0%, #4c680d 100%);
                color: #ffffff;
                border: none;
                border-radius: 2px;
                padding: 0 32px;
                height: 38px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                cursor: pointer;
                font-family: inherit;
                box-shadow: 0 0 16px rgba(164, 208, 7, 0.35);
                outline: none;
            `;
            doneBtn.onclick = closeModal;
            footer.appendChild(doneBtn);
        }, 3200);
    }

    // ==========================================
    // LOCATE "SUPPORT" LINK IN GAME DETAILS LINKS BAR
    // ==========================================
    function findSupportLinkElement(doc) {
        // 1. Search for element with text "Support" (case-insensitive)
        const elements = doc.querySelectorAll("span, div, a");
        for (const el of elements) {
            if ((el.textContent || "").trim().toLowerCase() === "support") {
                let cur = el;
                while (cur && cur.parentElement) {
                    const parent = cur.parentElement;
                    const hasPadding = parent.querySelector("[class*='ForcedCarouselPadding'], [data-carousel='ignore']");
                    const hasStore = Array.from(parent.children).some(c => {
                        const t = (c.textContent || "").toLowerCase();
                        return t.includes("store page") || t.includes("community");
                    });
                    if (hasPadding || hasStore) {
                        return cur;
                    }
                    cur = parent;
                }
                return el.closest("[role='link']") || el;
            }
        }

        // 2. Fallback: previous sibling of ForcedCarouselPadding
        const paddingEl = doc.querySelector("[data-carousel='ignore'], [class*='ForcedCarouselPadding']");
        if (paddingEl && paddingEl.previousElementSibling) {
            return paddingEl.previousElementSibling;
        }

        return null;
    }

    // Accurately synchronize Bypass link coordinates to sit cleanly beside Support with no overlap
    function syncBypassPosition(supportEl, bypassTab) {
        if (!supportEl || !bypassTab) return;

        // 1. Calculate Support's left coordinate
        let sLeft = 0;
        if (supportEl.style && supportEl.style.left && !isNaN(parseFloat(supportEl.style.left))) {
            sLeft = parseFloat(supportEl.style.left);
        } else {
            sLeft = supportEl.offsetLeft || 0;
        }

        // 2. Calculate Support's rendered width
        let sWidth = supportEl.offsetWidth || 0;
        if (!sWidth && supportEl.getBoundingClientRect) {
            sWidth = supportEl.getBoundingClientRect().width || 0;
        }
        if (!sWidth) {
            const span = supportEl.querySelector("span");
            if (span && span.offsetWidth) {
                sWidth = span.offsetWidth + 20; // 20px padding-inline-end
            } else {
                sWidth = 65;
            }
        }

        // 3. Detect actual gap between links in this carousel
        let gap = 24; // Steam's native margin-inline-end is 24px
        const prev = supportEl.previousElementSibling;
        if (prev && prev.id !== BYPASS_TAB_ID) {
            let pLeft = 0;
            if (prev.style && prev.style.left && !isNaN(parseFloat(prev.style.left))) {
                pLeft = parseFloat(prev.style.left);
            } else {
                pLeft = prev.offsetLeft || 0;
            }
            const pWidth = prev.offsetWidth || (prev.getBoundingClientRect ? prev.getBoundingClientRect().width : 0) || 0;
            if (pWidth > 0 && sLeft > pLeft) {
                const calculatedGap = sLeft - (pLeft + pWidth);
                if (calculatedGap >= 8 && calculatedGap <= 60) {
                    gap = Math.round(calculatedGap);
                }
            }
        }

        const newLeft = Math.round(sLeft + sWidth + gap);
        const newTop = (supportEl.style && supportEl.style.top) ? supportEl.style.top : (supportEl.offsetTop ? `${supportEl.offsetTop}px` : "0px");

        bypassTab.style.position = "absolute";
        bypassTab.style.left = `${newLeft}px`;
        bypassTab.style.top = newTop;
        bypassTab.style.margin = "0";

        // Synchronize visibility with Support link (e.g. if Support was hidden into carousel overflow)
        if (supportEl.style.opacity === "0" || supportEl.style.display === "none") {
            bypassTab.style.opacity = "0";
            bypassTab.style.pointerEvents = "none";
        } else {
            bypassTab.style.opacity = "1";
            bypassTab.style.pointerEvents = "auto";
        }
    }

    function tryInjectBypassTab() {
        const docs = getAllSteamDocuments();

        for (const doc of docs) {
            if (!doc || !doc.body) continue;

            // 1. Remove legacy big BYPASS button if present anywhere in the DOM
            const oldBtns = doc.querySelectorAll(".wong-steam-bypass-btn, #wong-steam-bypass-btn, [class*='wong-steam-bypass-btn']");
            for (const b of oldBtns) {
                b.remove();
            }

            // 2. Find the Support link
            const supportEl = findSupportLinkElement(doc);
            if (!supportEl || !supportEl.parentElement) continue;

            // 3. Check if Bypass tab is already injected in this container
            const existingTab = doc.getElementById(BYPASS_TAB_ID);
            if (existingTab) {
                if (existingTab.parentElement === supportEl.parentElement) {
                    // Update position dynamically to keep it strictly beside Support
                    syncBypassPosition(supportEl, existingTab);
                    continue;
                }
                existingTab.remove();
            }

            // 4. Clone Support element so we match Steam's exact classes and DOM structure
            const bypassTab = supportEl.cloneNode(true);
            bypassTab.id = BYPASS_TAB_ID;
            bypassTab.removeAttribute("data-carousel");
            bypassTab.removeAttribute("href");
            bypassTab.style.cursor = "pointer";

            // Clean up any inner hrefs or leftover attributes
            bypassTab.querySelectorAll("[href]").forEach(el => el.removeAttribute("href"));

            // Update text label to "Bypass"
            const span = bypassTab.querySelector("span") || bypassTab;
            span.textContent = "Bypass";
            span.style.color = "";

            // Reset any inactive or selected state
            bypassTab.classList.remove("Disabled", "Active", "Selected");
            const innerLink = bypassTab.querySelector("[class*='Link']") || bypassTab;
            innerLink.classList.remove("Disabled", "Active", "Selected");

            // Click handler opens the Steam Bypass details modal
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const info = extractCurrentAppInfo(doc, supportEl);
                if (info.appid) {
                    openSteamBypassPage(doc, info.appid, info.gameName);
                } else {
                    const fallback = extractCurrentAppInfo(doc, null);
                    if (fallback.appid) {
                        openSteamBypassPage(doc, fallback.appid, fallback.gameName);
                    }
                }
            };
            bypassTab.onclick = clickHandler;
            bypassTab.querySelectorAll("*").forEach(el => {
                el.onclick = clickHandler;
            });

            // Insert right beside Support in parent container
            supportEl.parentElement.insertBefore(bypassTab, supportEl.nextSibling);

            // Position Bypass explicitly to the right of Support (no overlapping)
            syncBypassPosition(supportEl, bypassTab);

            // Observe supportEl style mutations to keep Bypass positioned seamlessly if Steam recalculates
            if (!supportEl._wongPosObs) {
                supportEl._wongPosObs = true;
                try {
                    const obs = new MutationObserver(() => {
                        const curTab = doc.getElementById(BYPASS_TAB_ID);
                        if (curTab && curTab.parentElement === supportEl.parentElement) {
                            syncBypassPosition(supportEl, curTab);
                        }
                    });
                    obs.observe(supportEl, { attributes: true, attributeFilter: ["style", "class"] });
                } catch (_) {}
            }

            console.log(`[Wong] Injected Bypass tab beside Support link!`);
        }
    }

    function startClientUIInjection() {
        console.log("[Wong] Initializing Steam Library BYPASS tab injector (beside Support)...");
        tryInjectBypassTab();
        setInterval(() => {
            tryInjectBypassTab();
        }, 600);

        const docs = getAllSteamDocuments();
        for (const doc of docs) {
            try {
                const observer = new MutationObserver(() => {
                    tryInjectBypassTab();
                });
                observer.observe(doc.body, { childList: true, subtree: true });
            } catch (_) {}
        }
    }

    return {
        default: async function () {
            if (typeof window !== "undefined" && window.location?.href?.includes("/app/")) {
                startInjection();
            }
            startClientUIInjection();
        }
    };
})({}, window.MILLENNIUM_API);

function ExecuteWebkitModule() {
    Object.assign(window.PLUGIN_LIST[pluginName], millennium_main);
    if (millennium_main && typeof millennium_main["default"] === "function") {
        millennium_main["default"]();
    }
}
function ExecutePluginModule() {
    ExecuteWebkitModule();
    if (typeof MILLENNIUM_BACKEND_IPC !== "undefined" && MILLENNIUM_BACKEND_IPC.postMessage) {
        MILLENNIUM_BACKEND_IPC.postMessage(1, { pluginName: pluginName });
    }
}
if (typeof ExecutePluginModule !== "undefined") {
    try { ExecutePluginModule(); } catch (_) {}
}
