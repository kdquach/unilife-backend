const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const addMinutes = (minutes) => new Date(Date.now() + minutes * 60 * 1000);
module.exports = { generateOtp, addMinutes };
