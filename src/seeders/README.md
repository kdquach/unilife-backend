# UniLife Seeders

## Seed toàn bộ dữ liệu mẫu

```bash
npm run seed:all
```

Lệnh này sẽ thêm/cập nhật dữ liệu mẫu cho toàn bộ collection theo database hiện tại:

- User
- Session
- OTP
- ActivityLog
- Notification
- UserNotification
- FoodCategory
- Food
- FoodIngredient
- MenuSchedule
- MenuScheduleItem
- Cart
- CartItem
- Order
- OrderItem
- Queue
- Rating
- IngredientCategory
- Ingredient
- IngredientBatch
- IngredientTransaction
- Supplier

## Reset database rồi seed lại

```bash
npm run seed:all:reset
```

Hoặc:

```bash
SEED_RESET=true npm run seed:all
```

Cẩn thận khi dùng với MongoDB Atlas thật, vì `SEED_RESET=true` sẽ xóa dữ liệu trong các collection của hệ thống.

## Tài khoản mẫu

Mật khẩu mặc định: `Password@123`

| Role | Email |
|---|---|
| ADMIN | admin@unilife.local |
| MANAGER | manager@unilife.local |
| COUNTER_STAFF | counter@unilife.local |
| KITCHEN_STAFF | kitchen@unilife.local |
| CUSTOMER | customer1@unilife.local |
| CUSTOMER | customer2@unilife.local |
