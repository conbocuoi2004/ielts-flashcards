import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "ielts-flashcards-v1";
// Khoảng cách ôn tập theo hộp Leitner (ngày): hộp 1 ôn ngay, hộp 5 = 14 ngày
const INTERVALS = [0, 1, 3, 7, 14];
const DAY = 24 * 60 * 60 * 1000;

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function seed(raw) {
  return {
    topics: raw.topics.map((t) => ({
      ...t,
      words: t.words.map((w) => ({ ...w, uid: makeId(), box: 1, due: Date.now() })),
    })),
  };
}

function loadLocal() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* Phát âm: ưu tiên file audio từ từ điển, không có thì dùng giọng đọc của hệ thống */
function speak(word, audio) {
  if (audio) {
    const a = new Audio(audio);
    a.play().catch(() => tts(word));
    return;
  }
  tts(word);
}
function tts(word) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-GB";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

const POS_MAP = { noun: "n", verb: "v", adjective: "adj", adverb: "adv" };

/* ---------- Form thêm/sửa từ (có tra từ điển) ---------- */
function WordForm({ initial, topics, onSave, onCancel }) {
  const [f, setF] = useState({
    word: initial?.word || "",
    type: initial?.type || "n",
    ipa: initial?.ipa || "",
    meaning: initial?.meaning || "",
    example: initial?.example || "",
    audio: initial?.audio || "",
    colls: (initial?.collocations || []).join(", "),
    topicId: initial?.topicId || topics[0]?.id,
  });
  const [looking, setLooking] = useState(false);
  const [defs, setDefs] = useState(null);
  const [lookErr, setLookErr] = useState(null);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.word.trim() && f.meaning.trim();

  async function lookup() {
    const w = f.word.trim();
    if (!w || looking) return;
    setLooking(true); setLookErr(null); setDefs(null);
    try {
      const r = await fetch(`/api/dict/${encodeURIComponent(w)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDefs(d.meanings);
      setF((p) => ({
        ...p,
        ipa: d.ipa || p.ipa,
        audio: d.audio || p.audio,
        type: POS_MAP[d.meanings[0]?.pos] || p.type,
      }));
    } catch (e) {
      setLookErr(e.message || "Không tra được từ này.");
    }
    setLooking(false);
  }

  return (
    <div className="word-form">
      <div className="form-row">
        <input
          ref={ref} className="finput" value={f.word} onChange={set("word")}
          placeholder="Từ vựng, vd: resilient"
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button className="btn lookup-btn" onClick={lookup} disabled={looking || !f.word.trim()}>
          {looking ? "…" : "🔍 Tra"}
        </button>
        <select className="finput ftype" value={f.type} onChange={set("type")}>
          <option value="n">n</option><option value="v">v</option>
          <option value="adj">adj</option><option value="adv">adv</option>
          <option value="phrase">phrase</option>
        </select>
      </div>

      {lookErr && <p className="look-err">⚠ {lookErr}</p>}
      {defs && (
        <div className="defs">
          <p className="defs-hint">Định nghĩa từ từ điển — bấm để dùng (bạn có thể dịch lại sang tiếng Việt):</p>
          {defs.map((d, i) => (
            <button
              key={i} className="def-item"
              onClick={() => setF((p) => ({ ...p, meaning: d.definition, example: d.example || p.example }))}
            >
              <em>({d.pos})</em> {d.definition}
              {d.example && <span className="def-ex">“{d.example}”</span>}
            </button>
          ))}
        </div>
      )}

      <div className="form-row">
        <input className="finput ipa" value={f.ipa} onChange={set("ipa")} placeholder="Phiên âm IPA — nút Tra sẽ tự điền" />
        {(f.audio || f.word.trim()) && (
          <button className="btn lookup-btn" onClick={() => speak(f.word.trim(), f.audio)} title="Nghe phát âm">🔊</button>
        )}
      </div>
      <input className="finput" value={f.meaning} onChange={set("meaning")} placeholder="Nghĩa (tiếng Việt hoặc định nghĩa đã chọn ở trên)" />
      <input className="finput" value={f.example} onChange={set("example")} placeholder="Câu ví dụ tiếng Anh (không bắt buộc)" />
      <input className="finput" value={f.colls} onChange={set("colls")} placeholder="Collocations, cách nhau bằng dấu phẩy (vd: pose a threat to, pose a challenge)" />
      {!initial && (
        <select className="finput" value={f.topicId} onChange={set("topicId")}>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
      )}
      <div className="form-actions">
        <button className="btn primary" disabled={!ok} onClick={() => onSave(f)}>Lưu</button>
        <button className="btn" onClick={onCancel}>Huỷ</button>
      </div>
    </div>
  );
}

/* ---------- Form thêm/sửa chủ đề ---------- */
function TopicForm({ initial, onSave, onDelete, onCancel }) {
  const [icon, setIcon] = useState(initial?.icon || "📚");
  const [name, setName] = useState(initial?.name || "");
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="topic-card topic-form">
      <div className="form-row">
        <input className="finput ficon" value={icon} maxLength={4}
          onChange={(e) => setIcon(e.target.value)} aria-label="Biểu tượng emoji" />
        <input ref={ref} className="finput" value={name} placeholder="Tên chủ đề, vd: Crime"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave({ name: name.trim(), icon: icon.trim() || "📚" })} />
      </div>
      <div className="form-actions">
        <button className="btn primary small" disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), icon: icon.trim() || "📚" })}>Lưu</button>
        <button className="btn small" onClick={onCancel}>Huỷ</button>
        {onDelete && <button className="btn small tdel" onClick={onDelete}>Xoá chủ đề</button>}
      </div>
    </div>
  );
}

/* ---------- Phiên học ---------- */
function StudySession({ words, onRate, onExit }) {
  const [queue, setQueue] = useState(() => shuffle(words));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const card = queue[0];

  useEffect(() => {
    function onKey(e) {
      if (e.key === " ") { e.preventDefault(); setFlipped((v) => !v); }
      if (flipped && (e.key === "1" || e.key === "ArrowLeft")) rate(false);
      if (flipped && (e.key === "2" || e.key === "ArrowRight")) rate(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function rate(remembered) {
    onRate(card.uid, card.topicId, remembered);
    setFlipped(false);
    if (remembered) {
      setDone((d) => d + 1);
      setQueue((q) => q.slice(1));
    } else {
      setAgain((a) => a + 1);
      // Chưa nhớ → đẩy xuống cuối hàng, gặp lại ngay trong phiên này
      setQueue((q) => [...q.slice(1), q[0]]);
    }
  }

  if (!card) {
    return (
      <div className="session-end">
        <div className="end-emoji">🎉</div>
        <h2>Hoàn thành phiên học!</h2>
        <p>{done} từ đã thuộc · {again} lượt cần ôn lại</p>
        <button className="btn primary" onClick={onExit}>Về trang chính</button>
      </div>
    );
  }

  return (
    <div className="session">
      <div className="session-top">
        <button className="btn small" onClick={onExit}>← Thoát</button>
        <span className="session-count">còn {queue.length} thẻ</span>
      </div>

      <div className={`card3d ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
        <div className="card-inner">
          <div className="card-face card-front">
            <span className="card-topic">{card.icon} {card.topicName}</span>
            <h2 className="card-word">{card.word}</h2>
            <p className="card-ipa">{card.ipa} <em>({card.type})</em></p>
            <button className="speak-btn" onClick={(e) => { e.stopPropagation(); speak(card.word, card.audio); }} aria-label="Nghe phát âm">🔊 nghe</button>
            <span className="card-hint">bấm để lật · phím cách</span>
          </div>
          <div className="card-face card-back">
            <h3 className="card-meaning">{card.meaning}</h3>
            {card.collocations?.length > 0 && (
              <div className="colls">
                {card.collocations.map((c) => <span className="coll-chip" key={c}>{c}</span>)}
              </div>
            )}
            {card.example && <p className="card-example">“{card.example}”</p>}
            <span className="card-hint">hộp {card.box}/5</span>
          </div>
        </div>
      </div>

      <div className={`rate-btns ${flipped ? "show" : ""}`}>
        <button className="btn rate-no" onClick={() => rate(false)}>✗ Chưa nhớ <kbd>1</kbd></button>
        <button className="btn rate-yes" onClick={() => rate(true)}>✓ Nhớ rồi <kbd>2</kbd></button>
      </div>
    </div>
  );
}

/* ---------- App chính ---------- */
export default function App() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("home"); // home | study | manage
  const [session, setSession] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // {topicId, uid}
  const [addingTopic, setAddingTopic] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null); // topicId

  useEffect(() => {
    const local = loadLocal();
    if (local?.topics?.length) { setData(local); return; }
    fetch("/api/all")
      .then((r) => r.json())
      .then((raw) => {
        const s = seed(raw);
        setData(s);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      })
      .catch(() => setError("Không kết nối được server để lấy bộ từ khởi tạo."));
  }, []);

  function save(next) {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  const now = Date.now();
  const allWords = useMemo(() => {
    if (!data) return [];
    return data.topics.flatMap((t) =>
      t.words.map((w) => ({ ...w, topicId: t.id, topicName: t.name, icon: t.icon }))
    );
  }, [data]);

  const dueWords = allWords.filter((w) => w.due <= now);
  const learned = allWords.filter((w) => w.box >= 4).length;

  function startSession(topicId) {
    const pool = topicId ? dueWords.filter((w) => w.topicId === topicId) : dueWords;
    const source = pool.length ? pool : allWords.filter((w) => !topicId || w.topicId === topicId);
    setSession(source);
    setView("study");
  }

  function rateWord(uid, topicId, remembered) {
    save({
      topics: data.topics.map((t) =>
        t.id !== topicId ? t : {
          ...t,
          words: t.words.map((w) => {
            if (w.uid !== uid) return w;
            const box = remembered ? Math.min(w.box + 1, 5) : 1;
            const due = remembered ? Date.now() + INTERVALS[box - 1] * DAY : Date.now();
            return { ...w, box, due };
          }),
        }
      ),
    });
  }

  function addWord(f) {
    save({
      topics: data.topics.map((t) =>
        t.id !== f.topicId ? t : {
          ...t,
          words: [{ word: f.word.trim(), type: f.type, ipa: f.ipa.trim(), meaning: f.meaning.trim(), example: f.example.trim(), audio: f.audio || "", collocations: (f.colls || "").split(",").map((s) => s.trim()).filter(Boolean), uid: makeId(), box: 1, due: Date.now() }, ...t.words],
        }
      ),
    });
    setAdding(false);
  }

  function editWord(topicId, uid, f) {
    save({
      topics: data.topics.map((t) =>
        t.id !== topicId ? t : {
          ...t,
          words: t.words.map((w) => (w.uid === uid ? { ...w, word: f.word.trim(), type: f.type, ipa: f.ipa.trim(), meaning: f.meaning.trim(), example: f.example.trim(), audio: f.audio || w.audio || "", collocations: (f.colls || "").split(",").map((s) => s.trim()).filter(Boolean) } : w)),
        }
      ),
    });
    setEditing(null);
  }

  function deleteWord(topicId, uid) {
    save({
      topics: data.topics.map((t) =>
        t.id !== topicId ? t : { ...t, words: t.words.filter((w) => w.uid !== uid) }
      ),
    });
  }


  function addTopic(f) {
    save({ topics: [...data.topics, { id: makeId(), name: f.name, icon: f.icon, words: [] }] });
    setAddingTopic(false);
  }

  function updateTopic(id, f) {
    save({ topics: data.topics.map((t) => (t.id === id ? { ...t, name: f.name, icon: f.icon } : t)) });
    setEditingTopic(null);
  }

  function deleteTopic(id) {
    const t = data.topics.find((x) => x.id === id);
    if (!t) return;
    if (!window.confirm(`Xoá chủ đề "${t.name}"?` + (t.words.length ? `\nToàn bộ ${t.words.length} từ trong đó sẽ mất.` : ""))) return;
    save({ topics: data.topics.filter((x) => x.id !== id) });
    setEditingTopic(null);
  }

  function resetAll() {
    if (!window.confirm("Khôi phục bộ từ gốc? Từ tự thêm và toàn bộ tiến độ học sẽ mất.")) return;
    localStorage.removeItem(STORAGE_KEY);
    fetch("/api/all").then((r) => r.json()).then((raw) => save(seed(raw)))
      .catch(() => setError("Không tải được bộ từ gốc."));
  }

  if (error) return <div className="wrap"><div className="error-box">⚠ {error}</div></div>;
  if (!data) return <div className="wrap"><p className="loading">Đang tải…</p></div>;

  if (view === "study") {
    return (
      <div className="wrap">
        <StudySession words={session} onRate={rateWord} onExit={() => setView("home")} />
      </div>
    );
  }

  if (view === "manage") {
    const q = query.trim().toLowerCase();
    const list = allWords.filter((w) => !q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
    return (
      <div className="wrap">
        <header className="bar">
          <button className="btn small" onClick={() => { setView("home"); setQuery(""); setAdding(false); setEditing(null); }}>← Trang chính</button>
          <h1 className="bar-title">Kho từ vựng</h1>
          <button className="btn primary small" onClick={() => setAdding(true)}>+ Thêm từ</button>
        </header>
        <input className="finput search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm từ hoặc nghĩa…" />
        {adding && <WordForm topics={data.topics} onSave={addWord} onCancel={() => setAdding(false)} />}
        <div className="word-list">
          {list.map((w) =>
            editing?.uid === w.uid ? (
              <WordForm key={w.uid} initial={w} topics={data.topics}
                onSave={(f) => editWord(w.topicId, w.uid, f)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="word-item" key={w.uid}>
                <div className="word-main">
                  <strong>{w.word}</strong> <span className="w-ipa">{w.ipa}</span>
                  <span className="w-meaning">{w.meaning}</span>
                </div>
                <div className="word-side">
                  <span className="w-box" title="Hộp Leitner">{"●".repeat(w.box)}{"○".repeat(5 - w.box)}</span>
                  <button className="icon-btn" onClick={() => setEditing({ uid: w.uid })}>Sửa</button>
                  <button className="icon-btn danger" onClick={() => window.confirm(`Xoá từ "${w.word}"?`) && deleteWord(w.topicId, w.uid)}>Xoá</button>
                </div>
              </div>
            )
          )}
          {!list.length && <p className="empty">Không có từ nào khớp.</p>}
        </div>
      </div>
    );
  }

  // ----- Trang chính -----
  return (
    <div className="wrap">
      <header className="home-head">
        <h1 className="logo">IELTS<span>Flashcards</span></h1>
        <div className="head-actions">
          <button className="btn small" onClick={() => setView("manage")}>Kho từ</button>
          <button className="btn small ghost" onClick={resetAll} title="Khôi phục bộ từ gốc">↺</button>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><b>{allWords.length}</b><span>tổng số từ</span></div>
        <div className="stat due"><b>{dueWords.length}</b><span>đến hạn ôn</span></div>
        <div className="stat"><b>{learned}</b><span>đã thuộc kỹ</span></div>
      </div>

      <button className="study-all" onClick={() => startSession(null)}>
        ▶ Học ngay {dueWords.length ? `(${dueWords.length} thẻ đến hạn)` : "(ôn lại tất cả)"}
      </button>

      <h2 className="section-title">Theo chủ đề</h2>
      <div className="topic-grid">
        {data.topics.map((t) => {
          if (editingTopic === t.id) {
            return (
              <TopicForm key={t.id} initial={t}
                onSave={(f) => updateTopic(t.id, f)}
                onDelete={() => deleteTopic(t.id)}
                onCancel={() => setEditingTopic(null)} />
            );
          }
          const due = dueWords.filter((w) => w.topicId === t.id).length;
          return (
            <button className="topic-card" key={t.id} onClick={() => startSession(t.id)}>
              <span className="topic-icon">{t.icon}</span>
              <span className="topic-name">{t.name}</span>
              <span className="topic-meta">{t.words.length} từ{due ? ` · ${due} đến hạn` : ""}</span>
              {due > 0 && <span className="due-dot">{due}</span>}
              <span className="topic-edit" role="button" tabIndex={0} aria-label="Sửa chủ đề"
                onClick={(e) => { e.stopPropagation(); setEditingTopic(t.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingTopic(t.id); } }}>✎</span>
            </button>
          );
        })}
        {addingTopic ? (
          <TopicForm onSave={addTopic} onCancel={() => setAddingTopic(false)} />
        ) : (
          <button className="topic-card topic-add" onClick={() => setAddingTopic(true)}>
            <span className="topic-icon">＋</span>
            <span className="topic-name">Thêm chủ đề</span>
            <span className="topic-meta">tạo bộ từ riêng của bạn</span>
          </button>
        )}
      </div>

      <p className="foot-note">Tiến độ học lưu trên máy bạn · lặp lại ngắt quãng 1→3→7→14 ngày</p>
    </div>
  );
}
