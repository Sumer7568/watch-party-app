const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    console.log(`[Resend Dispatcher] Attempting email dispatch to: ${options.email}`);

    const payload = {
      from: "onboarding@resend.dev",
      to: [options.email],
      subject: options.subject,
      text: options.message,
    };

    if (options.html) {
      payload.html = options.html;
    }

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.log("Email blocked by Render, OTP is in logs");
      console.error(`[Resend Error Details]: ${error.message || JSON.stringify(error)}`);
      return null;
    }

    console.log(`[Resend Dispatcher] Email delivered successfully to: ${options.email} (ID: ${data?.id})`);
    return data;
  } catch (error) {
    console.log("Email blocked by Render, OTP is in logs");
    console.error(`[Resend Exception Details]: ${error.message}`);
    return null;
  }
};

module.exports = sendEmail;
