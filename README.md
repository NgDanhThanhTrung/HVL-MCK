# HVL — MCK · Album Website

Trang web fan-made cho album **"HVL"** của **MCK** (30 tracks) — phong cách **Gothic Dark Fantasy x Y2K**.
Xây dựng bằng **HTML / CSS / JavaScript thuần** (Vanilla) — không cần cài framework, không cần build tool, chạy được ngay trên trình duyệt và deploy miễn phí trong vài phút.

> ⚠️ Đây là dự án demo giao diện. MP3, video và ảnh bìa **không được đính kèm sẵn** vì lý do bản quyền — bạn cần tự chuẩn bị theo hướng dẫn bên dưới.

---

## 📁 Cấu trúc thư mục

```
hvl-album/
├── index.html              ← Trang chính (không cần sửa gì nếu chỉ đổi nội dung)
├── README.md                ← Chính là file bạn đang đọc
├── server.js                 ← CHỈ dùng nếu deploy Render dạng "Web Service" (xem Bước 4B)
├── package.json               ← CHỈ dùng cùng với server.js — bỏ qua nếu deploy Static Site
├── css/
│   └── style.css             ← Toàn bộ style (màu sắc, layout, hiệu ứng)
├── js/
│   ├── main.js                ← Toàn bộ logic (tracklist, player, equalizer...)
│   └── tracks.json            ← Dữ liệu 30 bài hát — ĐÂY LÀ FILE BẠN SẼ SỬA NHIỀU NHẤT
└── assets/
    ├── covers/                ← Bỏ 30 ảnh bìa từng bài + 1 ảnh bìa album chính vào đây (nếu không dùng Cloudflare R2)
    └── audio/                 ← Bỏ 30 file MP3 vào đây (chỉ để demo — traffic lớn nên dùng Cloudflare R2, xem Bước 2C)
```

**Bước 1 — Chuẩn bị:**
1. Tải toàn bộ project về máy (giải nén nếu là file `.zip`).
2. Mở thư mục `hvl-album/` bằng VS Code (khuyên dùng) hoặc bất kỳ trình soạn thảo nào.
3. Không cần cài `npm`, không cần Node.js — đây là web thuần, mở file `index.html` là chạy được.

---

## 🎵 Bước 2 — Chuẩn bị 30 file MP3, 30 ảnh bìa & 30 YouTube ID

### A. Ảnh bìa album chính (hero, bên trái màn hình)
- Đặt file ảnh (tỉ lệ vuông **1:1**, khuyên dùng 800×800px trở lên) vào `assets/covers/`, đặt tên đúng là **`cover.jpg`**.
- Trang web đã tự động load `assets/covers/cover.jpg` — bạn chỉ cần bỏ đúng file vào đúng thư mục với đúng tên là xong, **không cần sửa gì trong `index.html`**. Nếu chưa có file, trang sẽ tự hiện khung placeholder gothic thay thế (không bị lỗi vỡ ảnh).

### B. 30 ảnh bìa riêng cho từng bài hát
- Đặt 30 ảnh vào `assets/covers/`, đặt tên theo đúng mẫu **`<số thứ tự 2 chữ số>. <Tên bài hát>.jpg`** — đúng như tên track trong album, ví dụ:
  - `01. Elegie.jpg`
  - `02. IDK.jpg`
  - `03. Wtf Bby I'm Lit.jpg`
  - `12. Liệm.jpg`
  - `30. Thịt Lợn.jpg`
- `js/tracks.json` đã điền sẵn đúng tên file theo mẫu này cho cả 30 bài rồi — bạn chỉ cần đặt ảnh đúng tên là khớp ngay, không cần sửa `tracks.json`.
- **Lưu ý:** tên file có dấu cách và dấu tiếng Việt vẫn hoạt động bình thường (trang web tự động encode khi tải ảnh) — chỉ cần gõ **chính xác chữ hoa/thường và dấu câu** giống hệt tên bài (kể cả dấu `'` trong "Wtf Bby I'm Lit"), nếu không ảnh sẽ không khớp.
- Nếu không có ảnh riêng cho từng bài, bạn có thể dùng chung 1 ảnh bìa album cho tất cả — chỉ cần sửa lại từng dòng `cover_art` trong `tracks.json` để trỏ cùng về `"assets/covers/cover.jpg"`.

### C. 30 file MP3 — nên lưu ở đâu để tối ưu băng thông?

Nếu chỉ demo cá nhân, để file MP3 trong `assets/audio/` như trên là đủ. Nhưng nếu bạn định public cho **nhiều người nghe cùng lúc**, KHÔNG nên để MP3 nằm chung trong repo deploy (Render/Vercel/GitHub Pages) — vì các nền tảng này tính phí hoặc giới hạn **bandwidth (băng thông)** khi lượng truy cập lớn. Cách đúng là: **tách file media ra một Object Storage + CDN chuyên dụng**, chỉ dán URL đầy đủ vào `mp3_url` trong `tracks.json` — code hiện tại đã hỗ trợ sẵn URL ngoài, không cần sửa gì thêm.

So sánh các lựa chọn **miễn phí / gần như miễn phí**, xếp theo độ phù hợp với traffic lớn:

| Dịch vụ | Băng thông (egress) | Dung lượng free | Ghi chú |
|---|---|---|---|
| **Cloudflare R2** ⭐ khuyên dùng | **Miễn phí vĩnh viễn, không giới hạn** (R2 không tính phí egress dù traffic lớn cỡ nào) | 10GB lưu trữ free/tháng, dư cho 30 MP3 (~1–2GB nếu nén 128–192kbps) | Tương thích S3 API, gắn CDN Cloudflare sẵn, hỗ trợ CORS để Equalizer (Web Audio API) vẫn phân tích được sóng nhạc thật |
| **Backblaze B2 + Cloudflare** | Miễn phí (nhờ "Bandwidth Alliance" giữa B2 và Cloudflare) | 10GB free | Cần cấu hình thêm Cloudflare CDN đứng trước B2, hơi phức tạp hơn R2 |
| **Bunny.net Storage + CDN** | Rất rẻ (~$0.01/GB), không có gói free vĩnh viễn nhưng chi phí gần như không đáng kể ở quy mô fan-site | Có bản dùng thử | Tốc độ tốt, dashboard dễ dùng |
| GitHub Releases + jsDelivr CDN | Miễn phí | Mỗi file tối đa 2GB | Dễ setup nhưng jsDelivr có thể rate-limit nếu traffic tăng đột biến, không hợp cho scale rất lớn |
| Google Drive / Dropbox link trực tiếp | Miễn phí nhưng **có trần băng thông/ngày** | Vài GB | Chỉ hợp demo nhỏ, dễ bị chặn link khi vượt quota |

**Khuyên dùng: Cloudflare R2**, vì đây là lựa chọn duy nhất trong danh sách **miễn phí egress ở MỌI quy mô traffic** — dù 100 người hay 1 triệu người nghe cùng lúc, bạn không bao giờ bị tính thêm phí băng thông, chỉ trả (rất ít) cho phần lưu trữ vượt 10GB.

**Cách setup nhanh với Cloudflare R2:**
1. Tạo tài khoản Cloudflare miễn phí: https://dash.cloudflare.com
2. Vào mục **R2 Object Storage** → **Create bucket**, đặt tên (ví dụ `hvl-audio`).
3. Upload 30 file MP3 vào bucket (kéo-thả trực tiếp trên dashboard, hoặc dùng `rclone`/AWS CLI nếu có nhiều file).
4. Vào **Settings** của bucket → **Public access** → bật **Allow Access** để có URL public dạng:
   `https://pub-xxxxxxxx.r2.dev/01-track.mp3`
   (hoặc gắn custom domain riêng, ví dụ `cdn.tenmien.com`, để URL đẹp và tận dụng CDN Cloudflare toàn cầu).
5. Vào **CORS Policy** của bucket, thêm rule cho phép domain trang web của bạn gọi tới (bắt buộc, nếu không trình duyệt sẽ chặn và **Equalizer sẽ không phân tích được sóng nhạc**):
   ```json
   [
     {
       "AllowedOrigins": ["https://<domain-website-cua-ban>"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"]
     }
   ]
   ```
6. Copy URL từng file, dán vào trường `mp3_url` tương ứng trong `js/tracks.json`, ví dụ:
   ```json
   "mp3_url": "https://pub-xxxxxxxx.r2.dev/01-track.mp3"
   ```

### D. Về file MP4 (video)
Theo thiết kế của trang, phần xem MV **dùng YouTube nhúng** (không phải file MP4 tự host) — đây thực ra đã là lựa chọn tối ưu nhất cho băng thông: YouTube CDN xử lý mọi traffic, hoàn toàn miễn phí, không giới hạn số người xem cùng lúc, bạn không cần lo phần này. Bạn chỉ cần YouTube Video ID theo hướng dẫn mục E bên dưới — không cần tự upload/host file `.mp4` nào cả.

### E. 30 YouTube Video ID (cho phần xem MV)
- Vào YouTube, mở video MV của từng bài.
- Copy phần **ID** trong đường link, ví dụ:
  `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → ID là **`dQw4w9WgXcQ`** (phần sau `v=`).
- Ghi lại 30 ID này để điền vào bước 3.

---

## 📝 Bước 3 — Điền dữ liệu vào `js/tracks.json`

Mở file `js/tracks.json`. Mỗi bài hát là 1 object trong mảng, có cấu trúc:

```json
{
  "id": 1,
  "title": "Elegie",
  "artist": "MCK",
  "duration": "3:24",
  "cover_art": "assets/covers/01. Elegie.jpg",
  "mp3_url": "assets/audio/01-track.mp3",
  "youtube_id": "dQw4w9WgXcQ"
}
```

Giải thích từng trường:

| Trường        | Ý nghĩa                                                              | Ví dụ |
|---------------|-----------------------------------------------------------------------|-------|
| `id`          | Số thứ tự bài hát (1 → 30), **không được trùng nhau**                 | `12` |
| `title`       | Tên bài hát                                                            | `"Liệm"` |
| `artist`      | Nghệ sĩ / nghệ sĩ khách mời                                            | `"MCK feat. Tage"` |
| `duration`    | Thời lượng thật của bài, định dạng `phút:giây`                        | `"3:45"` |
| `cover_art`   | Đường dẫn ảnh bìa riêng, theo mẫu `assets/covers/<xx>. <Tên bài>.jpg` (hoặc URL đầy đủ nếu dùng Cloudflare R2/dịch vụ ngoài) | `"assets/covers/12. Liệm.jpg"` |
| `mp3_url`     | Đường dẫn tới file MP3 (hoặc URL đầy đủ)                               | `"assets/audio/12-track.mp3"` |
| `youtube_id`  | ID video YouTube (không phải cả link, chỉ phần ID)                    | `"dQw4w9WgXcQ"` |

**Việc cần làm:**
1. Đã có sẵn khung 30 track đúng theo thứ tự album chính thức — bạn chỉ cần:
   - Sửa `duration` thành thời lượng thật.
   - Sửa `cover_art` trỏ đúng tên file ảnh bạn đã lưu ở Bước 2.
   - Sửa `mp3_url` trỏ đúng tên file MP3.
   - Sửa `youtube_id` thành ID video thật (nếu bài nào chưa có MV, có thể để trống `""`, hệ thống sẽ tự hiện thông báo "chưa có MV").
2. **Lưu ý cú pháp JSON:** mỗi object cách nhau bằng dấu phẩy `,`, object cuối cùng trong mảng **không có dấu phẩy** sau `}`. Nếu không chắc, dùng công cụ kiểm tra JSON online (tìm "JSON validator") để tránh lỗi khiến cả trang trắng.

---

## 💻 Bước 4 — Chạy thử & Đưa lên mạng miễn phí

### A. Chạy thử trên máy (Local Host)

**Cách 1 — VS Code + Live Server (khuyên dùng, dễ nhất):**
1. Cài VS Code: https://code.visualstudio.com
2. Mở thư mục `hvl-album/` trong VS Code.
3. Cài extension **"Live Server"** (của tác giả Ritwick Dey) từ tab Extensions.
4. Chuột phải vào file `index.html` → chọn **"Open with Live Server"**.
5. Trình duyệt tự mở `http://127.0.0.1:5500` — trang web chạy ngay.

> Vì trang web dùng `fetch()` để tải `tracks.json`, bạn **bắt buộc phải mở qua một local server** (Live Server, hoặc cách bên dưới) — không mở trực tiếp file `index.html` bằng cách double-click, vì trình duyệt sẽ chặn `fetch()` với lỗi CORS.

**Cách 2 — Dùng Python (nếu máy đã cài Python):**
```bash
cd hvl-album
python3 -m http.server 8000
```
Sau đó mở trình duyệt vào `http://localhost:8000`.

**Cách 3 — Dùng Node.js:**
```bash
cd hvl-album
npx serve
```

### B. Đưa lên mạng miễn phí

#### Option 1: GitHub Pages
1. Tạo tài khoản GitHub (nếu chưa có): https://github.com
2. Tạo repository mới (ví dụ đặt tên `hvl-album`), chọn **Public**.
3. Upload toàn bộ nội dung thư mục `hvl-album/` lên repo đó (dùng GitHub Desktop, hoặc kéo-thả trực tiếp trên web GitHub, hoặc Git command line).
4. Vào **Settings** của repo → mục **Pages** (menu bên trái) → ở **Source**, chọn nhánh `main` và thư mục `/root` → **Save**.
5. Đợi 1–2 phút, GitHub sẽ cung cấp link dạng:
   `https://<tên-tài-khoản>.github.io/hvl-album/`

#### Option 2: Vercel (nhanh hơn, hỗ trợ file lớn tốt hơn)
1. Tạo tài khoản tại https://vercel.com (có thể đăng nhập bằng GitHub).
2. Bấm **Add New → Project**.
3. Chọn **Import** repo GitHub đã tạo ở trên (hoặc kéo-thả thư mục project bằng tính năng "Deploy without Git" nếu không dùng GitHub).
4. Vercel tự nhận diện đây là site tĩnh (Static), không cần cấu hình Build Command / Output Directory gì thêm — bấm **Deploy**.
5. Sau ~30 giây, Vercel trả về link dạng:
   `https://hvl-album.vercel.app`

#### Option 3: Render

Render có 2 kiểu service — **chọn đúng loại quan trọng vì ảnh hưởng trực tiếp tới băng thông/chi phí:**

| | Static Site | Web Service |
|---|---|---|
| Phù hợp cho | Trang HTML/CSS/JS thuần (đúng loại project này) | Có server logic riêng (Node, API...) |
| Băng thông free | Miễn phí, có CDN toàn cầu sẵn | Tính vào 100GB/tháng free, hết là chặn hoặc tính phí |
| "Ngủ" khi rảnh | Không bao giờ ngủ | Free tier ngủ sau 15 phút không ai truy cập → lần load đầu sau đó bị chậm (cold start) |
| Cần file `server.js`/`package.json`? | Không | Có |

**➜ Khuyến nghị: dùng Static Site**, vì project này không có server logic, Static Site vừa miễn phí vô hạn vừa không bị cold-start — phù hợp hơn khi lượng truy cập lớn. Các bước:
1. Đẩy toàn bộ project lên một repo GitHub trước (Render bắt buộc deploy qua Git, không hỗ trợ kéo-thả file trực tiếp như Vercel).
2. Vào https://dashboard.render.com → đăng nhập bằng GitHub.
3. Bấm **New + → Static Site**, chọn repo vừa tạo.
4. Cấu hình: **Build Command** để trống, **Publish Directory** gõ dấu chấm `.` (vì `index.html` nằm ở thư mục gốc).
5. Bấm **Deploy Static Site**. Sau ~30 giây–1 phút, Render trả về link dạng `https://<tên-project>.onrender.com`.
6. Mỗi lần `git push` code mới, Render tự động deploy lại.

**Nếu vẫn muốn dùng Web Service** (ví dụ bạn định thêm server logic sau này, như xác thực người dùng hay giới hạn tải xuống), project đã có sẵn 2 file phục vụ việc này — `server.js` và `package.json` ở thư mục gốc:
1. Đẩy project (bao gồm `server.js` và `package.json`) lên GitHub như trên.
2. Trên Render, bấm **New + → Web Service**, chọn repo.
3. Cấu hình:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (hoặc trả phí nếu cần tránh cold-start khi traffic lớn)
4. Bấm **Deploy Web Service**. `server.js` sẽ tự phục vụ toàn bộ `index.html`, `css/`, `js/`, `assets/` kèm hỗ trợ HTTP Range Requests (giúp tua nhạc/video mượt, không phải tải lại từ đầu).
5. Lưu ý: nếu bạn để nguyên MP3 nằm trong `assets/audio/` và deploy dạng Web Service, băng thông phát nhạc sẽ tính vào quota của Render — **vẫn nên áp dụng Cloudflare R2 ở Bước 2C** để tách audio ra ngoài, giữ Web Service chỉ phục vụ mã nguồn nhẹ (HTML/CSS/JS), như vậy vừa tối ưu băng thông vừa chịu tải tốt hơn nhiều khi có traffic lớn.

> **Gợi ý:** vì MP3 khá nặng, nếu deploy lên GitHub Pages/Vercel/Render bị chậm hoặc vượt giới hạn dung lượng, hãy áp dụng cách lưu MP3 trên Cloudflare R2 + dán URL đã nói ở Bước 2C.

---

## 🎨 Tuỳ biến nhanh

- **Đổi bảng màu:** mở `css/style.css`, sửa các biến trong khối `:root` ở đầu file (`--bg`, `--accent`, `--surface`, `--moss`, `--text`).
- **Đổi đoạn giới thiệu album / tiêu đề:** sửa trực tiếp trong `index.html`, khối `<section class="hero">`.
- **Bật/tắt hiệu ứng nhiễu hạt (grain):** trong `css/style.css`, chỉnh `opacity` của class `.grain-overlay` (mặc định `.05`, để `0` sẽ tắt hẳn).

---

## ❓ Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| Trang trắng, không hiện tracklist | Mở file bằng double-click thay vì qua local server | Dùng Live Server / `python3 -m http.server` như Bước 4A |
| Tracklist hiện nhưng không có bài nào | `tracks.json` bị sai cú pháp (thiếu dấu phẩy, thừa dấu phẩy) | Dán nội dung file vào một JSON validator online để tìm lỗi |
| Bấm "Nghe MP3" nhưng không phát được nhạc | Sai đường dẫn `mp3_url`, hoặc file MP3 chưa được đặt đúng thư mục | Kiểm tra lại tên file / đường dẫn trong `tracks.json` khớp với file thật trong `assets/audio/` |
| Bấm "Xem MP4" hiện dòng "chưa có MV" | `youtube_id` đang để giá trị mặc định hoặc rỗng | Điền đúng YouTube Video ID theo hướng dẫn Bước 2D |
| Sóng nhạc (Equalizer) không chạy | Trình duyệt chặn autoplay âm thanh có phân tích Web Audio API | Bấm nút Play thủ công một lần, các trình duyệt hiện đại yêu cầu tương tác người dùng trước khi phát âm thanh |

---

Made with 🩸 for the HVL community — không đại diện chính thức cho MCK / 311 Synd.
