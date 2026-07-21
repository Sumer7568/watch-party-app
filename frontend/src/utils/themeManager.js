/**
 * Theme Manager Utility
 * Checks current time in Indian Standard Time (IST, UTC+5:30).
 * Returns 'light' if the current IST time is between 10:00 AM and 12:00 PM (10:00 - 11:59).
 * Otherwise returns 'dark'.
 */
export function getAutoThemeIST() {
  const now = new Date();
  
  // Calculate IST time (UTC + 5 hours 30 mins)
  const utcOffsetMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(utcOffsetMs + istOffsetMs);

  const istHours = istDate.getHours();

  // 10:00 AM to 12:00 PM IST -> Light Theme
  if (istHours >= 10 && istHours < 12) {
    return "light";
  }

  return "dark";
}

export function resolveTheme(preference) {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return getAutoThemeIST();
}
