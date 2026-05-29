export type SncfMenuGroup = {
  title: string
  items: string[]
}

export type SncfMenuEntry = {
  id: string
  label: string
  leadTitle: string
  leadCopy: string
  panelWidth: 'sm' | 'md' | 'lg'
  groups: SncfMenuGroup[]
}

export type SncfCountry = {
  code: string
  label: string
}

export type SncfPaymentLogo = {
  src: string
  alt: string
}

export const SNCF_MENUS: SncfMenuEntry[] = [
  {
    id: 'voyager',
    label: 'Voyager',
    leadTitle: 'Voyager',
    leadCopy: 'Tout pour voyager',
    panelWidth: 'lg',
    groups: [
      {
        title: 'Réserver',
        items: [
          'Billets de train',
          'Voyages en bus',
          'Trajets en covoiturage',
          'Location de voiture',
          'Taxi ou VTC',
        ],
      },
      {
        title: 'Bon plans',
        items: ['Bons plans train', 'Voyages en groupe', 'Voyages pro', 'Enfant voyageant seul'],
      },
      {
        title: 'Informations',
        items: ['Info trafic', 'Handicap et accessibilité', 'Tous les transporteurs', 'Tous les services', 'Nos réponses à vos questions'],
      },
      {
        title: 'Guide de voyage',
        items: ['Où voyager en France, en Europe', 'Voyager selon vos envies'],
      },
    ],
  },
  {
    id: 'billets',
    label: 'Billets',
    leadTitle: 'Voyages',
    leadCopy: 'Voir vos billets et titres',
    panelWidth: 'lg',
    groups: [
      {
        title: 'Vos voyages',
        items: ['Tous vos voyages', 'Importer un voyage', 'Compensation en cas de retard', 'Faire une réclamation', 'Modifier un voyage', 'Assurance Allianz'],
      },
      {
        title: 'Vos cartes et abonnements',
        items: ['Importer une carte ou abonnement', 'Acheter une carte ou abonnement'],
      },
      {
        title: 'Compléter votre voyage',
        items: ['Louer une voiture', 'Transports urbains', 'Réserver un taxi / VTC', 'Restauration à bord TGV INOUI', 'Restauration à bord INTERCITES'],
      },
    ],
  },
  {
    id: 'offres',
    label: 'Offres',
    leadTitle: 'Offres',
    leadCopy: 'Parcourir toutes les offres',
    panelWidth: 'md',
    groups: [
      {
        title: 'Réservation',
        items: ['Billets de train', 'Voyages en bus', 'Trajets en covoiturage', 'Location de voiture', 'Taxi ou VTC'],
      },
      {
        title: 'Offres',
        items: ['Bons plans train', 'Voyages en groupe', 'Voyages pro', 'Enfant voyageant seul'],
      },
    ],
  },
  {
    id: 'compte',
    label: 'Compte',
    leadTitle: 'Compte',
    leadCopy: 'Accéder à votre compte',
    panelWidth: 'lg',
    groups: [
      {
        title: 'Réservation',
        items: ['Importer une carte ou abonnement', 'Acheter une carte ou abonnement'],
      },
      {
        title: 'Bon plans',
        items: ['Louer une voiture', 'Transports urbains', 'Réserver un taxi / VTC', 'Restauration à bord TGV INOUI', 'Restauration à bord INTERCITES'],
      },
      {
        title: 'Information',
        items: ['Tous vos voyages', 'Importer un voyage', 'Compensation en cas de retard', 'Faire une réclamation', 'Modifier un voyage', 'Assurance Allianz'],
      },
    ],
  },
]

export const SNCF_COUNTRIES: SncfCountry[] = [
  { code: 'FR', label: 'France' },
  { code: 'BE', label: 'Belgique' },
  { code: 'DE', label: 'Allemagne' },
  { code: 'ES', label: 'Espagne' },
  { code: 'IT', label: 'Italie' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'NL', label: 'Pays-Bas' },
  { code: 'CH', label: 'Suisse' },
]

export const SNCF_PAYMENT_LOGOS: SncfPaymentLogo[] = [
  { src: '/cb.png', alt: 'Carte Bancaire' },
  { src: '/visa.png', alt: 'Visa' },
  { src: '/mastercard.png', alt: 'Mastercard' },
  { src: '/amex.png', alt: 'American Express' },
  { src: '/mooncard-logo-.png', alt: 'Mooncard' },
  { src: '/apple-pay.png', alt: 'Apple Pay' },
  { src: '/ancv_0.png', alt: 'ANCV' },
]

