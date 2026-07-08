import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "words.json"), "utf-8")
);

const app = express();
app.use(compression());
app.disable("x-powered-by");

// Health check cho Docker/Render
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Toàn bộ bộ từ khởi tạo — client seed vào localStorage lần đầu
app.get("/api/all", (_req, res) => {
  res.json(data);
});

// Tra từ điển — proxy qua Free Dictionary API (dictionaryapi.dev).
// Kiến trúc proxy để sau này có license Cambridge chỉ cần thay URL tại đây.
app.get("/api/dict/:word", async (req, res) => {
  try {
    const r = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(req.params.word.trim().toLowerCase())}`
    );
    if (r.status === 404) return res.status(404).json({ error: "Từ điển không có từ này" });
    if (!r.ok) return res.status(502).json({ error: "Dịch vụ từ điển đang lỗi, thử lại sau" });
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
    res.json({ word: entry.word, ipa, audio, meanings: meanings.slice(0, 8) });
  } catch {
    res.status(502).json({ error: "Không kết nối được dịch vụ từ điển" });
  }
});

// Phục vụ frontend build
const clientDist = path.join(__dirname, "public");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: "1d", index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`✅ IELTS Flashcards chạy tại http://localhost:${PORT}`);
});
