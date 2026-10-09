import crypto from "crypto";

export function getLiveBreakdownsWeekAnchor(date = new Date()): string {
  const currentDate = new Date(date);
  const dayOfWeek = currentDate.getDay();
  const daysSinceSaturday = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  currentDate.setDate(currentDate.getDate() - daysSinceSaturday);
  currentDate.setHours(0, 0, 0, 0);

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLiveBreakdownsWeeklyToken(date = new Date()): string {
  const weekAnchor = getLiveBreakdownsWeekAnchor(date);
  const secret = (process.env.SESSION_SECRET || "").trim();
  return crypto.createHmac("sha256", secret).update(`live-breakdowns:week:${weekAnchor}`).digest("hex");
}
