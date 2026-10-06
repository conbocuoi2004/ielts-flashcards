import { randomUUID } from 'node:crypto';
import { isProfileId, validState } from './state-store.js';

export function registerStateApi(app, store) {
  app.use('/api/state', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Reject cross-site writes even when third-party cookies are enabled.
    const origin = req.get('origin');
    let originHost;
    try { originHost = origin ? new URL(origin).host : null; }
    catch { return res.status(403).json({ error: 'Nguồn yêu cầu không hợp lệ.' }); }
    if (req.get('sec-fetch-site') === 'cross-site' ||
        (originHost && originHost !== req.get('host'))) {
      return res.status(403).json({ error: 'Yêu cầu khác nguồn bị từ chối.' });
    }
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
      const i = c.indexOf('=');
      return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    }));
    req.profileId = isProfileId(cookies.flashcards_profile) ? cookies.flashcards_profile : null;
    next();
  });

  app.post('/api/state/init', async (req, res, next) => {
    try {
      const legacy = req.body?.legacy;
      if (legacy !== undefined && legacy !== null && !validState(legacy)) {
        return res.status(400).json({ error: 'Dữ liệu cũ không hợp lệ. Bản lưu trong trình duyệt vẫn được giữ.' });
      }
      const profileId = req.profileId || randomUUID();
      const result = await store.initialize(profileId, legacy);
      // Only set a profile cookie after successful persistence.
      res.cookie('flashcards_profile', profileId, {
        httpOnly: true, sameSite: 'strict', secure: req.secure || process.env.COOKIE_SECURE === 'true',
        maxAge: 365 * 24 * 60 * 60 * 1000, path: '/',
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  app.put('/api/state', async (req, res, next) => {
    try {
      if (!req.profileId) return res.status(401).json({ error: 'Hãy tải lại trang để khởi tạo phiên học.' });
      const { state, revision } = req.body || {};
      if (!Number.isInteger(revision) || revision < 1 || revision >= 2147483647 || !validState(state)) {
        return res.status(400).json({ error: 'Dữ liệu học không hợp lệ.' });
      }
      const saved = await store.save(req.profileId, revision, state);
      if (!saved) return res.status(409).json({ error: 'Dữ liệu đã đổi ở tab khác. Tải lại trang trước khi tiếp tục; bản lưu trên máy vẫn được giữ.' });
      res.json(saved);
    } catch (err) { next(err); }
  });
}
