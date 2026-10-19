// wong-daemon.js
// Ultra-lightweight headless micro-daemon for Wong / Powerplay.
// Runs the backend API on localhost:4173 with ~18 MB RAM (no Electron, no Chromium window).

const path = require("path");
const { startServer } = require("./server.js");

process.title = "Wong-MicroDaemon";

async function main() {
  console.log("[Wong Daemon] Starting headless background server...");
  try {
    const server = await startServer(4173);
    const port = server.address().port;
    console.log(`[Wong Daemon] Ready on port ${port} (PID: ${process.pid})`);
  } catch (err) {
    console.error("[Wong Daemon] Failed to start:", err);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main();
