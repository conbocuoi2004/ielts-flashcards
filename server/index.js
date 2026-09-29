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

function decodeHtmlEntities(text = "") {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html = "") {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/li>/gi, "; ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function firstExample(def = {}) {
  const ex = def.examples?.[0];
  if (!ex) return "";
  if (typeof ex === "string") return htmlToText(ex);
  return htmlToText(ex.example || ex.text || ex.translation || "");
}

// Tra từ qua Wiktionary (Wikimedia).
// Chỉ lấy mục tiếng Anh để tránh lẫn các ngôn ngữ khác có cùng spelling.
app.get("/api/dict/:word", async (req, res) => {
  const word = req.params.word.trim().toLowerCase();
  if (!word) return res.status(400).json({ error: "Thiếu từ cần tra" });

  try {
    const encoded = encodeURIComponent(word);

    const [defResult, htmlResult] = await Promise.allSettled([
      fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encoded}`, {
        headers: { "User-Agent": "ielts-flashcards/1.0" },
      }),
      fetch(`https://en.wiktionary.org/w/rest.php/v1/page/${encoded}/html`, {
        headers: { "User-Agent": "ielts-flashcards/1.0" },
      }),
    ]);

    if (defResult.status !== "fulfilled") {
      return res.status(502).json({ error: "Không kết nối được Wiktionary" });
    }

    const defResponse = defResult.value;
    if (defResponse.status === 404) {
      return res.status(404).json({ error: "Wiktionary không có từ này" });
    }
    if (!defResponse.ok) {
      return res.status(502).json({ error: "Wiktionary đang lỗi, thử lại sau" });
    }

    const raw = await defResponse.json();
    const englishEntries = Array.isArray(raw.en) ? raw.en : [];
    const meanings = [];

    for (const entry of englishEntries) {
      const pos = entry.partOfSpeech || "";
      for (const def of entry.definitions || []) {
        const definition = htmlToText(def.definition || "");
        if (!definition) continue;

        meanings.push({
          pos,
          definition,
          example: firstExample(def),
        });

        if (meanings.length >= 8) break;
      }
      if (meanings.length >= 8) break;
    }

    if (!meanings.length) {
      return res.status(404).json({ error: "Không tìm thấy định nghĩa tiếng Anh cho từ này" });
    }

    let ipa = "";
    let audio = "";

    if (htmlResult.status === "fulfilled" && htmlResult.value.ok) {
      const html = await htmlResult.value.text();

      // Ưu tiên IPA dạng /.../ trong section Pronunciation.
      const pronunciationSection = html.match(
        /<h3[^>]*id="Pronunciation"[^>]*>[\s\S]*?(?=<h[23][^>]*id=|$)/i
      )?.[0] || html;

      const ipaMatch = pronunciationSection.match(
        /class="IPA[^"]*"[^>]*>(\/[^<]+\/|\[[^<]+\])<\/span>/i
      );
      if (ipaMatch) ipa = htmlToText(ipaMatch[1]);

      // Ưu tiên audio US nếu có, nếu không lấy audio đầu tiên.
      const usBlock = pronunciationSection.match(
        /Audio[\s\S]{0,500}?(?:US|American)[\s\S]{0,1500}?<source[^>]+src="([^"]+)"/i
      );
      const anyAudio = pronunciationSection.match(/<source[^>]+src="([^"]+)"/i);
      const src = usBlock?.[1] || anyAudio?.[1] || "";

      if (src) {
        audio = decodeHtmlEntities(src);
        if (audio.startsWith("//")) audio = `https:${audio}`;
      }
    }

    res.json({ word, ipa, audio, meanings });
  } catch (err) {
    console.error("Wiktionary lookup failed:", err);
    res.status(502).json({ error: "Không kết nối được Wiktionary" });
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
