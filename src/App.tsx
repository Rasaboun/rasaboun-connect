import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Calendar, Label, TimeField, type TimeValue } from '@heroui/react'
import { I18nProvider } from 'react-aria-components'
import { CalendarDate, Time, getLocalTimeZone, today, type DateValue } from '@internationalized/date'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'framer-motion'
import { DEFAULT_TOOLS, MODEL_FILES } from './constants'
import { fetchCached, type Progress } from './inference/cache'
import { createSessions, type NeedleSessions } from './inference/session'
import { generate } from './inference/generate'
import { NeedleTokenizer, type Specials } from './inference/tokenizer'
import { SNCF_MENUS } from './sncf-data'
import { parseHumanTime } from './time/parse'
import { fetchJourneys, fetchNextArrivals, formatNavitiaDateTime, resolvePlace, searchPlaces, type JourneyResult, type LineArrivals, type NavitiaPlace } from './travel/navitia'
import { parseNeedleToolCall, type NeedleIntent } from './travel/toolCall'
import { ItineraireList } from './components/itineraire/ItineraireList'
import { ItineraireDetail } from './components/itineraire/ItineraireDetail'
import { ArrivalsBoard } from './components/itineraire/ArrivalsBoard'
import { DEMO_DESTINATION, DEMO_JOURNEYS, DEMO_ORIGIN, demoSearchPlaces } from './demo-data'
import { PlaceAutocomplete } from './components/PlaceAutocomplete'
import { ModeIcon } from './components/ModeIcon'
import { NeedleInfoPopover } from './components/NeedleInfoPopover'
import { LimitNudge } from './components/LimitNudge'
import { detectLimit } from './needle-limits'
import { TRANSPORT_MODES, excludedModesFromIntent } from './travel/modeFilter'

const demoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

// One easing curve + a couple of reusable variants so every transition feels
// part of the same minimalist system: a short fade with a small rise, no spring
// bounce. MotionConfig (below) disables all of it when the user prefers reduced
// motion, so we don't gate these individually.
const EASE = [0.22, 1, 0.36, 1] as const
const screenTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.32, ease: EASE },
}
const detailTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: EASE },
}

// Cycled inside the search bar as a live placeholder — sells the natural-language
// premise without a decorative icon.
const NL_PLACEHOLDERS = [
  'Aller de Châtelet à Nation maintenant',
  'Montparnasse → République demain à 8h',
  'Prochain métro à Saint-Lazare',
  'Gare du Nord à Bastille sans correspondance',
]
// One-tap example queries — short but varied: time, arrive-by, mode, slang, English.
const NL_CHIPS = [
  'Bastille → La Défense demain 8h',
  'Bastille avant 18h depuis Châtelet',
  'Opéra depuis Nation en bus',
  'stp cmt aller à Montparnasse',
]

type Filters = {
  noTransfer: boolean
  stepFree: boolean
  excludedModes: string[]
  excludedLines: string[]
}


type NeedleModel = {
  sessions: NeedleSessions
  tokenizer: NeedleTokenizer
}

type MetricState = {
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

// Live itinerary data flows through the navitia-proxy Worker; the secret apiKey
// lives there, not in this bundle. Presence of the proxy URL enables live mode.
const navitiaEnabled = Boolean(import.meta.env.VITE_NAVITIA_PROXY_URL)
const defaultQuery = 'Comment aller de Chatelet a Nation maintenant ?'

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

function progressWidthClass(percent: number) {
  if (percent >= 100) return 'w-full'
  if (percent >= 75) return 'w-3/4'
  if (percent >= 50) return 'w-1/2'
  if (percent >= 25) return 'w-1/4'
  if (percent > 0) return 'w-1/12'
  return 'w-0'
}

// Ask the browser for the user's position; resolves to a Navitia place whose id
// is "lon;lat" (Navitia accepts coordinates as from/to). Resolves null if
// geolocation is unavailable or the user denies the prompt.
function requestCurrentLocation(): Promise<NavitiaPlace | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ id: `${pos.coords.longitude};${pos.coords.latitude}`, name: 'Ma position' }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

function useNeedleModel() {
  const [model, setModel] = useState<NeedleModel | null>(null)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const track = (p: Progress) => setProgress((current) => ({ ...current, [p.name]: p }))
        const [encoderBytes, decoderBytes, tokenizerBytes, specialsBytes, configBytes] = await Promise.all([
          fetchCached(MODEL_FILES.encoder.name, MODEL_FILES.encoder.url, track),
          fetchCached(MODEL_FILES.decoder.name, MODEL_FILES.decoder.url, track),
          fetchCached(MODEL_FILES.tokenizer.name, MODEL_FILES.tokenizer.url, track),
          fetchCached(MODEL_FILES.specials.name, MODEL_FILES.specials.url, track),
          fetchCached(MODEL_FILES.config.name, MODEL_FILES.config.url, track),
        ])
        if (cancelled) return

        const config = JSON.parse(new TextDecoder().decode(configBytes)) as NeedleSessions['cfg']
        const specials = JSON.parse(new TextDecoder().decode(specialsBytes)) as Specials
        const tokenizer = new NeedleTokenizer()
        await tokenizer.load(tokenizerBytes, specials)
        const sessions = await createSessions(encoderBytes, decoderBytes, config, ['wasm'])
        if (!cancelled) setModel({ sessions, tokenizer })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load Needle model.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { model, progress, error, loading }
}

function Header() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menu = SNCF_MENUS.find((item) => item.id === openMenu)

  // Logo needle: each hover bumps the spin count, so the rotate target grows by
  // 360 every time. framer tweens to it = one forward turn, never reversing on leave.
  const [spins, setSpins] = useState(0)
  const reduceMotion = useReducedMotion()
  const spinNeedle = () => {
    if (!reduceMotion) setSpins((n) => n + 1)
  }

  return (
    <header className="relative z-30 bg-[#0C1324] text-white" onMouseLeave={() => setOpenMenu(null)}>
      <div className="mx-auto flex h-[54px] max-w-[1280px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center">
          <svg width="212" height="21" viewBox="0 0 212 21" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto cursor-pointer" onMouseEnter={spinNeedle} onClick={() => window.location.reload()} role="button" aria-label="Rasaboun-connect, accueil">
            {/* sncf-connect toggle mark, knob holds a compass needle */}
            <path d="M55.593 0H32.276C26.594 0 22 4.62 22 10.3C21.999 11.6498 22.264 12.9865 22.7801 14.2337C23.2961 15.4809 24.053 16.6142 25.0074 17.5686C25.9619 18.523 27.0951 19.2799 28.3423 19.7959C29.5895 20.312 30.9262 20.5771 32.276 20.576H55.593C56.9428 20.5772 58.2795 20.3122 59.5268 19.7963C60.774 19.2804 61.9074 18.5236 62.8619 17.5693C63.8164 16.615 64.5734 15.4818 65.0896 14.2346C65.6057 12.9875 65.8709 11.6508 65.87 10.301C65.87 4.619 61.275 0.0010004 55.594 0.0010004L55.593 0Z" fill="#8DE8FE"/>
            <circle cx="55.6" cy="10.3" r="9" fill="#0C1324" />
            <m.path
              d="M55.6 4.6 L57.4 10.3 L55.6 16 L53.8 10.3 Z"
              fill="#8DE8FE"
              animate={{ rotate: 45 + spins * 360 }}
              transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            {/* Rasaboun-connect text */}
            <text x="72" y="15" fontFamily="AH, ui-sans-serif, system-ui, sans-serif" fontSize="16" fontWeight="700" letterSpacing="-0.02em">
              <tspan fill="#8DE8FE">Rasaboun</tspan><tspan fill="white">-connect</tspan>
            </text>
          </svg>
        </div>
        <nav className="hidden h-full flex-1 items-center justify-center gap-14 text-[15px] font-bold text-white/82 lg:flex">
            {SNCF_MENUS.map((item) => (
              <button
                className="relative flex h-full items-center gap-2 border-b-2 border-transparent px-1 transition hover:border-[#8DE8FE] hover:text-[#8DE8FE]"
                key={item.id}
                onMouseEnter={() => setOpenMenu(item.id)}
                type="button"
              >
                {item.id === 'voyager' ? (
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
                    <path d="M44.3334 35C42.6823 35.0044 41.0861 35.5922 39.8263 36.6597C38.5668 37.7272 37.7251 39.2054 37.45 40.8333H17.85C15.9635 40.9026 14.1005 40.3982 12.5066 39.3867C11.8852 38.9557 11.3779 38.3798 11.0283 37.7092C10.6787 37.0386 10.4974 36.2929 10.5 35.5367C10.4336 34.6194 10.585 33.6996 10.9419 32.8522C11.2987 32.0047 11.8509 31.2536 12.5533 30.66C14.1079 29.5962 15.9686 29.0717 17.85 29.1667H37.3334C39.3202 29.1146 41.2363 28.4186 42.7934 27.1833C43.7199 26.3382 44.4444 25.2954 44.913 24.132C45.3815 22.9687 45.5822 21.7148 45.5 20.4634C45.5264 19.3629 45.2931 18.2718 44.8187 17.2785C44.3443 16.2852 43.6425 15.4178 42.77 14.7467C40.9498 13.4443 38.7539 12.7725 36.5167 12.8334H18.6666C18.3741 11.1027 17.4421 9.54514 16.0553 8.46926C14.6685 7.39341 12.9282 6.87776 11.1791 7.02453C9.43012 7.17132 7.80005 7.96981 6.61197 9.26175C5.4239 10.5537 4.76453 12.2448 4.76453 14C4.76453 15.7552 5.4239 17.4463 6.61197 18.7383C7.80005 20.0302 9.43012 20.8287 11.1791 20.9755C12.9282 21.1223 14.6685 20.6067 16.0553 19.5308C17.4421 18.4549 18.3741 16.8973 18.6666 15.1667H36.6334C38.3491 15.0953 40.0398 15.596 41.44 16.59C42.0346 17.0412 42.5122 17.6284 42.833 18.3023C43.1539 18.9763 43.3081 19.7174 43.2834 20.4634C43.3571 21.3697 43.2257 22.281 42.8984 23.1294C42.5712 23.9778 42.0567 24.7415 41.3934 25.3633C40.0603 26.3895 38.4069 26.9103 36.7267 26.8333H18.06C15.6506 26.7255 13.2751 27.4325 11.3166 28.84C10.2957 29.6242 9.47707 30.6413 8.92911 31.8061C8.38115 32.9712 8.11972 34.2501 8.16662 35.5367C8.14968 36.666 8.41374 37.7818 8.93508 38.7837C9.45644 39.7859 10.2187 40.6425 11.1533 41.2767C13.1375 42.5815 15.4763 43.2416 17.85 43.1667H37.45C37.6726 44.4834 38.2672 45.7091 39.1634 46.6989C40.0599 47.6887 41.2207 48.4015 42.5089 48.7529C43.7972 49.1045 45.1591 49.0803 46.4341 48.6831C47.709 48.286 48.8439 47.5323 49.7045 46.5113C50.565 45.4902 51.1157 44.2442 51.2914 42.9205C51.4668 41.5968 51.2601 40.2502 50.6954 39.0402C50.1308 37.8301 49.2317 36.8067 48.1045 36.0908C46.9773 35.375 45.6687 34.9965 44.3334 35ZM44.3334 46.6667C43.4103 46.6667 42.508 46.393 41.7406 45.8801C40.9731 45.3675 40.3751 44.6385 40.0218 43.7859C39.6686 42.9331 39.5762 41.9949 39.7563 41.0895C39.9364 40.1844 40.3809 39.3528 41.0336 38.7002C41.6862 38.0476 42.5176 37.6031 43.4229 37.4229C44.3282 37.243 45.2665 37.3354 46.1191 37.6885C46.9719 38.0417 47.7006 38.64 48.2135 39.4074C48.7263 40.1749 49 41.0769 49 42C49 43.2376 48.5084 44.4246 47.6332 45.2998C46.7579 46.175 45.571 46.6667 44.3334 46.6667Z" fill="#8DE8FE" />
                  </svg>
                ) : item.id === 'billets' ? (
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
                    <path d="M42 14H37.3334V18.6667H42V14Z" fill="#8DE8FE" />
                    <path d="M30.3334 7V25.6667H49V7H30.3334ZM46.6667 23.3333H32.6667V9.33333H46.6667V23.3333Z" fill="#8DE8FE" />
                    <path d="M18.6667 37.3333H14V42H18.6667V37.3333Z" fill="#8DE8FE" />
                    <path d="M7 49H25.6667V30.3333H7V49ZM9.33333 32.6666H23.3333V46.6666H9.33333V32.6666Z" fill="#8DE8FE" />
                    <path d="M42 37.3333H37.3334V42H42V37.3333Z" fill="#8DE8FE" />
                    <path d="M11.6667 21H7V25.6667H11.6667V21Z" fill="#8DE8FE" />
                    <path d="M25.6667 7H21V11.6667H25.6667V7Z" fill="#8DE8FE" />
                    <path d="M18.6667 14H14V18.6667H18.6667V14Z" fill="#8DE8FE" />
                    <path d="M11.6667 7H7V11.6667H11.6667V7Z" fill="#8DE8FE" />
                    <path d="M25.6667 21H21V25.6667H25.6667V21Z" fill="#8DE8FE" />
                    <path d="M35 30.3333H30.3334V35H35V30.3333Z" fill="#8DE8FE" />
                    <path d="M49 30.3333H44.3334V35H49V30.3333Z" fill="#8DE8FE" />
                    <path d="M35 44.3333H30.3334V49H35V44.3333Z" fill="#8DE8FE" />
                  </svg>
                ) : item.id === 'offres' ? (
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
                    <path d="M21 14.7934H12.7633C12.2682 14.8405 11.8094 15.074 11.48 15.4467C11.138 15.7957 10.9464 16.2648 10.9464 16.7534C10.9464 17.242 11.138 17.7111 11.48 18.0601C11.8232 18.4067 12.2776 18.6215 12.7633 18.6667H21C21.4974 18.6047 21.9586 18.3741 22.3067 18.0134C22.638 17.659 22.8223 17.1919 22.8223 16.7067C22.8223 16.2216 22.638 15.7545 22.3067 15.4001C21.9575 15.0484 21.494 14.8332 21 14.7934Z" fill="#8DE8FE" />
                    <path d="M21 22.61H12.7633C12.2578 22.6751 11.7974 22.9346 11.48 23.3333C11.138 23.6824 10.9464 24.1514 10.9464 24.64C10.9464 25.1286 11.138 25.5978 11.48 25.9466C11.8094 26.3195 12.2682 26.5531 12.7633 26.6H21C21.5003 26.5477 21.9646 26.3155 22.3067 25.9466C22.6256 25.5805 22.7934 25.1069 22.7761 24.6215C22.7588 24.1364 22.5576 23.6758 22.2133 23.3333C21.9058 22.9579 21.4765 22.702 21 22.61Z" fill="#8DE8FE" />
                    <path d="M12.7633 30.3334C12.3627 30.3315 11.9714 30.4538 11.6433 30.6834C11.3056 30.8873 11.0372 31.1881 10.8733 31.5467C10.7183 31.907 10.6778 32.306 10.7571 32.6898C10.8364 33.0739 11.0317 33.4241 11.3166 33.6934C11.618 33.9904 12.002 34.1892 12.4183 34.2641C12.8347 34.3392 13.264 34.2865 13.6499 34.1134C14.0225 33.9752 14.3413 33.7218 14.5599 33.39C14.7889 33.0792 14.9116 32.7029 14.9099 32.3167C14.9117 32.054 14.8586 31.7938 14.7542 31.5528C14.6497 31.3117 14.4961 31.0952 14.3033 30.9167C14.1016 30.7174 13.8603 30.5625 13.5951 30.4619C13.3298 30.3614 13.0465 30.3177 12.7633 30.3334Z" fill="#8DE8FE" />
                    <path d="M20.9999 30.3333H18.8766C18.5995 30.2762 18.3137 30.2762 18.0366 30.3333C17.7673 30.4232 17.515 30.5571 17.2899 30.73C17.081 30.9188 16.914 31.1493 16.7999 31.4067C16.6808 31.6545 16.6171 31.9251 16.6133 32.2C16.6139 32.4753 16.6778 32.7467 16.7999 32.9933C16.914 33.2509 17.081 33.4815 17.2899 33.67C17.5032 33.8606 17.7594 33.9967 18.0366 34.0667C18.3137 34.1241 18.5995 34.1241 18.8766 34.0667H20.9999C21.5003 34.0144 21.9646 33.7822 22.3066 33.4133C22.638 33.0589 22.8223 32.592 22.8223 32.1067C22.8223 31.6216 22.638 31.1544 22.3066 30.8C21.933 30.5072 21.4745 30.3434 20.9999 30.3333Z" fill="#8DE8FE" />
                    <path d="M43.3534 30.3333H35.21C34.7126 30.3954 34.2515 30.6261 33.9034 30.9866C33.572 31.3411 33.3877 31.8082 33.3877 32.2933C33.3877 32.7786 33.572 33.2455 33.9034 33.6C34.2454 33.9689 34.7098 34.201 35.21 34.2533H43.3534C43.8485 34.2064 44.3072 33.9728 44.6367 33.6C44.9788 33.2511 45.1703 32.7819 45.1703 32.2933C45.1703 31.8047 44.9788 31.3357 44.6367 30.9866C44.3005 30.6229 43.8455 30.3912 43.3534 30.3333Z" fill="#8DE8FE" />
                    <path d="M35.21 18.6668C35.6144 18.669 36.011 18.5557 36.3533 18.3401C36.7061 18.1503 36.9906 17.8546 37.1665 17.4946C37.3422 17.1345 37.4008 16.7284 37.3333 16.3334C37.2472 15.9464 37.0482 15.5935 36.7617 15.3195C36.4751 15.0454 36.1139 14.8623 35.7233 14.7934C35.3351 14.6773 34.9216 14.6773 34.5333 14.7934C34.1607 14.9315 33.842 15.1849 33.6233 15.5168C33.393 15.8346 33.2778 16.2214 33.2967 16.6134C33.2964 16.8703 33.348 17.1246 33.4483 17.3611C33.5484 17.5976 33.6954 17.8115 33.88 17.9901C34.22 18.3782 34.6962 18.6206 35.21 18.6668Z" fill="#8DE8FE" />
                    <path d="M35.21 22.61C34.7098 22.6624 34.2454 22.8945 33.9034 23.2634C33.572 23.6177 33.3877 24.0849 33.3877 24.57C33.3877 25.0553 33.572 25.5222 33.9034 25.8766C34.2454 26.2455 34.7098 26.4777 35.21 26.53H37.3334C37.8336 26.4777 38.298 26.2455 38.64 25.8766C38.9714 25.5222 39.1557 25.0553 39.1557 24.57C39.1557 24.0849 38.9714 23.6177 38.64 23.2634C38.298 22.8945 37.8336 22.6624 37.3334 22.61H35.21Z" fill="#8DE8FE" />
                    <path d="M39.6667 18.2234C39.8741 18.4085 40.1107 18.5582 40.3667 18.6667C40.6437 18.7253 40.9297 18.7253 41.2067 18.6667H43.2367C43.7288 18.609 44.1838 18.3773 44.52 18.0134C44.8621 17.6645 45.0537 17.1954 45.0537 16.7067C45.0537 16.2181 44.8621 15.749 44.52 15.4001C44.1906 15.0273 43.7318 14.7938 43.2367 14.7467H41.2067C40.9297 14.6882 40.6437 14.6882 40.3667 14.7467C40.0895 14.8168 39.8333 14.9529 39.62 15.1434C39.411 15.3321 39.2441 15.5626 39.13 15.8201C39.0078 16.0667 38.9441 16.3382 38.9434 16.6134C38.9471 16.8883 39.0108 17.159 39.13 17.4067C39.239 17.719 39.4233 17.9996 39.6667 18.2234Z" fill="#8DE8FE" />
                    <path d="M43.2367 22.6101C42.8324 22.6079 42.4357 22.7212 42.0934 22.9367C41.749 23.1431 41.4795 23.4535 41.3234 23.8233C41.1568 24.1806 41.1157 24.5833 41.2067 24.9667C41.2802 25.3528 41.4767 25.7049 41.7667 25.97C42.0542 26.2514 42.4205 26.4385 42.8167 26.5067C43.205 26.6229 43.6185 26.6229 44.0067 26.5067C44.392 26.331 44.7109 26.0367 44.9167 25.6667C45.1263 25.3391 45.2394 24.959 45.2434 24.57C45.2462 24.3129 45.196 24.0576 45.0957 23.8208C44.9951 23.5839 44.847 23.3702 44.6601 23.1934C44.4729 23.0074 44.2508 22.86 44.0065 22.7599C43.7622 22.6598 43.5006 22.6089 43.2367 22.6101Z" fill="#8DE8FE" />
                    <path d="M49.9566 8.33008C49.0779 7.47081 47.8956 6.99289 46.6666 7.00008H36.4C34.6698 6.99782 32.9702 7.45692 31.4766 8.33008C30.0094 9.19577 28.8071 10.4465 28 11.9467C27.1929 10.4465 25.9905 9.19577 24.5233 8.33008C23.0296 7.45692 21.3301 6.99782 19.6 7.00008H9.3333C8.10428 6.99289 6.92203 7.47081 6.0433 8.33008C5.60787 8.74082 5.26112 9.2363 5.02435 9.78606C4.78761 10.3358 4.66586 10.9282 4.66663 11.5267V39.6667C4.66992 40.2647 4.79349 40.8557 5.03 41.405C5.26651 41.9543 5.61112 42.4501 6.0433 42.8633C6.94805 43.6676 8.12297 44.1009 9.3333 44.0767H17.78C19.7753 44.0909 21.7166 44.7272 23.3333 45.8967L24.85 46.9933L26.2266 48.3233C26.4527 48.5364 26.7131 48.71 26.9966 48.8367C27.5837 49.0548 28.2296 49.0548 28.8166 48.8367C29.1001 48.71 29.3605 48.5364 29.5866 48.3233L30.9633 46.9933L32.5033 45.8967C34.1457 44.7085 36.1228 44.0713 38.15 44.0767H46.6666C47.8977 44.0816 49.0835 43.614 49.98 42.77C50.8218 41.954 51.3079 40.8389 51.3333 39.6667V11.6667C51.3536 11.0447 51.2414 10.4256 51.0041 9.85027C50.7668 9.27499 50.4098 8.75678 49.9566 8.33008ZM26.6233 45.4067L24.78 44.0767C22.7491 42.584 20.3003 41.7678 17.78 41.7433H9.3333C8.71641 41.7531 8.12076 41.5184 7.67663 41.09C7.28253 40.716 7.0414 40.2087 6.99996 39.6667V11.6667C6.99649 11.3664 7.05475 11.0685 7.17114 10.7915C7.28755 10.5145 7.45961 10.2645 7.67663 10.0567C7.89078 9.83205 8.14761 9.65233 8.43207 9.52813C8.71655 9.40393 9.02294 9.33773 9.3333 9.33341H19.6C21.4592 9.31918 23.2506 10.0307 24.5933 11.3167C25.2471 11.9305 25.7686 12.6714 26.1256 13.4939C26.4828 14.3165 26.6681 15.2034 26.67 16.1001L26.6233 45.4067ZM49 39.6667C49.0002 39.9632 48.9405 40.2568 48.8243 40.5293C48.7078 40.8021 48.5375 41.0485 48.3233 41.2533C47.8793 41.6817 47.2836 41.9165 46.6666 41.9067H38.2666C35.7464 41.9312 33.2976 42.7474 31.2666 44.24L29.4 45.57V16.0301C29.4177 15.1531 29.6104 14.2885 29.967 13.487C30.3237 12.6856 30.8368 11.9636 31.4766 11.3634C32.7945 10.0772 34.5585 9.34984 36.4 9.33341H46.6666C47.2836 9.32361 47.8793 9.55853 48.3233 9.98675C48.5403 10.1945 48.7125 10.4445 48.8287 10.7215C48.9451 10.9985 49.0035 11.2964 49 11.5967V39.6667Z" fill="#8DE8FE" />
                  </svg>
                ) : (
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
                    <path d="M33.2517 23.5638C34.8407 22.5167 36.0799 21.0093 36.8067 19.2388C37.5338 17.4684 37.7146 15.5174 37.3259 13.6413C36.9778 11.7517 36.0713 10.0129 34.7261 8.65379C33.3809 7.29465 31.6601 6.37886 29.7899 6.02695C27.9326 5.64253 26.0036 5.83328 24.2555 6.57423C23.0147 7.08841 21.8945 7.85992 20.9674 8.83894C20.0402 9.81794 19.3267 10.9826 18.8729 12.2577C18.4192 13.5328 18.2353 14.8899 18.3332 16.2413C18.4311 17.5927 18.8085 18.9083 19.4412 20.103C20.0738 21.2978 20.9475 22.3451 22.0059 23.1773C23.0643 24.0095 24.2837 24.608 25.5853 24.9342C26.887 25.2604 28.2418 25.3068 29.5624 25.0709C30.8831 24.8348 32.1398 24.3215 33.2517 23.5638ZM31.9564 9.4534C33.1457 10.2578 34.0718 11.4006 34.6176 12.7371C35.2749 14.351 35.3367 16.1498 34.7917 17.8059C34.2466 19.4619 33.1308 20.865 31.6477 21.7597C30.1647 22.6544 28.413 22.9811 26.7116 22.6803C25.0101 22.3795 23.472 21.4713 22.3778 20.121C21.2835 18.7707 20.7055 17.0682 20.7493 15.3235C20.7931 13.5788 21.4556 11.9081 22.6162 10.6155C23.7769 9.32299 25.3582 8.49464 27.0728 8.28132C28.7871 8.06803 30.5203 8.48397 31.9564 9.4534Z" fill="#8DE8FE" />
                    <path d="M17.2609 35.2709C19.3689 33.1028 22.0691 31.619 25.0162 31.0098C27.9632 30.4003 31.0231 30.6931 33.8047 31.8505C36.5862 33.0078 38.9627 34.9771 40.6304 37.5067C42.2982 40.036 43.1812 43.0108 43.1665 46.05V48.9769C43.1604 49.2905 43.0344 49.5896 42.8151 49.8113C42.5955 50.0332 42.2994 50.1606 41.9891 50.1667C41.6785 50.1606 41.3826 50.0332 41.1631 49.8113C40.9435 49.5896 40.8175 49.2905 40.8114 48.9769V46.05C40.8114 42.6169 39.4616 39.3246 37.059 36.897C34.6566 34.4694 31.3978 33.1056 28 33.1056C24.6022 33.1056 21.3435 34.4694 18.9409 36.897C16.5383 39.3246 15.1885 42.6169 15.1885 46.05V48.9769C15.1825 49.2905 15.0565 49.5896 14.8369 49.8113C14.6174 50.0332 14.3214 50.1606 14.011 50.1667C13.8565 50.1685 13.7034 50.1377 13.5615 50.0761C13.4195 50.0148 13.2918 49.924 13.1867 49.8097C13.0736 49.7035 12.9837 49.5745 12.9229 49.431C12.862 49.2877 12.8316 49.1328 12.8335 48.9769V46.05C12.8366 42.0061 14.4292 38.129 17.2609 35.2709Z" fill="#8DE8FE" />
                  </svg>
                )}
                {item.label}
              </button>
            ))}
          </nav>
        <div className="flex shrink-0 justify-end">
          <button className="whitespace-nowrap rounded-full border border-[#8DE8FE] px-4 py-1.5 text-[13px] font-bold text-[#BCEEFF]" type="button">
            Se connecter
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menu ? (
          <m.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-1/2 top-full hidden w-[min(980px,calc(100vw-48px))] -translate-x-1/2 rounded-b-3xl bg-white p-8 text-[#0C131F] shadow-2xl lg:block"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: -8 }}
          >
            <div className="grid grid-cols-[220px_1fr] gap-8">
              <div className="rounded-3xl bg-[#F1F4F8] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#127996]">{menu.leadTitle}</p>
                <p className="mt-3 text-2xl font-black">{menu.leadCopy}</p>
              </div>
              <div className="grid grid-cols-3 gap-6">
                {menu.groups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-3 text-sm font-black">{group.title}</p>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <button className="block text-left text-sm text-slate-600 hover:text-[#127996]" key={item} type="button">
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}

type SearchPanelProps = {
  query: string
  setQuery: (value: string) => void
  running: boolean
  disabled: boolean
  onSubmit: () => void
  examples?: string[]
  onExample?: (value: string) => void
}

// Single natural-language search bar — the whole product premise. No structured
// Départ/Arrivée/Maintenant fields: the user just describes the trip in plain
// words and Needle (on-device model) extracts origin, destination and time.
// The placeholder cycles through real example phrasings (animated) so the bar
// teaches what it accepts instead of relying on a decorative icon.
function SearchPanel({ query, setQuery, running, disabled, onSubmit, examples, onExample }: SearchPanelProps) {
  const [phIdx, setPhIdx] = useState(0)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (query) return
    const timer = setInterval(() => setPhIdx((i) => (i + 1) % NL_PLACEHOLDERS.length), 3000)
    return () => clearInterval(timer)
  }, [query])

  const showHint = !query && !focused

  return (
    <section className="w-full">
      <div className="flex h-[52px] items-center gap-2 rounded-xl border border-[#D8DEFA] bg-white py-1.5 pl-4 pr-1.5 shadow-[0_2px_10px_rgba(21,35,70,0.08)] transition focus-within:border-[#8DE8FE] focus-within:ring-2 focus-within:ring-[#8DE8FE]/30">
        <div className="relative flex min-w-0 flex-1 items-center">
          <label className="sr-only" htmlFor="natural-query">Votre demande de trajet en langage naturel</label>
          <input
            className="peer w-full bg-transparent text-[15px] font-semibold text-[#171D2D] outline-none"
            id="natural-query"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
            value={query}
          />
          {showHint && (
            <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={phIdx}
                  className="truncate text-[15px] font-medium text-[#9AA1B2]"
                  initial={{ opacity: 0, y: '70%' }}
                  animate={{ opacity: 1, y: '0%' }}
                  exit={{ opacity: 0, y: '-70%' }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  {NL_PLACEHOLDERS[phIdx]}
                </m.span>
              </AnimatePresence>
            </span>
          )}
        </div>
        <button
          className="inline-flex h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-[#0C1324] px-5 text-[13px] font-black text-white transition hover:bg-[#1b2640] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || running}
          onClick={onSubmit}
          type="button"
        >
          {running ? 'Recherche...' : 'Rechercher'}
          {!running && (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <NeedleInfoPopover />
        {examples && examples.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[12px] font-medium text-white/35">Essayez :</span>
            {examples.map((example) => (
              <button
                className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium text-white/45 transition hover:bg-white/5 hover:text-white/80"
                key={example}
                onClick={() => onExample?.(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}


function LoaderCard({ error, loading, progress }: { error: string | null; loading: boolean; progress: Record<string, Progress> }) {
  if (!loading && !error) return null
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 md:px-8">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="font-black text-[#0C131F]">{error ? 'Modèle indisponible' : 'Chargement du modèle Needle'}</p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        {!error ? (
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {Object.values(MODEL_FILES).map((file) => {
              const item = progress[file.name]
              const pct = item?.total ? Math.round((item.loaded / item.total) * 100) : 0
              return (
                <div className="rounded-2xl bg-[#F1F4F8] p-3" key={file.name}>
                  <p className="truncate text-xs font-black text-slate-700">{file.name}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full bg-[#127996] transition-all ${progressWidthClass(pct)}`} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{pct}%</p>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DevToolBubble({ output, metrics, error }: { output: string; metrics: MetricState | null; error: string | null }) {
  const [open, setOpen] = useState(false)
  if (!output && !error) return null
  return (
    <>
      <button
        aria-label="Ouvrir les outils de développement"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0C131F] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed bottom-20 right-6 z-50 w-[28rem] max-w-[calc(100vw-3rem)]"
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
          >
            <div className="rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#127996]">Needle</p>
                  <h2 className="mt-1 text-2xl font-black text-[#0C131F]">Traduction en tool call</h2>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              {metrics ? (
                <p className="mt-3 inline-block rounded-full bg-[#F1F4F8] px-3 py-2 text-xs font-black text-slate-600">
                  {metrics.inputTokens} in · {metrics.outputTokens} out · {Math.round(metrics.latencyMs)} ms
                </p>
              ) : null}
              {error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
              {output ? (
                <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-[#0C131F] p-4 text-xs leading-6 text-[#8DE8FE]">
                  {output}
                </pre>
              ) : null}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

// A "Filtrer par" chip that opens a popover panel (modes / lines). Boolean
// chips below stay as plain toggles.
function FilterMenu({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-pressed={active}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
          active ? 'bg-[#8DE8FE] text-[#0C131F]' : 'bg-[#242b35] text-white hover:bg-[#8DE8FE]/20'
        }`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {label}
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-base font-black leading-none ${
            active ? 'bg-[#0C131F] text-[#8DE8FE]' : 'bg-[#8DE8FE] text-[#0C131F]'
          }`}
        >
          {active ? '✓' : '+'}
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-xl border border-[#D8DEFA] bg-white p-1.5 text-left shadow-2xl">
          {children}
        </div>
      ) : null}
    </div>
  )
}

// Compact departure/arrival time pill that opens a popover with a Partir/Arriver
// toggle + a HeroUI Calendar + TimeField (inline, so the popover's outside-click
// isn't tripped by a portal). Keeps the band tidy.
function TimeMenu({
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
  const dateVal: DateValue = datetime
    ? new CalendarDate(Number(datetime.slice(0, 4)), Number(datetime.slice(4, 6)), Number(datetime.slice(6, 8)))
    : today(getLocalTimeZone())
  const timeVal: TimeValue = datetime
    ? new Time(Number(datetime.slice(9, 11)), Number(datetime.slice(11, 13)))
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

function ItineraryScreen({
  datetime,
  destination,
  error,
  filters,
  journeys,
  arrivals,
  station,
  metrics,
  onCorrect,
  onTime,
  timeMode,
  onToggleFilter,
  onToggleListFilter,
  onNewSearch,
  onRefresh,
  origin,
  output,
  placeSearch,
  query,
  running,
  disabled,
  selectedId,
  setQuery,
  setSelectedId,
  onSubmit,
  searchedQuery,
}: {
  datetime: string | null
  destination: NavitiaPlace | null
  error: string | null
  filters: Filters
  journeys: JourneyResult[]
  arrivals: LineArrivals[]
  station: NavitiaPlace | null
  metrics: MetricState | null
  onCorrect: (origin: NavitiaPlace, destination: NavitiaPlace) => void
  onTime: (mode: 'depart_at' | 'arrive_by', local: string) => void
  timeMode: 'depart_at' | 'arrive_by'
  onToggleFilter: (key: 'noTransfer' | 'stepFree') => void
  onToggleListFilter: (key: 'excludedModes' | 'excludedLines', uri: string) => void
  onNewSearch: () => void
  onRefresh: () => void
  origin: NavitiaPlace | null
  output: string
  placeSearch: (query: string) => Promise<NavitiaPlace[]>
  query: string
  running: boolean
  disabled: boolean
  selectedId: string | null
  setQuery: (value: string) => void
  setSelectedId: (value: string) => void
  onSubmit: () => void
  searchedQuery: string
}) {
  const selected = journeys.find((journey) => journey.id === selectedId) ?? journeys[0] ?? null

  // Contextual nudge: the query that produced the current journeys clearly asked
  // for an unsupported trip (round-trip / multiple destinations). Only for
  // itinerary results — a station board has no such notion.
  const limit = journeys.length ? detectLimit(searchedQuery) : null

  // Lines actually used in the current results — the candidates for "Éviter une ligne".
  const lineMap = new Map<string, { id: string; label: string; color: string | null }>()
  for (const journey of journeys) {
    for (const section of journey.sections) {
      if (section.type === 'public_transport' && section.lineId && !lineMap.has(section.lineId)) {
        lineMap.set(section.lineId, { id: section.lineId, label: section.label, color: section.color })
      }
    }
  }
  const availableLines = [...lineMap.values()]

  return (
    <m.main className="bg-[#F3F3F8] pb-8" {...screenTransition}>
      <div className="bg-[#0C131F]">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-7 md:px-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[28px] font-black leading-none text-white">Itinéraires</h1>
            <p className="text-sm text-white/60">
              Nos offres sont présentées par horaires de départ.{' '}
              <button className="text-[#8DE8FE] hover:underline" type="button">Voir conditions</button>
            </p>
            {journeys.length || arrivals.length ? (
              <button
                className="ml-auto text-sm font-bold text-white/70 transition hover:text-[#8DE8FE]"
                onClick={onNewSearch}
                type="button"
              >
                Effacer
              </button>
            ) : null}
          </div>
          <div className="mt-5">
            <SearchPanel disabled={disabled} examples={NL_CHIPS} onExample={setQuery} onSubmit={onSubmit} query={query} running={running} setQuery={setQuery} />
          </div>
          {limit && (
            <LimitNudge
              kind={limit}
              onInvert={origin && destination ? () => onCorrect(destination, origin) : undefined}
            />
          )}
          {origin && destination ? (
            <div className="mt-3 flex w-full flex-col gap-2 lg:flex-row lg:items-stretch">
              <div className="relative flex flex-1 flex-col items-stretch gap-px sm:flex-row sm:items-center sm:gap-2">
              <PlaceAutocomplete
                label="Départ"
                value={origin}
                onSearch={placeSearch}
                onSelect={(place) => onCorrect(place, destination)}
              />
              {/* Mobile: absolute knob straddling the two stacked fields (no own row).
                  sm+: inline between the fields. */}
              <button
                aria-label="Inverser départ et arrivée"
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#0C131F] bg-[#242b35] text-[#8DE8FE] transition hover:bg-[#8DE8FE] hover:text-[#0C131F] sm:static sm:right-auto sm:h-8 sm:w-8 sm:translate-y-0 sm:border-0"
                onClick={() => onCorrect(destination, origin)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:rotate-90">
                  <path d="M7 4v13M7 4L4 7m3-3l3 3M17 20V7m0 13l3-3m-3 3l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <PlaceAutocomplete
                label="Arrivée"
                value={destination}
                onSearch={placeSearch}
                onSelect={(place) => onCorrect(origin, place)}
              />
              </div>
              <TimeMenu datetime={datetime} onApply={onTime} timeMode={timeMode} />
            </div>
          ) : null}
          {arrivals.length === 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-white/70">Filtrer par :</span>

            <FilterMenu label="Mode de transport" active={filters.excludedModes.length > 0}>
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">Inclure</p>
              {TRANSPORT_MODES.map((mode) => {
                const checked = !filters.excludedModes.includes(mode.uri)
                return (
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#171D2D] hover:bg-[#F4F6FF]"
                    key={mode.uri}
                    onClick={() => onToggleListFilter('excludedModes', mode.uri)}
                    type="button"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-[#127996] bg-[#127996] text-white' : 'border-slate-300'}`}>
                      {checked ? '✓' : ''}
                    </span>
                    <ModeIcon mode={mode.label} className="h-5 w-5 text-[#127996]" />
                    {mode.label}
                  </button>
                )
              })}
            </FilterMenu>

            <FilterMenu label="Éviter une ligne" active={filters.excludedLines.length > 0}>
              {availableLines.length === 0 ? (
                <p className="px-2 py-2 text-sm text-slate-400">Aucune ligne dans les résultats.</p>
              ) : (
                availableLines.map((line) => {
                  const excluded = filters.excludedLines.includes(line.id)
                  return (
                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#171D2D] hover:bg-[#F4F6FF]"
                      key={line.id}
                      onClick={() => onToggleListFilter('excludedLines', line.id)}
                      type="button"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${excluded ? 'border-[#BD2636] bg-[#BD2636] text-white' : 'border-slate-300'}`}>
                        {excluded ? '✕' : ''}
                      </span>
                      <span
                        className="flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-xs font-bold text-white"
                        style={{ backgroundColor: line.color ?? '#647187' }}
                      >
                        {line.label}
                      </span>
                      <span className="text-slate-500">{excluded ? 'Évitée' : 'Éviter'}</span>
                    </button>
                  )
                })
              )}
            </FilterMenu>

            {([
              { label: 'Accès sans escaliers', key: 'stepFree' },
              { label: 'Éviter une correspondance', key: 'noTransfer' },
            ] as const).map(({ label, key }) => {
              const active = filters[key]
              return (
                <button
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                    active ? 'bg-[#8DE8FE] text-[#0C131F]' : 'bg-[#242b35] text-white hover:bg-[#8DE8FE]/20'
                  }`}
                  disabled={running}
                  key={label}
                  onClick={() => onToggleFilter(key)}
                  type="button"
                >
                  {label}
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-base font-black leading-none ${
                      active ? 'bg-[#0C131F] text-[#8DE8FE]' : 'bg-[#8DE8FE] text-[#0C131F]'
                    }`}
                  >
                    {active ? '✓' : '+'}
                  </span>
                </button>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {arrivals.length ? (
        <ArrivalsBoard station={station} arrivals={arrivals} />
      ) : journeys.length ? (
        <div className="flex flex-grow flex-col lg:flex-row">
          <ItineraireList
            journeys={journeys}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onRefresh={onRefresh}
            refreshing={running}
          />
          <div className="w-full px-2 lg:w-2/4 lg:px-0">
            {selected ? (
              // Keyed by id: selecting another itinerary remounts and fades the
              // new detail straight in — no exit gap, so it feels instant.
              <m.div key={selected.id} {...detailTransition}>
                <ItineraireDetail journey={selected} />
              </m.div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
          <p className="text-[15px] font-black uppercase tracking-[0.16em] text-[#127996]">
            {running ? 'Recherche en cours…' : 'Prêt à partir'}
          </p>
          <p className="mt-2 max-w-[520px] text-[17px] text-[#5E6878]">
            Décrivez votre trajet dans la barre ci-dessus — par exemple « de Châtelet à Nation maintenant ».
          </p>
        </div>
      )}
      <DevToolBubble error={error} metrics={metrics} output={output} />
    </m.main>
  )
}

function Footer() {
  return (
    <footer className="bg-[#0C131F]">
      <div className="flex flex-col items-start justify-center space-y-8 bg-[#0C131F] p-8 md:flex-row md:space-x-36 md:space-y-0">
        <div className="flex w-full flex-col md:w-1/3">
          <p className="mb-4 text-lg text-white">Nos engagements</p>
          <div className="flex flex-col md:space-y-6">
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Meilleurs prix garantis</p>
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Paiement sécurisé</p>
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Contact 7j/7</p>
          </div>
        </div>
        <div className="flex w-full flex-col md:w-1/3">
          <p className="mb-4 text-lg text-white">Moyens de paiement</p>
          <div className="mb-4 flex flex-row space-x-4">
            <img src="/cb.png" alt="cb" className="h-8 w-auto" />
            <img src="/visa.png" alt="visa" className="h-8 w-auto" />
            <img src="/mastercard.png" alt="mastercard" className="h-8 w-auto" />
            <img src="/amex.png" alt="amex" className="h-8 w-auto" />
            <img src="/mooncard-logo-.png" alt="mooncard" className="h-8 w-auto" />
            <img src="/apple-pay.png" alt="apple-pay" className="h-8 w-auto" />
            <img src="/ancv_0.png" alt="ancv" className="h-8 w-auto" />
          </div>
          <div className="flex flex-col space-y-6">
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Infos et conditions</p>
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Paiement en Chèque-Vacances Connect</p>
            <p className="cursor-pointer text-sm text-slate-500 hover:text-[#8DE8FE]">Infos et conditions paiement ALD Automotive, Betterway, RoadMate, Swile ou Worklife</p>
          </div>
        </div>
        <div className="flex w-full flex-col space-y-4 md:w-1/3">
          <p className="text-lg text-white">Choix du pays</p>
          <select className="w-full rounded-md border border-slate-700 bg-[#0C131F] px-3 py-2 text-white outline-none focus:border-[#8DE8FE]">
            <option value="FR">France</option>
            <option value="BE">Belgique</option>
            <option value="DE">Allemagne</option>
            <option value="ES">Espagne</option>
            <option value="IT">Italie</option>
            <option value="LU">Luxembourg</option>
            <option value="NL">Pays-bas</option>
            <option value="CH">Suisse</option>
            <option value="EU">Europe</option>
          </select>
        </div>
      </div>
      <div className="border-t border-white/10 px-8 py-6">
        <p className="mx-auto max-w-[1100px] text-center text-xs leading-relaxed text-slate-500">
          Démo indépendante réalisée par Rasaboun pour illustrer la recherche d’itinéraires
          en langage naturel, exécutée entièrement dans le navigateur. Projet personnel, sans
          aucune affiliation avec SNCF Connect ni la SNCF — les marques et logos cités
          appartiennent à leurs propriétaires respectifs.
        </p>
      </div>
    </footer>
  )
}

export default function App() {
  const prefersReducedMotion = useReducedMotion()
  const { model, progress, error: modelError, loading } = useNeedleModel()
  const [query, setQuery] = useState(defaultQuery)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [intent, setIntent] = useState<NeedleIntent | null>(null)
  const [arrivals, setArrivals] = useState<LineArrivals[]>([])
  const [station, setStation] = useState<NavitiaPlace | null>(null)
  const [origin, setOrigin] = useState<NavitiaPlace | null>(demoMode ? DEMO_ORIGIN : null)
  const [destination, setDestination] = useState<NavitiaPlace | null>(demoMode ? DEMO_DESTINATION : null)
  const [datetime, setDatetime] = useState<string | null>(null)
  const [timeMode, setTimeMode] = useState<'depart_at' | 'arrive_by'>('depart_at')
  const [journeys, setJourneys] = useState<JourneyResult[]>(demoMode ? DEMO_JOURNEYS : [])
  const [selectedId, setSelectedId] = useState<string | null>(demoMode ? DEMO_JOURNEYS[0].id : null)
  const [metrics, setMetrics] = useState<MetricState | null>(null)
  // The query string that produced the current journeys — drives the limitation
  // nudge. Separate from `query` so editing the bar after a search doesn't move it.
  const [searchedQuery, setSearchedQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({ noTransfer: false, stepFree: false, excludedModes: [], excludedLines: [] })
  const runId = useRef(0)

  // Autocomplete source for the correction fields: real Navitia, or a local
  // mock under ?demo=1 (no token) so the listbox is demonstrable.
  const placeSearch = (q: string) =>
    demoMode || !navitiaEnabled ? demoSearchPlaces(q) : searchPlaces(q)

  const journeyOptions = (f: Filters) => ({
    maxTransfers: f.noTransfer ? 0 : null,
    wheelchair: f.stepFree,
    forbiddenUris: [...f.excludedModes, ...f.excludedLines],
  })

  async function runSearch() {
    if (!model || running || !query.trim()) return
    const currentRun = runId.current + 1
    runId.current = currentRun
    const startedAt = performance.now()

    setRunning(true)
    setError(null)
    setOutput('')
    setIntent(null)
    setOrigin(null)
    setDestination(null)
    setJourneys([])
    setArrivals([])
    setStation(null)
    setSelectedId(null)
    setMetrics(null)
    setSearchedQuery('')

    try {
      const inputTokens = model.tokenizer.buildEncoderInput(query, DEFAULT_TOOLS, model.sessions.cfg.max_seq_len).length
      let fullText = ''
      let outputTokens = 0

      for await (const step of generate(model.sessions, model.tokenizer, query, DEFAULT_TOOLS, { maxGen: 160 })) {
        if (runId.current !== currentRun) return
        fullText = step.fullText
        outputTokens = step.step + 1
        setOutput(fullText)
        setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
      }

      const parsed = parseNeedleToolCall(fullText)
      if (!parsed.ok) throw new Error(parsed.message)
      if (!navitiaEnabled) throw new Error('Missing VITE_NAVITIA_PROXY_URL for itinerary requests.')

      // get_next_arrivals: resolve the station and show its next-departures board.
      if (parsed.intent.name === 'get_next_arrivals') {
        const resolvedStation = await resolvePlace(parsed.intent.station)
        if (!resolvedStation) throw new Error(`Impossible de résoudre la station "${parsed.intent.station}".`)
        const nextArrivals = await fetchNextArrivals({
          stop: resolvedStation,
          fromDatetime: formatNavitiaDateTime(new Date()),
          limit: parsed.intent.limit,
          line: parsed.intent.line,
        })
        if (runId.current !== currentRun) return
        setIntent(parsed.intent)
        setStation(resolvedStation)
        setArrivals(nextArrivals)
        setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
        return
      }

      const parsedDate = parsed.intent.timeHuman ? parseHumanTime(parsed.intent.timeHuman, 'fr') : null
      const nextDatetime = parsedDate ? formatNavitiaDateTime(parsedDate.date) : null

      // Resolve the destination by best name match (Navitia quality breaks ties).
      const resolvedDestination = await resolvePlace(parsed.intent.destination)
      if (!resolvedDestination) throw new Error(`Impossible de résoudre l'arrivée "${parsed.intent.destination}".`)

      // No départ in the request -> ask for the user's location and use it.
      let resolvedOrigin: NavitiaPlace | null
      if (parsed.intent.origin) {
        resolvedOrigin = await resolvePlace(parsed.intent.origin)
        if (!resolvedOrigin) throw new Error(`Impossible de résoudre le départ "${parsed.intent.origin}".`)
      } else {
        resolvedOrigin = await requestCurrentLocation()
        if (!resolvedOrigin) {
          throw new Error("Needle n'a pas trouvé de point de départ. Ajoutez-le dans la phrase ou accepter la demande de localisation")
        }
      }
      if (runId.current !== currentRun) return

      // Fresh filters derived from the request (e.g. "en bus" -> only Bus).
      const nextFilters: Filters = {
        noTransfer: false,
        stepFree: false,
        excludedModes: excludedModesFromIntent(parsed.intent),
        excludedLines: [],
      }

      const nextJourneys = await fetchJourneys({
        origin: resolvedOrigin,
        destination: resolvedDestination,
        intent: parsed.intent,
        datetime: nextDatetime,
        options: journeyOptions(nextFilters),
      })

      if (runId.current !== currentRun) return
      setIntent(parsed.intent)
      setFilters(nextFilters)
      setOrigin(resolvedOrigin)
      setDestination(resolvedDestination)
      setDatetime(nextDatetime)
      setTimeMode(parsed.intent.timeMode ?? 'depart_at')
      setJourneys(nextJourneys)
      setSearchedQuery(query)
      setSelectedId(nextJourneys[0]?.id ?? null)
      setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
    } catch (err) {
      if (runId.current === currentRun) setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      if (runId.current === currentRun) setRunning(false)
    }
  }

  // Re-run the journeys query with the current places/intent/time and the given
  // filters. Shared by place correction and filter toggles. No-op without a
  // token or a prior search (demo mode just updates the UI).
  async function refetchJourneys(
    nextOrigin: NavitiaPlace | null,
    nextDestination: NavitiaPlace | null,
    nextFilters: typeof filters,
    nextDatetime: string | null = datetime,
    nextTimeMode: 'depart_at' | 'arrive_by' = timeMode,
  ) {
    if (!navitiaEnabled || !intent || intent.name !== 'search_itinerary' || !nextOrigin || !nextDestination) return
    const currentRun = runId.current + 1
    runId.current = currentRun
    setRunning(true)
    setError(null)
    try {
      const nextJourneys = await fetchJourneys({
        origin: nextOrigin,
        destination: nextDestination,
        intent: { ...intent, timeMode: nextTimeMode },
        datetime: nextDatetime,
        options: journeyOptions(nextFilters),
      })
      if (runId.current !== currentRun) return
      setJourneys(nextJourneys)
      setSelectedId(nextJourneys[0]?.id ?? null)
    } catch (err) {
      if (runId.current === currentRun) setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      if (runId.current === currentRun) setRunning(false)
    }
  }

  // User corrected a place via the autocomplete (or hit "Inverser pour le
  // retour"): update it and re-fetch. Clear the searched query so the limitation
  // nudge — derived from the typed sentence — drops once results no longer match it.
  function applyPlaces(nextOrigin: NavitiaPlace, nextDestination: NavitiaPlace) {
    setOrigin(nextOrigin)
    setDestination(nextDestination)
    setSearchedQuery('')
    void refetchJourneys(nextOrigin, nextDestination, filters)
  }

  // User changed the time field (mode = depart_at/arrive_by, local = datetime-local
  // string, '' = now) → re-fetch.
  function applyTime(mode: 'depart_at' | 'arrive_by', local: string) {
    const nav = local ? formatNavitiaDateTime(new Date(local)) : null
    setDatetime(nav)
    setTimeMode(mode)
    void refetchJourneys(origin, destination, filters, nav, mode)
  }

  // Toggle a boolean "Filtrer par" chip and re-fetch.
  function toggleFilter(key: 'noTransfer' | 'stepFree') {
    const next = { ...filters, [key]: !filters[key] }
    setFilters(next)
    void refetchJourneys(origin, destination, next)
  }

  // Toggle a value inside a string-array filter (excludedModes / excludedLines).
  function toggleListFilter(key: 'excludedModes' | 'excludedLines', uri: string) {
    const current = filters[key]
    const nextList = current.includes(uri) ? current.filter((u) => u !== uri) : [...current, uri]
    const next = { ...filters, [key]: nextList }
    setFilters(next)
    void refetchJourneys(origin, destination, next)
  }

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
        <div className="min-h-screen bg-[#F3F3F8] font-sans text-[#0C131F]">
          <Header />
          <LoaderCard error={modelError} loading={loading} progress={progress} />
          <ItineraryScreen
            datetime={datetime}
            destination={destination}
            disabled={!model || loading || Boolean(modelError)}
            error={error}
            filters={filters}
            journeys={journeys}
            arrivals={arrivals}
            station={station}
            metrics={metrics}
            onCorrect={applyPlaces}
            onTime={applyTime}
            onRefresh={() => refetchJourneys(origin, destination, filters)}
            timeMode={timeMode}
            onToggleFilter={toggleFilter}
            onToggleListFilter={toggleListFilter}
            onNewSearch={() => {
              setOutput('')
              setError(null)
              setIntent(null)
              setJourneys([])
              setArrivals([])
              setStation(null)
              setSearchedQuery('')
            }}
            onSubmit={runSearch}
            origin={origin}
            output={output}
            placeSearch={placeSearch}
            query={query}
            running={running}
            searchedQuery={searchedQuery}
            selectedId={selectedId}
            setQuery={setQuery}
            setSelectedId={setSelectedId}
          />
          <Footer />
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
