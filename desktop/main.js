// Electron main process
// Chạy một HTTP server nội bộ (chỉ lắng nghe 127.0.0.1) phục vụ frontend build
// và API /api/* từ dữ liệu JSON nhúng sẵn — app hoạt động offline 100%.

const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname; // trong bản đóng gói, __dirname trỏ vào app.asar
const PUBLIC_DIR = path.join(ROOT, "public");
const data = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "words.json"), "utf-8")
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function handleApi(req, res, url) {
  if (url.pathname === "/api/health") return json(res, 200, { status: "ok" });

  if (url.pathname === "/api/all") return json(res, 200, data);

  if (url.pathname.startsWith("/api/dict/")) {
    const word = decodeURIComponent(url.pathname.slice("/api/dict/".length)).trim().toLowerCase();
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      .then(async (r) => {
        if (r.status === 404) return json(res, 404, { error: "Từ điển không có từ này" });
        if (!r.ok) return json(res, 502, { error: "Dịch vụ từ điển đang lỗi, thử lại sau" });
        const raw = await r.json();
        const entry = raw[0];
        const audio = entry.phonetics?.find((p) => p.audio)?.audio || "";
        const ipa = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || "";
        const meanings = [];
        for (const m of entry.meanings || []) {
          for (const d of (m.definitions || []).slice(0, 2)) {
            meanings.push({ pos: m.partOfSpeech, definition: d.definition, example: d.example || "" });
          }
        }
        json(res, 200, { word: entry.word, ipa, audio, meanings: meanings.slice(0, 8) });
      })
      .catch(() => json(res, 502, { error: "Không kết nối được dịch vụ từ điển (cần Internet)" }));
    return;
  }

  json(res, 404, { error: "Not found" });
}

function serveStatic(res, urlPath) {
  let filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^([.][.][/\\])+/, ""));
  if (!filePath.startsWith(PUBLIC_DIR)) filePath = path.join(PUBLIC_DIR, "index.html");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html"); // SPA fallback
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
      serveStatic(res, url.pathname === "/" ? "/index.html" : url.pathname);
    });
    // Cổng 0 = hệ điều hành tự chọn cổng trống, tránh xung đột
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 420,
    backgroundColor: "#111a33",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // Link ngoài (nếu có) mở bằng trình duyệt mặc định thay vì trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
