# UniLife Backend Scaffold

NodeJS + ExpressJS backend scaffold for UniLife.

## Current architecture

This version does **not** use the Repository layer because the team is not familiar with it.

```txt
Route -> Controller -> Service -> Model -> MongoDB Atlas
```

## Important note about database fields

The uploaded ERD uses names such as `userId`, `orderId`, `foodId` as primary keys. In MongoDB/Mongoose, the real primary key is `_id`. Each model adds a virtual id alias such as `userId`, `orderId`, `foodId` that maps to `_id` when JSON is returned.

Foreign key fields such as `userId`, `foodId`, `orderId`, `menuScheduleItemId` are stored as `ObjectId` references exactly according to the ERD.

## Modules

Functional module:
- `auth`: login, register, refresh token, forgot password, reset password, logout, change password.

Database-table modules:
- `user`
- `session`
- `otp`
- `activityLog`
- `notification`
- `userNotification`
- `foodCategory`
- `food`
- `foodIngredient`
- `menuSchedule`
- `menuScheduleItem`
- `cart`
- `cartItem`
- `order`
- `orderItem`
- `queue`
- `rating`
- `ingredientCategory`
- `ingredient`
- `ingredientBatch`
- `ingredientTransaction`
- `supplier`

`payment`, `systemConfig`, `report`, and `upload` modules were removed because they are not tables in the provided database diagram. Sepay can be integrated later inside the order/payment flow after the payment table or final payment rule is confirmed.

## Run

```bash
npm install
cp .env.example .env
npm run seed:admin
npm run dev
```

## Auth APIs

```txt
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh-token
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/logout
PATCH  /api/v1/auth/change-password
GET    /api/v1/auth/me
```

## User APIs

```txt
GET    /api/v1/users/profile
PATCH  /api/v1/users/profile
POST   /api/v1/users/profile/avatar
GET    /api/v1/users
PATCH  /api/v1/users/:id/status
PATCH  /api/v1/users/:id/role
```
