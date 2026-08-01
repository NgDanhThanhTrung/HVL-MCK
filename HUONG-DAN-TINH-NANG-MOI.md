# 🎧 Hướng dẫn các tính năng mới thêm

File này ghi lại **những gì đã được thêm/sửa** so với bản gốc, và **những việc bạn cần tự làm** để mọi thứ chạy đúng. Đọc cùng với `README.md` (hướng dẫn deploy gốc).

---

## 1. Phát song song cả MP3 và FLAC

**Vì sao:** không phải thiết bị/trình duyệt nào cũng phát được FLAC (đặc biệt Safari/iOS đời cũ), nên trang giờ giữ cả 2 định dạng và tự chọn cái phù hợp.

**Bạn cần làm:**
- Bỏ **cả 2 bản** của mỗi bài vào `assets/audio/`, đặt tên đúng theo mẫu trong `tracks.json`:
  ```
  assets/audio/01-track.mp3
  assets/audio/01-track.flac
  assets/audio/02-track.mp3
  assets/audio/02-track.flac
  ... (đủ 30 bài)
  ```
- Nếu một bài **chỉ có 1 định dạng** (ví dụ chưa có bản FLAC), có thể để trống hoặc xoá field tương ứng trong `js/tracks.json` — code sẽ tự rơi về định dạng còn lại, không bị lỗi.
- Nếu dùng Cloudflare R2 / CDN ngoài (xem Bước 2C trong README gốc): dán **URL đầy đủ** vào cả `mp3_url` và `flac_url`.

**File liên quan:** `js/tracks.json`, `server.js` (đã set header cache cho cả `.mp3` và `.flac`).

---

## 2. Mục chọn chất lượng (Tự động / FLAC / MP3)

Nằm ngay dưới tên bài đang phát, trong khung trình phát.

- **Tự động** (mặc định): phát FLAC nếu thiết bị hỗ trợ, không thì tự chuyển MP3.
- **FLAC** / **MP3**: ép cứng định dạng người dùng muốn nghe.
- Nút **FLAC sẽ tự mờ đi (khoá)** nếu trình duyệt không hỗ trợ, kèm chú thích khi rê chuột vào.
- Lựa chọn được **nhớ lại** (lưu trong `localStorage` của trình duyệt) — lần sau vào lại trang không cần chọn lại.
- Đổi chất lượng khi đang phát sẽ **giữ nguyên vị trí đang nghe**, không bị tua về đầu.

**File liên quan:** `js/main.js` (hàm `pickAudioUrl`, `initQualityControls`), `index.html` (khối `#qualitySelect`), `css/style.css` (class `.quality-*`).

---

## 3. Phát nền / nghe khi khoá màn hình (tiện lúc ngủ)

### a) Media Session API
Khi phát nhạc, trang sẽ gửi thông tin bài hát (tên, nghệ sĩ, ảnh bìa) cho hệ điều hành, hiện ra ở:
- Màn hình khoá điện thoại
- Thanh thông báo / trung tâm điều khiển
- Nút media trên tai nghe bluetooth, vô lăng ô tô, v.v.

Có sẵn nút Play/Pause, Bài trước/Bài sau ngay trên các giao diện đó — không cần mở lại app.

### b) Tự khôi phục khi khoá màn hình
Trang dùng Web Audio API để vẽ hiệu ứng equalizer. Một số trình duyệt (đặc biệt Safari/iOS) hay tự tạm dừng bộ xử lý âm thanh này khi khoá màn hình, khiến nhạc bị câm dù nhìn vẫn như đang phát. Code đã tự động khôi phục lại khi bạn quay lại app/tab.

### ⚠️ Lưu ý thực tế — quan trọng
| Nền tảng | Mức độ ổn định khi khoá màn hình |
|---|---|
| **Android Chrome** | Rất ổn định, kể cả mở qua tab trình duyệt bình thường |
| **iOS Safari (mở qua tab)** | Có thể bị hệ điều hành tạm dừng sau một lúc, tuỳ phiên bản iOS |
| **iOS — sau khi "Thêm vào Màn hình chính"** | Ổn định hơn nhiều, khuyên dùng nếu nghe trên iPhone |
| **Tắt hẳn nguồn điện thoại** | Không app web nào giữ phát được — chỉ khoá màn hình/tắt màn hình là được |

**Cách thêm vào Màn hình chính (iPhone):** mở trang bằng Safari → nút Share (hình vuông có mũi tên) → **"Thêm vào MH chính"**.

**File liên quan:** `js/main.js` (mục `MEDIA SESSION`, hàm `resumeAudioGraphIfNeeded`).

---

## 4. Hẹn giờ ngủ (Sleep Timer)

Nút **"😴 Hẹn giờ ngủ"** nằm ngay dưới mục chọn chất lượng.

Bấm vào để chọn:
- 15 / 30 / 45 / 60 phút, hoặc
- **"Hết bài đang phát"** — dừng ngay khi bài hiện tại kết thúc, không tự chuyển bài kế.

Khi còn đang đếm giờ, nút sẽ đổi màu và hiện **đồng hồ đếm ngược**. Khi hết giờ, nhạc sẽ **fade nhỏ dần trong ~5 giây rồi tự dừng** (không tắt phựt gây giật mình). Có thể bấm **"Tắt hẹn giờ"** bất cứ lúc nào để huỷ.

**File liên quan:** `js/main.js` (mục `SLEEP TIMER`), `index.html` (khối `#sleepTimer`), `css/style.css` (class `.sleep-timer-*`).

---

## 5. Tên bài hát hiển thị kèm số thứ tự

Ở những chỗ chưa có cột số riêng, tên bài giờ hiển thị dạng **"01. Elegie"** — số `01` lấy tự động từ `id` của track trong `tracks.json` (chính là thứ tự sắp xếp), không cần gõ tay vào field `title`.

Áp dụng ở:
- Khung "Đang phát" (audio & video)
- Thanh trạng thái mini trên header
- Thanh mini-player trên mobile
- Tên bài hiện trên màn hình khoá (Media Session)

**Không** áp dụng ở dòng danh sách tracklist bên trái, vì ở đó đã có cột số riêng (`01`, `02`...) đứng trước tên bài rồi — thêm nữa sẽ bị lặp số.

Nếu muốn đổi cách định dạng (ví dụ dùng `-` thay vì `.`, hoặc bỏ số 0 phía trước), sửa 1 dòng duy nhất trong `js/main.js`:
```js
const displayTitle = (track) => `${pad2(track.id)}. ${track.title}`;
```

**File liên quan:** `js/main.js` (hàm `displayTitle`).

---

## Tóm tắt file đã thay đổi

| File | Thay đổi |
|---|---|
| `js/tracks.json` | Mỗi track có cả `mp3_url` và `flac_url` |
| `js/main.js` | Chọn định dạng theo thiết bị/lựa chọn người dùng, fallback khi lỗi, Media Session, hẹn giờ ngủ, tự resume AudioContext, hiển thị tên bài kèm số thứ tự |
| `server.js` | Header cache/range hỗ trợ thêm đuôi `.flac` |
| `index.html` | Thêm khối UI chọn chất lượng + hẹn giờ ngủ |
| `css/style.css` | Style cho 2 khối UI trên |
