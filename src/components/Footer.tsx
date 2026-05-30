// Presentation-only SNCF-Connect-style footer: engagements, payment logos,
// country selector, and the independent-demo disclaimer.
export function Footer() {
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
