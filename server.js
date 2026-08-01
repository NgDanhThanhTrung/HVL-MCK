/**
 * server.js — Web Service tối giản cho Render (tuỳ chọn thay thế Static Site).
 * Chỉ dùng khi bạn CHỌN deploy dạng "Web Service" trên Render.
 * Nếu deploy dạng "Static Site", KHÔNG CẦN file này.
 *
 * Chức năng: phục vụ toàn bộ thư mục hiện tại như 1 static server,
 * tự hỗ trợ HTTP Range Requests (bắt buộc để tua nhạc/video mượt),
 * và bật CORS phòng khi bạn cần gọi tới từ domain khác.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Render tự cấp biến PORT, không tự đặt cứng

app.use(cors());

// express.static tự động xử lý Range Requests (206 Partial Content)
// -> cần thiết để tua nhanh file flac/mp4 mà không phải tải lại từ đầu
app.use(express.static(path.join(__dirname), {
  maxAge: '7d', // cache 7 ngày cho assets tĩnh (css/js/ảnh) ở phía trình duyệt/CDN
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.flac') || filePath.endsWith('.mp3') || filePath.endsWith('.mp4')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.listen(PORT, () => {
  console.log(`HVL album site đang chạy tại cổng ${PORT}`);
});
