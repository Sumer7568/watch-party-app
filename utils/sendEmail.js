const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log(`[Email Demo] ${options.subject} -> ${options.email}`);
      return { demo: true };
    }
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Elevance Streaming" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email Dispatcher] OTP delivered successfully to: ${options.email}`);
  } catch (error) {
    console.error(`[Email Failed]: Please check Gmail credentials in .env. Error: ${error.message}`);
  }
};

module.exports = sendEmail;
