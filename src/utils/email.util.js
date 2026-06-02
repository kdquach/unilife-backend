const nodemailer = require("nodemailer");

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

const sendMail = async ({ to, subject, html, text }) => {
  const transporter = createTransporter();
  return transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
};

const sendForgotPasswordOtp = async (email, otp) => {
  return sendMail({
    to: email,
    subject: "UniLife Password Reset OTP",
    text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
    html: `<p>Your OTP is <b>${otp}</b>.</p><p>It will expire in 10 minutes.</p>`,
  });
};

module.exports = { sendMail, sendForgotPasswordOtp };
