import type { NeedleLimit } from '../needle-limits'

const MESSAGES: Record<NeedleLimit, string> = {
  'round-trip': 'Needle traite un aller simple. Voici l’aller — inversez pour obtenir le retour.',
  'multi-dest': 'Needle gère une seule destination à la fois.',
}

// Contextual note shown under the search bar when the submitted query clearly
// asked for something Needle can't do. `onInvert` (round-trip only) reuses the
// existing départ/arrivée swap so the user gets the return leg in one tap.
export function LimitNudge({ kind, onInvert }: { kind: NeedleLimit; onInvert?: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/70">
      <InfoIcon className="h-4 w-4 shrink-0 text-[#8DE8FE]" />
      <span>{MESSAGES[kind]}</span>
      {kind === 'round-trip' && onInvert && (
        <button
          className="font-bold text-[#8DE8FE] transition hover:underline"
          onClick={onInvert}
          type="button"
        >
          Inverser pour le retour
        </button>
      )}
    </div>
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
