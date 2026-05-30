import { useEffect, useRef, useState, type ReactNode } from 'react'

// A "Filtrer par" chip that opens a popover panel (modes / lines). Boolean
// chips elsewhere stay as plain toggles. Closes on outside click.
export function FilterMenu({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
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
