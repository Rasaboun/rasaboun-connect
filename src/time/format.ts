// Navitia datetimes look like "YYYYMMDDTHHMMSS". Helpers to read them.

export function rawTimeToIso(date: string | null): string {
  if (!date) return ''
  return (
    date.slice(0, 4) +
    '-' +
    date.slice(4, 6) +
    '-' +
    date.slice(6, 8) +
    'T' +
    date.slice(9, 11) +
    ':' +
    date.slice(11, 13) +
    ':' +
    date.slice(13, 15)
  )
}

// "HH:MM", or '' when the input is missing/malformed. Returning '' (not a
// placeholder) lets callers decide: section rows hide the badge on empty, while
// journey-level times fall back to '--:--'. The length/NaN guards stop a partial
// string from slicing into an invalid ISO that renders as "NaN:NaN".
export function formatClock(dateStr: string | null): string {
  if (!dateStr || dateStr.length < 15) return ''
  const date = new Date(rawTimeToIso(dateStr))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toLocaleString(undefined, { minimumIntegerDigits: 2, useGrouping: false })
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
