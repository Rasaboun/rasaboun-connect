import type { JourneyResult } from '../../travel/navitia'
import { formatClock } from '../../time/format'
import { ItineraireRow } from './ItineraireRow'

export function ItineraireItem({
  journey,
  selected,
  onSelect,
  recommended = false,
}: {
  journey: JourneyResult
  selected: boolean
  onSelect: () => void
  recommended?: boolean
}) {
  const depart = formatClock(journey.departure) || '--:--'
  const arrive = formatClock(journey.arrival) || '--:--'

  const transportRow = journey.sections.map((elem, id) => (
    <ItineraireRow key={elem.id} elem={elem} id={id} sections={journey.sections} />
  ))

  return (
    <button
      onClick={onSelect}
      data-selected={selected}
      className={
        recommended
          ? 'flex w-full flex-row items-center divide-x-2 divide-[#F3F3F8] rounded-xl bg-white p-2 transition hover:bg-[#F4F6FF]'
          : 'mt-4 flex w-full flex-row items-center divide-x-2 divide-[#F3F3F8] rounded-xl bg-white p-2 ring-2 ring-[#377893]/0 transition delay-150 ease-linear hover:bg-[#E5E5EE] data-[selected=true]:outline-none data-[selected=true]:ring-2 data-[selected=true]:ring-[#377893]/100'
      }
      type="button"
    >
      <div className="flex flex-col justify-center p-3 font-medium">
        <p>{depart}</p>
        <p>{arrive}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-start p-2">
        <div className="flex flex-row flex-wrap items-center justify-start gap-y-1">{transportRow}</div>
        <div className="flex flex-row items-center space-x-0.5">
          <span className="flex h-6 w-6 items-center justify-center"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4">
            <path d="M12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C21.997 9.34877 20.9424 6.80699 19.0677 4.93228C17.193 3.05758 14.6512 2.00303 12 2ZM12 21C10.22 21 8.47991 20.4722 6.99987 19.4832C5.51983 18.4943 4.36628 17.0887 3.68509 15.4442C3.0039 13.7996 2.82567 11.99 3.17294 10.2442C3.5202 8.49836 4.37737 6.89471 5.63604 5.63604C6.89472 4.37737 8.49836 3.5202 10.2442 3.17293C11.99 2.82567 13.7996 3.0039 15.4442 3.68508C17.0887 4.36627 18.4943 5.51983 19.4832 6.99987C20.4722 8.47991 21 10.22 21 12C20.9973 14.3861 20.0482 16.6737 18.361 18.361C16.6737 20.0482 14.3861 20.9973 12 21ZM17.3755 7.55273C17.4219 7.59915 17.4588 7.65425 17.4839 7.71491C17.509 7.77556 17.522 7.84058 17.522 7.90623C17.522 7.97188 17.509 8.0369 17.4839 8.09755C17.4588 8.15821 17.4219 8.21331 17.3755 8.25973L12.3213 13.3134C12.2749 13.3599 12.2198 13.3967 12.1591 13.4218C12.0985 13.447 12.0334 13.4599 11.9678 13.4599C11.9021 13.4599 11.8371 13.447 11.7765 13.4218C11.7158 13.3967 11.6607 13.3599 11.6143 13.3134L7.87207 9.57129C7.77988 9.47721 7.72854 9.35055 7.7292 9.21884C7.72987 9.08712 7.78249 8.96098 7.87563 8.86784C7.96877 8.7747 8.0949 8.72208 8.22662 8.72142C8.35834 8.72075 8.485 8.7721 8.57907 8.86429L11.9677 12.253L16.6684 7.55276C16.7148 7.50631 16.77 7.46947 16.8306 7.44433C16.8913 7.41919 16.9563 7.40625 17.022 7.40625C17.0876 7.40624 17.1526 7.41918 17.2133 7.44431C17.274 7.46945 17.3291 7.50629 17.3755 7.55273Z"></path>
          </svg></span>
          <p>{Math.round(journey.durationSeconds / 60) + 'min'}</p>
        </div>
      </div>
    </button>
  )
}
