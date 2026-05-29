import { m } from 'framer-motion'
import type { DepartureTime, LineArrivals, NavitiaPlace } from '../../travel/navitia'

// Same fade-up stagger as ItineraireList, so the arrivals board feels of a piece
// with the journeys results.
const EASE = [0.22, 1, 0.36, 1] as const
const container = { animate: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } }
const item = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
}

// Navitia times are local "YYYYMMDDTHHMMSS" (no timezone) — parse as local time.
function parseNavitia(value: string | null): Date | null {
  if (!value) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
}

function waitLabel(value: string | null): string {
  const date = parseNavitia(value)
  if (!date) return '—'
  const minutes = Math.round((date.getTime() - Date.now()) / 60000)
  if (minutes <= 0) return 'à quai'
  return `${minutes} min`
}

function DirectionRow({ direction, times }: { direction: string; times: DepartureTime[] }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex min-w-0 items-center gap-1.5 text-[15px] text-[#0C131F]">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0 text-[#647187]">
          <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate">{direction}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {times.map((time, index) => (
          <span className="flex items-center gap-1 text-sm font-black text-[#0C131F]" key={index}>
            {time.realtime ? (
              <span aria-label="temps réel" className="inline-block h-1.5 w-1.5 rounded-full bg-[#28B463]" />
            ) : null}
            {waitLabel(time.departure)}
          </span>
        ))}
      </span>
    </div>
  )
}

export function ArrivalsBoard({
  station,
  arrivals,
}: {
  station: NavitiaPlace | null
  arrivals: LineArrivals[]
}) {
  if (arrivals.length === 0) return null

  return (
    <m.div
      className="mx-auto w-full max-w-[760px] px-4 py-6 lg:px-0"
      initial="initial"
      animate="animate"
      variants={container}
    >
      <m.div className="mb-4" variants={item}>
        <p className="text-[15px] font-black uppercase tracking-[0.16em] text-[#127996]">
          Prochains départs
        </p>
        <h2 className="mt-1 text-2xl font-black text-[#0C131F]">{station?.name ?? 'Station'}</h2>
      </m.div>

      <m.ul
        className="divide-y divide-[#E5E8F0] overflow-hidden rounded-2xl bg-white shadow-[0_4px_14px_rgba(12,19,31,0.06)]"
        variants={item}
      >
        {arrivals.map((line) => (
          <li className="px-4 py-3.5" key={`${line.mode}-${line.lineCode}`}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-sm font-black"
                style={{ backgroundColor: line.color ?? '#647187', color: line.textColor ?? '#FFFFFF' }}
              >
                {line.lineCode}
              </span>
              <span className="text-sm font-bold text-[#0C131F]">{line.mode}</span>
              {line.network ? <span className="truncate text-xs text-[#5E6878]">{line.network}</span> : null}
            </div>
            <div className="mt-1.5 pl-0.5">
              {line.directions.map((dir) => (
                <DirectionRow direction={dir.direction} key={dir.direction} times={dir.times} />
              ))}
            </div>
          </li>
        ))}
      </m.ul>
    </m.div>
  )
}
