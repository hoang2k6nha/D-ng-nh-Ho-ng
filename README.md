# Ứng dụng Quản lý Lịch Cá Nhân (Smart Calendar)

Ứng dụng quản lý lịch học, công việc (To-Do) và nhắc nhở, tích hợp lưu trữ đám mây qua Firebase.

## Tính năng
- 📅 **Lịch học/làm việc**: Giao diện kéo thả, chia theo giờ và thứ trong tuần.
- ✅ **Danh sách To-Do**: Gạch ngang khi hoàn thành, xóa công việc đã xong.
- 🔔 **Nhắc nhở**: Thông báo trên trình duyệt khi sắp đến giờ học/làm.
- ☁️ **Lưu trữ đám mây**: Đăng nhập Google và đồng bộ dữ liệu qua Firebase Firestore.

## Cách chạy trên máy cục bộ (Local)

1. **Clone repository**:
   ```bash
   git clone <link-github-cua-ban>
   cd <ten-thu-muc>
   ```

2. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

3. **Cấu hình môi trường**:
   - Tạo file `.env` dựa trên `.env.example`.
   - Đảm bảo file `firebase-applet-config.json` có thông tin dự án Firebase của bạn.

4. **Chạy chế độ phát triển**:
   ```bash
   npm run dev
   ```

5. **Build cho Production**:
   ```bash
   npm run build
   npm start
   ```

## Triển khai lên GitHub / Hosting (Render/Railway)

Ứng dụng này là **Full-stack (Express + Vite)**. Khi triển khai:
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Cần cấu hình**: Đảm bảo cổng (`PORT`) được nền tảng tự động cấp phát (Server đã cấu hình để nhận biến môi trường port nếu cần, hiện tại là mặc định 3000).

## Lưu ý về Firebase
Nếu bạn sử dụng dự án Firebase riêng, hãy cập nhật các quy tắc bảo mật trong file `firestore.rules` lên bảng điều khiển Firebase của bạn.
