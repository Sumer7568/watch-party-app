const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  try {
    console.log(`[Email Dispatcher] Attempting Nodemailer dispatch using EMAIL_USER=${process.env.EMAIL_USER}`);

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
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Dispatcher] Email delivered successfully to: ${options.email} (MessageID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`[Email Failed]: Please check credentials in .env. Error: ${error.message}`);
    throw error;
  }
};

module.exports = sendEmail;
