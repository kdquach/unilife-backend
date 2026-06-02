require('dotenv').config();
const connectDB = require('../config/db.config');
const User = require('../modules/user/user.model');
const { hashPassword } = require('../utils/password.util');
const ROLES = require('../constants/roles.constant');

const seedAdmin = async () => {
  await connectDB();
  const email = process.env.ADMIN_EMAIL || 'admin@unilife.local';
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Admin account already exists');
    process.exit(0);
  }

  await User.create({
    fullName: process.env.ADMIN_FULL_NAME || 'UniLife Admin',
    email,
    phone: process.env.ADMIN_PHONE || '0000000000',
    passwordHash: await hashPassword(process.env.ADMIN_PASSWORD || 'Admin@123456'),
    role: ROLES.ADMIN,
    isActive: true
  });

  console.log('Admin account created successfully');
  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
