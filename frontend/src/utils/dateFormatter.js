/**
 * Unified Date Formatter for CloudOps Market Monitor
 * Formats timestamps consistently as: "07 Oct 2026, 12:05 PM IST" or "07 Oct 2026, 06:35 AM UTC"
 */
export function formatDateTime(timestamp, timezone = 'IST') {
  if (!timestamp) return 'N/A';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return 'N/A';

  const tz = timezone === 'IST' ? 'Asia/Kolkata' : 'UTC';
  const tzSuffix = timezone === 'IST' ? 'IST' : 'UTC';

  // Format options: 07 Oct 2026, 12:05 PM
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);

  return `${formatted} ${tzSuffix}`;
}

export function formatTimeOnly(timestamp, timezone = 'IST') {
  if (!timestamp) return 'N/A';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return 'N/A';

  const tz = timezone === 'IST' ? 'Asia/Kolkata' : 'UTC';
  const tzSuffix = timezone === 'IST' ? 'IST' : 'UTC';

  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);

  return `${formatted} ${tzSuffix}`;
}

