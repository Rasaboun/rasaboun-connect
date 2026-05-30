import { useEffect, useRef, useState } from 'react'
import { Calendar, Label, TimeField, type TimeValue } from '@heroui/react'
import { I18nProvider } from 'react-aria-components'
import { CalendarDate, Time, getLocalTimeZone, today, type DateValue } from '@internationalized/date'

// Navitia datetime -> French "Jeu. 04 juin, 14:00" for the time pill (or
// "Maintenant" when unset), like SNCF-Connect.
function navToFrLabel(nav: string | null): string {
  if (!nav || nav.length < 13) return 'Maintenant'
  const hm = `${nav.slice(9, 11)}:${nav.slice(11, 13)}`
  const date = new Date(`${nav.slice(0, 4)}-${nav.slice(4, 6)}-${nav.slice(6, 8)}T${hm}:00`)
  if (Number.isNaN(date.getTime())) return hm
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'long' }).format(date)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${hm}`
}

// Compact departure/arrival time pill that opens a popover with a Partir/Arriver
// toggle + a HeroUI Calendar + TimeField (inline, so the popover's outside-click
// isn't tripped by a portal). Keeps the band tidy.
export function TimeMenu({
  timeMode,
  datetime,
  onApply,
}: {
  timeMode: 'depart_at' | 'arrive_by'
  datetime: string | null
  onApply: (mode: 'depart_at' | 'arrive_by', local: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const now = new Date()
  // datetime is the Navitia string YYYYMMDDTHHMMSS (15 chars). A truthy but
  // malformed/too-short value would slice into '' → Number('')=0 → month=0/day=0
  // calendar bugs, so treat it like null and fall back to today + current time.
  const hasValidDatetime = Boolean(datetime) && (datetime as string).length >= 15
  const dateVal: DateValue = hasValidDatetime
    ? new CalendarDate(Number(datetime!.slice(0, 4)), Number(datetime!.slice(4, 6)), Number(datetime!.slice(6, 8)))
    : today(getLocalTimeZone())
  const timeVal: TimeValue = hasValidDatetime
    ? new Time(Number(datetime!.slice(9, 11)), Number(datetime!.slice(11, 13)))
    : new Time(now.getHours(), now.getMinutes())
  const pad = (n: number) => String(n).padStart(2, '0')
  const emit = (d: DateValue, t: TimeValue, mode: 'depart_at' | 'arrive_by' = timeMode) =>
    onApply(mode, `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(t.hour)}:${pad(t.minute)}`)

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="flex w-full items-center gap-2 rounded-xl bg-[#242b35] px-4 py-2.5 text-left transition hover:bg-[#8DE8FE]/10 lg:w-auto"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="shrink-0 text-sm text-slate-400">{timeMode === 'arrive_by' ? 'Arrivée' : 'Départ'} :</span>
        <span className="whitespace-nowrap text-[15px] font-semibold text-white">{navToFrLabel(datetime)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-auto h-4 w-4 fill-slate-400 lg:ml-1">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open ? (
        <I18nProvider locale="fr-FR">
        <div className="absolute right-0 z-40 mt-2 w-[300px] rounded-2xl border border-[#D8DEFA] bg-white p-3 text-[#171D2D] shadow-2xl">
          <div className="mb-3 flex rounded-lg bg-[#F1F4F8] p-1">
            {([['depart_at', 'Partir à'], ['arrive_by', 'Arriver à']] as const).map(([mode, text]) => (
              <button
                className={`flex-1 rounded-md py-1.5 text-sm font-bold transition ${timeMode === mode ? 'bg-white text-[#0C131F] shadow-sm' : 'text-slate-500'}`}
                key={mode}
                onClick={() => emit(dateVal, timeVal, mode)}
                type="button"
              >
                {text}
              </button>
            ))}
          </div>

          <Calendar aria-label="Date" value={dateVal} onChange={(d) => d && emit(d, timeVal)}>
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Label className="text-sm text-slate-500">Heure</Label>
            <TimeField
              aria-label="Heure"
              hourCycle={24}
              value={timeVal}
              onChange={(t) => t && emit(dateVal, t as TimeValue)}
            >
              <TimeField.Group variant="secondary">
                <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
              </TimeField.Group>
            </TimeField>
          </div>

          <button
            className="mt-3 text-sm font-bold text-[#127996] hover:underline"
            onClick={() => onApply('depart_at', '')}
            type="button"
          >
            Partir maintenant
          </button>
        </div>
        </I18nProvider>
      ) : null}
    </div>
  )
}
