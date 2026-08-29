const CUSTOMER_TABS = ['werk', 'mail', 'tijdlijn', 'gegevens', 'geld']

const PAGES = ['dashboard', 'sales', 'todos', 'klanten', 'mail', 'uren', 'geld', 'instellingen']

const TODO = { open: 'todo', label: 'Taak' }

const BY_PAGE = {
  dashboard: [{ open: 'customer', label: 'Klant' }],
  sales: [
    { open: 'quote', label: 'Offerte' },
    { open: 'opp', label: 'Kans' }
  ],
  todos: [],
  klanten: [{ open: 'customer', label: 'Klant' }],
  mail: [{ open: 'mail', label: 'Nieuwe mail' }],
  uren: [{ open: 'time', label: 'Uren' }],
  geld: [
    { open: 'quote', label: 'Offerte' },
    { open: 'revenue', label: 'Opbrengst' },
    { open: 'cost', label: 'Kosten' }
  ],
  instellingen: []
}

const BY_CUSTOMER_TAB = {
  werk: [
    { open: 'opp', label: 'Kans' },
    { open: 'idea', label: 'Idee' }
  ],
  mail: [{ open: 'mail', label: 'Nieuwe mail' }],
  tijdlijn: [
    { open: 'note', label: 'Notitie' },
    { open: 'activity', label: 'Contact' }
  ],
  gegevens: [{ open: 'contact', label: 'Contactpersoon' }],
  geld: [
    { open: 'quote', label: 'Offerte' },
    { open: 'revenue', label: 'Opbrengst' },
    { open: 'cost', label: 'Kosten' }
  ]
}

export function plusContextFromRoute(parts = [], params = {}) {
  const page = parts[0] || 'dashboard'
  if (page === 'klanten' && parts[1]) {
    const tab = CUSTOMER_TABS.includes(params.tab) ? params.tab : 'werk'
    return { page: 'customer', tab, customerId: parts[1] }
  }
  return {
    page: PAGES.includes(page) ? page : 'dashboard',
    tab: null,
    customerId: null
  }
}

export function plusItems(context = {}, customerId = '') {
  const cid = customerId || context.customerId || ''
  const extras = context.page === 'customer'
    ? (BY_CUSTOMER_TAB[context.tab] || BY_CUSTOMER_TAB.werk)
    : (BY_PAGE[context.page] || [])
  return [TODO, ...extras].map((item) => cid ? { ...item, customerId: cid } : { ...item })
}
