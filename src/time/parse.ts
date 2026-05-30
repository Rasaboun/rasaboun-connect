import * as chrono from 'chrono-node'

export type Locale = 'fr' | 'en'

export type ParsedTime = {
  iso: string
  human: string
  date: Date
  certain: boolean
}

export function parseHumanTime(
  human: string,
  locale: Locale,
  refDate: Date = new Date(),
): ParsedTime | null {
  const parser = locale === 'fr' && chrono.fr ? chrono.fr : chrono
  const results = parser.parse(human, refDate, { forwardDate: true })
  if (results.length === 0) return null
  const r = results[0]
  const date = r.start.date()
  if (!date) return null
  const c = r.start
  const certain =
    c.isCertain('year') &&
    c.isCertain('month') &&
    c.isCertain('day') &&
    c.isCertain('hour')
  return { iso: date.toISOString(), human, date, certain }
}

const ISO_LOCAL_FMT = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatLocal(d: Date): string {
  // 'sv-SE' yields "YYYY-MM-DD HH:mm" in local TZ. Easier to read than .toISOString().
  return ISO_LOCAL_FMT.format(d).replace(' ', 'T')
}
