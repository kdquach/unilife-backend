# UniLife seeders

## Database đích

Seeder tổng chỉ chạy khi kết nối đến database `UnilifeDB`. Cơ chế bảo vệ này tránh ghi nhầm vào database mặc định `test` hoặc một database khác.

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/UnilifeDB?retryWrites=true&w=majority
MONGODB_DB_NAME=UnilifeDB
SEED_DATABASE_NAME=UnilifeDB
```

`MONGODB_DB_NAME` buộc backend chọn đúng database kể cả khi path trong URI không đúng chữ hoa/thường. Có thể đổi tên database seed bằng `SEED_DATABASE_NAME`, nhưng giá trị này phải trùng với database mà backend kết nối.

## Seed dữ liệu

Chạy seed theo kiểu idempotent, không xóa các bản ghi khác:

```bash
npm run seed:all
```

Xóa dữ liệu trong các collection của hệ thống rồi seed lại:

```bash
npm run seed:all:reset
```

Lệnh reset chỉ nên dùng khi chắc chắn dữ liệu hiện có trong `UnilifeDB` có thể bị xóa.

## Nguồn dữ liệu

Dữ liệu nghiệp vụ trong `src/seeders/data/unilifedb.data.js` được ánh xạ từ:

- `dulieu/Món ăn.txt`
- `dulieu/Nguyên liệu.txt`
- `dulieu/Supplier.txt`
- `dulieu/Inventory Transaction History.txt`

Seeder tạo 10 món ăn, 34 nguyên liệu, 55 dòng định lượng món ăn, 5 nhà cung cấp và 10 giao dịch kho. Tên món, nguyên liệu, danh mục, đơn vị, mô tả và nội dung nghiệp vụ được lưu bằng tiếng Anh. Bốn nguyên liệu `Honey`, `Mustard Greens`, `Water Spinach` và `Soft Drinks` được bổ sung vì chúng xuất hiện trong công thức hoặc lịch sử kho nhưng không có trong danh sách nguyên liệu gốc.

Ngoài dữ liệu nghiệp vụ trên, seeder còn tạo dữ liệu mẫu hợp lệ cho các model còn lại như người dùng, lịch thực đơn, giỏ hàng, đơn hàng, hàng đợi, đánh giá, thông báo, phiên đăng nhập, OTP, activity log và idempotency key.

## Tài khoản mẫu

Mật khẩu mặc định: `Password@123`. Có thể đổi bằng biến `SEED_DEFAULT_PASSWORD`.

| Role | Email |
|---|---|
| ADMIN | admin@unilife.local |
| MANAGER | manager@unilife.local |
| COUNTER_STAFF | counter@unilife.local |
| KITCHEN_STAFF | kitchen@unilife.local |
| CUSTOMER | customer1@unilife.local |
| CUSTOMER | customer2@unilife.local |
