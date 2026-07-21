const sendEmail = async (options) => {
  try {
    console.log(`[Brevo Dispatcher] Attempting email dispatch to: ${options.email}`);

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.log("Email blocked by Render (BREVO_API_KEY missing), OTP is in logs");
      return null;
    }

    const payload = {
      sender: { email: "singhsumersingh35@gmail.com", name: "Elevance App" },
      to: [{ email: options.email }],
      subject: options.subject,
      textContent: options.message,
    };

    if (options.html) {
      payload.htmlContent = options.html;
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.log("Email blocked by Render, OTP is in logs");
      console.error(`[Brevo API Error] Status ${response.status}:`, data.message || JSON.stringify(data));
      return null;
    }

    console.log(`[Brevo Dispatcher] Email delivered successfully to: ${options.email} (MessageId: ${data.messageId || "N/A"})`);
    return data;
  } catch (error) {
    console.log("Email blocked by Render, OTP is in logs");
    console.error(`[Brevo Exception Details]: ${error.message}`);
    return null;
  }
};

module.exports = sendEmail;
