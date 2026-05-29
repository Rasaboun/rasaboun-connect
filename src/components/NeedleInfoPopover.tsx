import { Popover } from '@heroui/react'
import { NEEDLE_CAPABILITIES } from '../constants'
import type { Aggregate } from '../inference/progress'

// One pill in the search-bar affordance row, morphing across the model's
// lifecycle and acting as the single popover trigger:
//   loading → progress ring + "Modèle Needle · NN %"  (popover: download status)
//   ready   → info icon + "Ce que Rasaboun-connect comprend" (popover: capabilities)
//   error   → red "Modèle indisponible" + a visible Réessayer button beside it.
// HeroUI v3 Popover is react-aria-based, so the trigger is keyboard-accessible
// and the overlay handles outside-click / Escape on its own.
export type ModelStatus = {
  loading: boolean
  error: string | null
  agg: Aggregate
  retry: () => void
}

const PILL_BASE =
  'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold outline-none transition focus-visible:ring-2'
const PILL_INFO =
  'border border-[#8DE8FE]/50 bg-[#8DE8FE]/10 text-[#8DE8FE] hover:bg-[#8DE8FE]/20 focus-visible:ring-[#8DE8FE]/40'
const PILL_ERROR =
  'border border-[#F87171]/55 bg-[#F87171]/15 text-[#FCA5A5] hover:bg-[#F87171]/25 focus-visible:ring-[#F87171]/40'

const mo = (bytes: number) => (bytes / 1e6).toFixed(0)

export function NeedleInfoPopover({ status }: { status: ModelStatus }) {
  const { loading, error, agg, retry } = status

  // Bytes are all in (100 %) but the ONNX sessions are still compiling — there
  // are no progress events for that phase, so flip the pill to a spinner +
  // "Initialisation…" instead of leaving it frozen at 100 %.
  const initializing = loading && !agg.indeterminate && agg.pct >= 100

  const heading = error ? 'Modèle indisponible' : loading ? 'Téléchargement du modèle' : 'Ce que Rasaboun-connect comprend'

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <Popover.Trigger className={`${PILL_BASE} ${error ? PILL_ERROR : PILL_INFO}`}>
          {error ? (
            <>
              <WarnIcon className="h-3.5 w-3.5" />
              Modèle indisponible
            </>
          ) : loading ? (
            <>
              <ProgressRing pct={agg.pct} indeterminate={agg.indeterminate || initializing} />
              {agg.indeterminate ? 'Modèle Needle' : initializing ? 'Initialisation…' : `Modèle Needle · ${agg.pct} %`}
            </>
          ) : (
            <>
              <InfoIcon className="h-3.5 w-3.5" />
              Ce que Rasaboun-connect comprend
            </>
          )}
        </Popover.Trigger>
        <Popover.Content className="z-50 max-w-[20rem]">
          <Popover.Dialog className="p-4 outline-none">
            <Popover.Heading className="text-[13px] font-black text-[#0C131F]">{heading}</Popover.Heading>

            {error ? <ErrorBody message={error} /> : null}
            {loading ? <DownloadBody agg={agg} /> : null}
            {error || loading ? <div className="my-3 h-px bg-[#EEF1F6]" /> : null}

            <Capabilities />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      {error ? (
        <button
          type="button"
          onClick={retry}
          className="inline-flex shrink-0 cursor-pointer items-center rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#0C131F] outline-none transition hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/50 active:scale-[0.98]"
        >
          Réessayer
        </button>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {error ? 'Modèle indisponible.' : loading ? '' : 'Modèle Needle prêt.'}
      </span>
    </div>
  )
}

function DownloadBody({ agg }: { agg: Aggregate }) {
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-slate-500">
          {agg.indeterminate ? `${mo(agg.loaded)} Mo` : `${mo(agg.loaded)} / ${mo(agg.total)} Mo`}
        </span>
        {!agg.indeterminate ? <span className="text-[13px] font-black text-[#127996]">{agg.pct}&nbsp;%</span> : null}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F1F4F8]">
        {agg.indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[#127996] motion-reduce:animate-none" />
        ) : (
          <div className="h-full rounded-full bg-[#127996] transition-all" style={{ width: `${agg.pct}%` }} />
        )}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
        Needle s’exécute sur votre appareil. Téléchargé une seule fois, puis gardé en cache — les visites suivantes
        sont instantanées.
      </p>
    </div>
  )
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="mt-2">
      <p className="text-[13px] leading-snug text-red-700">{message}</p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
        Needle s’exécute sur votre appareil. Vérifiez votre connexion, puis réessayez.
      </p>
    </div>
  )
}

function Capabilities() {
  return (
    <>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-emerald-600">Comprend</p>
      <ul className="mt-1.5 space-y-1.5">
        {NEEDLE_CAPABILITIES.understands.map((item) => (
          <li className="flex gap-2 text-[13px] leading-snug text-[#243049]" key={item}>
            <span aria-hidden className="font-black text-emerald-600">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pas encore</p>
      <ul className="mt-1.5 space-y-1.5">
        {NEEDLE_CAPABILITIES.notYet.map((item) => (
          <li className="flex gap-2 text-[13px] leading-snug text-slate-500" key={item}>
            <span aria-hidden className="font-black text-slate-400">✗</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Small circular progress for the pill. Determinate: arc grows with pct.
// Indeterminate (before all files report a content-length): a quarter arc that
// spins — unless the user prefers reduced motion, where it sits static.
function ProgressRing({ pct, indeterminate }: { pct: number; indeterminate: boolean }) {
  const circumference = 2 * Math.PI * 15
  const filled = indeterminate ? circumference * 0.25 : (circumference * pct) / 100
  return (
    <svg
      viewBox="0 0 36 36"
      className={`h-[15px] w-[15px] ${indeterminate ? 'animate-spin motion-reduce:animate-none' : ''}`}
      aria-hidden
    >
      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(141,232,254,0.25)" strokeWidth="6" />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke="#8DE8FE"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - filled}
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1.15" fill="currentColor" />
    </svg>
  )
}

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 3.5 21 19H3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="1.15" fill="currentColor" />
    </svg>
  )
}
