import { randomUUID } from 'node:crypto';

export const DEFAULT_SETTINGS = {
  overall: 6.5, listening: 6.5, reading: 6.5, writing: 6.0, speaking: 6.0,
  dailyGoal: 20, progress: { date: '', count: 0 },
};
export const isProfileId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export function validState(state) {
  const topics = state?.data?.topics;
  const s = state?.settings;
  if (!Array.isArray(topics) || topics.length > 500 || !s) return false;
  if (!['overall', 'listening', 'reading', 'writing', 'speaking'].every(k =>
    Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 9)) return false;
  if (!Number.isInteger(s.dailyGoal) || s.dailyGoal < 1 || s.dailyGoal > 500) return false;
  if (typeof s.progress?.date !== 'string' || !Number.isInteger(s.progress.count) || s.progress.count < 0) return false;
  const topicIds = new Set();
  const wordIds = new Set();
  const shortString = (v, max) => typeof v === 'string' && v.length <= max;
  let count = 0;
  for (const t of topics) {
    if (!shortString(t.id, 128) || !t.id || topicIds.has(t.id) ||
        !shortString(t.name, 500) || !shortString(t.icon, 64) || !Array.isArray(t.words)) return false;
    topicIds.add(t.id);
    count += t.words.length;
    if (count > 20000) return false;
    for (const w of t.words) {
      if (!shortString(w.uid, 128) || !w.uid || wordIds.has(w.uid) ||
          !shortString(w.word, 500) || !shortString(w.meaning, 10000) ||
          !Number.isInteger(w.box) || w.box < 1 || w.box > 5 ||
          !Number.isFinite(w.due) || w.due < 0) return false;
      wordIds.add(w.uid);
      for (const k of ['ipa', 'type', 'example', 'audio']) {
        if (w[k] !== undefined && !shortString(w[k], 10000)) return false;
      }
      if (w.collocations !== undefined && (!Array.isArray(w.collocations) ||
          w.collocations.length > 100 || !w.collocations.every(v => shortString(v, 1000)))) return false;
    }
  }
  return true;
}

export function createStateStore(db, seedData) {
  return {
    async migrate() {
      await db.query(`CREATE TABLE IF NOT EXISTS flashcard_profiles (
        profile_id UUID PRIMARY KEY,
        state JSONB NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    },
    async health() { await db.query('SELECT 1'); },
    async initialize(profileId, legacy) {
      const existing = await db.query('SELECT state, revision FROM flashcard_profiles WHERE profile_id = $1', [profileId]);
      if (existing.rows.length) return existing.rows[0];
      const initial = legacy || {
        data: { topics: seedData.topics.map(t => ({ ...t, words: t.words.map(w => ({
          ...w, uid: randomUUID(), box: 1, due: Date.now(),
        })) })) },
        settings: DEFAULT_SETTINGS,
      };
      // A second tab may initialize at the same time. Never overwrite its data.
      await db.query('INSERT INTO flashcard_profiles (profile_id, state) VALUES ($1, $2::jsonb) ON CONFLICT (profile_id) DO NOTHING',
        [profileId, JSON.stringify(initial)]);
      return (await db.query('SELECT state, revision FROM flashcard_profiles WHERE profile_id = $1', [profileId])).rows[0];
    },
    async save(profileId, revision, state) {
      const result = await db.query(`UPDATE flashcard_profiles SET state = $3::jsonb,
        revision = revision + 1, updated_at = NOW()
        WHERE profile_id = $1 AND revision = $2 RETURNING revision`,
        [profileId, revision, JSON.stringify(state)]);
      return result.rows[0] || null;
    },
  };
}
