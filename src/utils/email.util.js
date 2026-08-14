const nodemailer = require("nodemailer");

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendMail = async ({ to, subject, html, text }) => {
  const transporter = createTransporter();

  try {
    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });

    return result;
  } catch (error) {
    console.error("Email sending error:", error);

    const err = new Error(
      error?.code === "EAUTH" || error?.responseCode === 535
        ? "Email service authentication failed. Please check SMTP_USER and SMTP_PASS."
        : "Email service is unavailable. Please try again later."
    );

    err.statusCode = 502;
    err.cause = error;

    throw err;
  }

};

const sendRegistrationOtp = async (email, otp) => {
  return sendMail({
    to: email,
    subject: "UniLife - Email Verification",
    text: `Your UniLife verification code is ${otp}. It will expire in 10 minutes.`,
    html: `
      <div>
        <h2>Verify your UniLife account</h2>
        <p>Your verification code is:</p>
        <h1>${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `,
  });
};

const sendForgotPasswordOtp = async (email, otp) => {
  return sendMail({
    to: email,
    subject: "UniLife Password Reset OTP",
    text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
    html: `
      <div>
        <h2>UniLife Password Reset</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `,
  });
};

module.exports = {
  sendMail,
  sendForgotPasswordOtp,
  sendRegistrationOtp,
};