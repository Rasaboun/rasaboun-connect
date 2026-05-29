import { Popover } from '@heroui/react'
import { NEEDLE_CAPABILITIES } from '../constants'

// Reference affordance next to the search bar: tells users what Needle (the
// on-device extractor) understands and what it can't, on demand. HeroUI v3
// Popover is react-aria-based, so the trigger is keyboard-accessible and the
// overlay handles outside-click / Escape on its own.
export function NeedleInfoPopover() {
  return (
    <Popover>
      <Popover.Trigger className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[#8DE8FE]/50 bg-[#8DE8FE]/10 px-3 py-1 text-[12px] font-bold text-[#8DE8FE] outline-none transition hover:bg-[#8DE8FE]/20 focus-visible:ring-2 focus-visible:ring-[#8DE8FE]/40">
        <InfoIcon className="h-3.5 w-3.5" />
        Ce que Rasaboun-connect comprend
      </Popover.Trigger>
      <Popover.Content className="z-50 max-w-[20rem]">
        <Popover.Dialog className="p-4 outline-none">
          <Popover.Heading className="text-[13px] font-black text-[#0C131F]">
            Ce que Rasaboun-connect comprend
          </Popover.Heading>

          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
            Comprend
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {NEEDLE_CAPABILITIES.understands.map((item) => (
              <li className="flex gap-2 text-[13px] leading-snug text-[#243049]" key={item}>
                <span aria-hidden className="font-black text-emerald-600">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Pas encore
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {NEEDLE_CAPABILITIES.notYet.map((item) => (
              <li className="flex gap-2 text-[13px] leading-snug text-slate-500" key={item}>
                <span aria-hidden className="font-black text-slate-400">✗</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
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
