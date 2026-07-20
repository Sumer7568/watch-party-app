const sendSms = async ({ mobile, message }) => {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: from } = process.env;
  if (!sid || !token || !from) {
    console.log(`[SMS Demo] ${mobile}: ${message}`);
    return { demo: true };
  }
  const body = new URLSearchParams({ To: mobile, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`SMS provider rejected the request (${response.status}).`);
  return response.json();
};

module.exports = sendSms;
