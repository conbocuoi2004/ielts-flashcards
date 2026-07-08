# 🃏 IELTS Flashcards

Ứng dụng fullstack học từ vựng IELTS bằng **spaced repetition** (lặp lại ngắt quãng kiểu Leitner): từ chưa nhớ quay lại ngay, từ đã nhớ giãn dần 1 → 3 → 7 → 14 ngày.

**Tính năng:** 54 từ khởi tạo theo 6 chủ đề (Education, Environment, Technology, Health, Work & Money, Society) kèm IPA + nghĩa Việt + câu ví dụ · thẻ lật 3D · phím tắt (Space lật, 1/2 chấm) · thêm/sửa/xoá từ riêng · tiến độ lưu trên máy (localStorage) · thống kê từ đến hạn ôn.

**Stack:** React 18 (Vite) · Node.js + Express · Docker · Render · Electron desktop.

## Chạy dev

```bash
# Terminal 1
cd server && npm install && npm run dev
# Terminal 2
cd client && npm install && npm run dev   # → http://localhost:5173
```

## Deploy

- **Docker:** `docker compose up -d --build` → http://localhost:8080
- **Render:** push repo lên GitHub → New → Blueprint → chọn repo (đã có `render.yaml`)
- **Desktop .exe:** tab Actions → *Build Desktop App (Windows)* → Run workflow, hoặc `git tag v1.0.0 && git push origin v1.0.0` để đăng lên Releases

## Thêm từ vào bộ khởi tạo

Sửa `server/data/words.json`. Lưu ý: người dùng đã mở app rồi thì dữ liệu nằm trong localStorage của họ — bấm nút ↺ (khôi phục gốc) mới nhận bộ từ mới.
