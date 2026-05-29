import type { JourneyResult } from '../../travel/navitia'
import { DisplaySection } from './DisplaySection'
import { ItineraryMap } from './ItineraryMap'

function rawTimeToIso(date: string | null): string {
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

function formatClock(dateStr: string | null): string {
  if (!dateStr) return '--:--'
  const date = new Date(rawTimeToIso(dateStr))
  return (
    date.getHours().toLocaleString(undefined, { minimumIntegerDigits: 2, useGrouping: false }) +
    ':' +
    date.getMinutes().toLocaleString(undefined, { minimumIntegerDigits: 2, useGrouping: false })
  )
}

function parseCo2(co2: string | null): number {
  if (!co2) return 0
  const match = co2.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : 0
}

export function ItineraireDetail({ journey }: { journey: JourneyResult }) {
  const depart = formatClock(journey.departure)
  const arrive = formatClock(journey.arrival)
  const co2Value = parseCo2(journey.co2)

  return (
    <div className="mt-4 flex w-full flex-col">
      <p className="m-2 text-2xl font-medium">Détail de l&apos;itinéraire</p>
      <ItineraryMap journey={journey} />
      <div className="mx-2 mt-4 rounded-2xl bg-white">
        <div className="mx-2 w-full flex-col">
          <div className="m-4 flex min-h-80 flex-col space-y-4">
            <div className="flex flex-col">
              <div className="flex flex-row space-x-2">
                <p className="font-medium">{depart}</p>
                <p>{journey.sections[0]?.from ?? ''}</p>
              </div>
              <div className="flex flex-row space-x-2">
                <p className="font-medium">{arrive}</p>
                <p>{journey.sections[journey.sections.length - 1]?.to ?? ''}</p>
              </div>
            </div>
            <div className="flex flex-row justify-between space-x-2">
              <div className="inline-flex flex-row space-x-1">
                <p>Durée</p>
                <p className="font-medium">{Math.round(journey.durationSeconds / 60)}</p>
                <p className="font-medium">min</p>
              </div>
              <p>
                {journey.transfers.toString() + ' correspondance' + (journey.transfers > 1 ? 's' : '')}
              </p>
            </div>
            <span className="my-2 h-px bg-slate-100" />
            <div className="flex flex-col overflow-auto">
              {journey.sections.map((section) => (
                <DisplaySection key={section.id} section={section} />
              ))}
              <div className="flex gap-3">
                <div className="flex w-14 shrink-0 flex-col items-end">
                  {arrive && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold leading-none text-slate-600">
                      {arrive}
                    </span>
                  )}
                </div>
                <div className="relative w-4 shrink-0">
                  <span className="absolute left-1/2 top-0.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight text-[#0C131F]">
                    {journey.sections[journey.sections.length - 1]?.to ?? ''}
                  </p>
                </div>
              </div>
            </div>
            {co2Value > 0 && (
              <div className="flex flex-row items-center rounded-xl border-2 border-[#3E853E] p-1">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-10 w-9">
                  <path d="M21.7124 6.05934C21.4673 5.9441 15.6577 3.26934 10.9693 5.39772C3.54986 8.77015 4.28327 15.1496 4.30939 15.3533C3.43272 16.3828 2.67447 17.5075 2.0489 18.7063C1.99175 18.8258 1.98439 18.963 2.02843 19.0879C2.07247 19.2128 2.16431 19.3151 2.28376 19.3723C2.35094 19.4052 2.42477 19.4222 2.49958 19.4221C2.59382 19.4222 2.68618 19.3957 2.76601 19.3456C2.84583 19.2955 2.90987 19.2238 2.95075 19.1389C3.4745 18.16 4.09249 17.2345 4.79596 16.3755C4.82506 16.4453 4.86991 16.5074 4.927 16.557C4.98409 16.6066 5.05188 16.6423 5.12506 16.6613C6.84256 17.1078 8.6079 17.3443 10.3824 17.3654C12.8909 17.4494 15.3584 16.7135 17.4111 15.2693C21.6328 12.157 21.9863 6.76832 21.999 6.54027C22.0047 6.44065 21.9805 6.3416 21.9294 6.25588C21.8783 6.17017 21.8027 6.10171 21.7124 6.05934ZM16.8179 14.4641C14.0781 16.4846 10.2246 16.8987 5.36624 15.6906C8.1003 12.51 11.7425 10.2424 15.8032 9.19265C15.9317 9.15975 16.0418 9.07717 16.1094 8.96308C16.177 8.84898 16.1965 8.71271 16.1636 8.58425C16.1307 8.45578 16.0481 8.34565 15.934 8.27807C15.8199 8.21049 15.6837 8.191 15.5552 8.2239C11.6275 9.22093 8.06378 11.3128 5.27863 14.2562C5.36615 12.4756 6.19403 8.66687 11.3833 6.30787C15.0562 4.63893 19.7129 6.3152 20.9658 6.82687C20.8169 8.02222 20.084 12.0564 16.8179 14.4641Z"></path>
                </svg>
                <p>{`CO2 émis pour cet itinéraire : ${(co2Value / 1000).toFixed(2)} kg`}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
