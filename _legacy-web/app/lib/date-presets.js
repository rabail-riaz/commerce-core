export const DATE_PRESETS = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'this_year', label: 'This Year' },
  { key: 'today', label: 'Today' },
  { key: 'custom', label: 'Custom Date Range' },
];

export const DEFAULT_DATE_PRESET = 'this_week';

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  return result;
}

export function dateRangeForPreset(key) {
  const today = new Date();
  const todayIso = toISODate(today);
  switch (key) {
    case 'today':
      return { dateFrom: todayIso, dateTo: todayIso };
    case 'this_week':
      return { dateFrom: toISODate(startOfWeek(today)), dateTo: todayIso };
    case 'this_month':
      return { dateFrom: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: todayIso };
    case 'last_3_months':
      return { dateFrom: toISODate(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())), dateTo: todayIso };
    case 'last_6_months':
      return { dateFrom: toISODate(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())), dateTo: todayIso };
    case 'this_year':
      return { dateFrom: toISODate(new Date(today.getFullYear(), 0, 1)), dateTo: todayIso };
    default:
      return null;
  }
}

// Equal-length period immediately preceding the given range, for computing deltas.
export function previousPeriod(dateFrom, dateTo) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { dateFrom: toISODate(prevFrom), dateTo: toISODate(prevTo) };
}
