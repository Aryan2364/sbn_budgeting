/**
 * The Complaints area's words, in Gujarati (owner decision, 7 Oct 2026:
 * every complaints screen is Gujarati, as the raise form already was).
 * Shared here so one thing is called one thing on every screen. The
 * server says its sentences in the same words (backend
 * `src/complaints/messages.ts`).
 *
 * Glossary (the raise form's own words, reused everywhere):
 *
 *   complaint / complaints   ફરિયાદ / ફરિયાદો
 *   raise a complaint        ફરિયાદ નોંધાવો
 *   title                    ફરિયાદનો વિષય
 *   description              ફરિયાદની વિગત
 *   site                     સાઇટ
 *   category                 ફરિયાદનો પ્રકાર
 *   complainant              ફરિયાદી
 *   exact place              ચોક્કસ જગ્યા
 *   supervisor / manager     સુપરવાઇઝર / મેનેજર
 *   status                   સ્થિતિ
 *   Open / In progress / Closed   ખુલ્લી / કામ ચાલુ / બંધ
 *   start work               કામ શરૂ કરો
 *   resolve                  ફરિયાદ ઉકેલો
 *   what was done            શું કામ કર્યું          (the resolution note)
 *   root cause analysis      સમસ્યાનું મૂળ કારણ
 *   reassign                 બીજાને સોંપો
 *   comment                  ટિપ્પણી
 *   activity                 ઇતિહાસ
 *   photos of the problem    સમસ્યાના ફોટા
 *   photos of the fix        કામ પૂરું થયાના ફોટા
 *   cancel / close / try again   રદ કરો / બંધ કરો / ફરી પ્રયાસ કરો
 *
 * Names of people, sites and categories are passed in and shown as typed.
 * Dates keep the product's one format (kit 18: "12 Aug 2026, 3:45 PM")
 * and numbers keep today's digits.
 */

import { ApiError } from "@/lib/api"
import type { ComplaintStatus } from "@/lib/complaints-api"
import type { PermissionKey } from "@/lib/permissions"
import { formatNumber } from "@/lib/format"
import type { FileUploadText } from "@/components/ui/file-upload"
import type { UnsavedChangesText } from "@/components/ui/unsaved-changes"

// ---------------------------------------------------------------------
// Shared words
// ---------------------------------------------------------------------

export const GU_STATUS: Record<ComplaintStatus, string> = {
  open: "ખુલ્લી",
  in_progress: "કામ ચાલુ",
  closed: "બંધ",
}

export const GU_COMMON = {
  complaints: "ફરિયાદો",
  complaint: "ફરિયાદ",
  raise: "ફરિયાદ નોંધાવો",
  breadcrumbLabel: "પેજનો માર્ગ",
  tryAgain: "ફરી પ્રયાસ કરો",
  cancel: "રદ કરો",
  close: "બંધ કરો",
  refreshComplaint: "ફરિયાદ ફરી લોડ કરો",
  supervisor: "સુપરવાઇઝર",
  manager: "મેનેજર",
  site: "સાઇટ",
  category: "ફરિયાદનો પ્રકાર",
  status: "સ્થિતિ",
  noSite: "સાઇટ નથી",
  /** "1 ફરિયાદ", "12 ફરિયાદો". */
  count: (n: number) => `${formatNumber(n)} ${n === 1 ? "ફરિયાદ" : "ફરિયાદો"}`,
  /** How long a complaint has been (or was) open. */
  age: (days: number) => (days <= 0 ? "આજે" : `${formatNumber(days)} દિવસ`),
}

/** The words of the dated "Raised", "Closed" and similar lines. */
export const GU_WHEN = {
  on: (date: string) => `${date} ના રોજ`,
}

// ---------------------------------------------------------------------
// Errors that do not come from the complaints server
// ---------------------------------------------------------------------

/** Gujarati script: a sentence already written for this area. */
export function isGujarati(text: string): boolean {
  return /[઀-૿]/.test(text)
}

/**
 * The message to show for a failed request on a complaints screen.
 *
 * The complaints API answers in Gujarati, and that sentence is shown as
 * it came. Anything else (no connection, a timeout, a server error, a
 * framework or shared-layer sentence in English) is said in Gujarati here
 * by its status, cause then next step (kit 7.2).
 */
export function guError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : ""
  if (message && isGujarati(message)) return message
  const status = caught instanceof ApiError ? caught.status : -1
  if (status === 0) {
    return /took too long/i.test(message)
      ? "સર્વરે જવાબ આપવામાં ઘણો સમય લીધો. ઇન્ટરનેટ તપાસીને ફરી પ્રયાસ કરો."
      : "સર્વર સુધી પહોંચી શકાયું નથી. ઇન્ટરનેટ કનેક્શન તપાસીને ફરી પ્રયાસ કરો."
  }
  if (status === 400) return "આ માહિતી સ્વીકારાઈ નથી. તપાસીને ફરી પ્રયાસ કરો."
  if (status === 401) return "તમારું લૉગિન પૂરું થઈ ગયું છે. ફરી લૉગિન કરો."
  if (status === 403) return "તમને આ કરવાની પરવાનગી નથી. જરૂર હોય તો એડમિનિસ્ટ્રેટરને પૂછો."
  if (status === 404) return "આ માહિતી મળી નથી. પેજ ફરી લોડ કરો."
  if (status === 409) return "આ ફરિયાદ કોઈએ પહેલેથી બદલી છે. હાલની સ્થિતિ જોવા માટે ફરિયાદ ફરી લોડ કરો."
  if (status === 413) return "ફોટા મોકલવા માટે ખૂબ મોટા છે. એક ફોટો દૂર કરીને ફરી પ્રયાસ કરો."
  if (status === 422) return "આ માહિતી સાચવી શકાઈ નથી. તપાસીને ફરી પ્રયાસ કરો."
  if (status >= 500) return "સર્વર આ કામ પૂરું કરી શક્યું નથી. થોડી વાર પછી ફરી પ્રયાસ કરો."
  return "કંઈક ખોટું થયું. ફરી પ્રયાસ કરો."
}

/**
 * Kit 26.2's "who may do it", for a complaints permission the person
 * does not hold (the browser's own `reasonFor` is English, shared with
 * every module). The server's per-complaint reasons are Gujarati already.
 */
const PERMISSION_NOUN: Partial<Record<PermissionKey, string>> = {
  "complaints.complaints.view": "ફરિયાદો જોવાની",
  "complaints.complaints.raise": "ફરિયાદ નોંધાવવાની",
  "complaints.complaints.comment": "ફરિયાદો પર ટિપ્પણી કરવાની",
  "complaints.complaints.work": "પોતાને સોંપેલી ફરિયાદો પર કામ શરૂ કરવાની અને ઉકેલવાની",
  "complaints.complaints.reassign": "ફરિયાદો બીજાને સોંપવાની",
}

export function guNotHeld(key: PermissionKey): string {
  const noun = PERMISSION_NOUN[key]
  return noun
    ? `ફક્ત ${noun} પરવાનગી ધરાવતા લોકો જ આ કરી શકે છે.`
    : "તમને આ કરવાની પરવાનગી નથી."
}

// ---------------------------------------------------------------------
// Shared component words
// ---------------------------------------------------------------------

/** Leaving a dialog's form with something typed (kit 11.3 rule 10). */
export const GU_UNSAVED_FORM: UnsavedChangesText = {
  title: "આ ફોર્મ છોડી દેવું છે?",
  description: "તમે લખેલી માહિતી જતી રહેશે.",
  stay: "લખવાનું ચાલુ રાખો",
  leave: "છોડી દો",
}

/** Leaving the raise form with something filled in. */
export const GU_UNSAVED_RAISE: UnsavedChangesText = {
  title: "આ ફરિયાદ છોડી દેવી છે?",
  description: "તમે ભરેલી માહિતી જતી રહેશે.",
  stay: "ભરવાનું ચાલુ રાખો",
  leave: "છોડી દો",
}

/** The photo upload's own words (it stays English on other screens). */
export const GU_UPLOAD: FileUploadText = {
  typeList: (names) =>
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} અથવા ${names[names.length - 1]}`,
  limits: ({ types, maxSize, maxFiles }) =>
    [
      types ? `${types}.` : null,
      maxFiles === 1 ? `${maxSize} સુધી.` : `દરેક ફોટો ${maxSize} સુધી.`,
      maxFiles > 1 ? `વધુમાં વધુ ${maxFiles} ફોટા.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  full: ({ count, maxFiles }) =>
    `${maxFiles} માંથી ${count} ફોટા ઉમેર્યા છે. બીજો ફોટો ઉમેરવા માટે એક ફોટો દૂર કરો.`,
  drag: ({ maxFiles }) =>
    maxFiles === 1
      ? "ફોટો અહીં ખેંચીને મૂકો, અથવા પસંદ કરો."
      : "ફોટા અહીં ખેંચીને મૂકો, અથવા પસંદ કરો.",
  touch: ({ maxFiles, camera }) =>
    camera
      ? `ફોટો પાડો અથવા ${maxFiles === 1 ? "ફોટો" : "ફોટા"} પસંદ કરો.`
      : `${maxFiles === 1 ? "ફોટો" : "ફોટા"} પસંદ કરો.`,
  takeButton: () => "ફોટો પાડો",
  chooseButton: ({ maxFiles }) => (maxFiles === 1 ? "ફોટો પસંદ કરો" : "ફોટા પસંદ કરો"),
  unreadable: ({ name }) =>
    `${name} ફોટો તરીકે ખૂલી શક્યો નથી. JPG કે PNG ફોટો પસંદ કરો, અથવા ફોટો ફરીથી પાડો.`,
  tooLarge: ({ name, size, maxSize }) =>
    `${name} ${size} નો છે, જે ${maxSize} ની મર્યાદા કરતાં મોટો છે. નાનો ફોટો પસંદ કરો.`,
  wrongType: ({ name, types }) =>
    types
      ? `${name} ${types} ફોટો નથી. ${types} ફોટો પસંદ કરો.`
      : `${name} આ પ્રકારની ફાઇલ ચાલતી નથી. બીજો ફોટો પસંદ કરો.`,
  tooMany: ({ name, maxFiles }) =>
    `${name} ઉમેરાયો નથી, કારણ કે વધુમાં વધુ ${maxFiles} ફોટા ઉમેરી શકાય. બીજો ફોટો ઉમેરવા માટે એક ફોટો દૂર કરો.`,
  preparing: () => "ફોટો તૈયાર થઈ રહ્યો છે",
  uploading: ({ percent }) => `અપલોડ થઈ રહ્યો છે, ${percent}%`,
  uploadFailed: ({ name }) => `${name} અપલોડ થયો નથી. ફરી પ્રયાસ કરો, અથવા તેને દૂર કરો.`,
  retry: "ફરી પ્રયાસ કરો",
  download: "ડાઉનલોડ કરો",
  downloadLabel: ({ name }) => `${name} ડાઉનલોડ કરો`,
  remove: "દૂર કરો",
  removeLabel: ({ name }) => `${name} દૂર કરો`,
  confirmTitle: () => "ફોટો દૂર કરવો છે?",
  confirmBody: ({ name, context }) =>
    `${name} ${context ? `${context} માંથી ` : ""}દૂર થઈ જશે. પછી પાછો લાવી શકાશે નહીં.`,
  confirmCancel: "રદ કરો",
  confirmAction: () => "ફોટો દૂર કરો",
}

/** The list's pagination bar (components/templates/list-page.tsx). */
export const GU_PAGINATION = {
  range: (from: string, to: string, total: string) => `${total} માંથી ${from}–${to}`,
  previous: "પાછળ",
  next: "આગળ",
  previousLabel: "પાછલું પેજ",
  nextLabel: "આગળનું પેજ",
  page: (n: string) => `પેજ ${n}`,
}

/**
 * "2 hours ago" in Gujarati, for the activity feed (kit 18 allows
 * relative times there). Past a week, the date in the product's format.
 */
export function guTimeAgo(at: Date, now: Date, formatDate: (d: Date) => string): string {
  const MINUTE = 60_000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const diff = Math.max(0, now.getTime() - at.getTime())
  if (diff < MINUTE) return "હમણાં જ"
  if (diff < HOUR) return `${formatNumber(Math.floor(diff / MINUTE))} મિનિટ પહેલાં`
  if (diff < DAY) return `${formatNumber(Math.floor(diff / HOUR))} કલાક પહેલાં`
  if (diff < 7 * DAY) return `${formatNumber(Math.floor(diff / DAY))} દિવસ પહેલાં`
  return formatDate(at)
}

// ---------------------------------------------------------------------
// The phone layout (plan-phone D7, kit 37.6 rule 2)
// ---------------------------------------------------------------------

/**
 * Every word the phone layout shows, in Gujarati. On phone every screen
 * but Login is Gujarati (plan-phone D9, L10), so this block overrides
 * each English word the kit's phone parts carry: through a component's
 * `text` prop (phone-list, record-summary, empty-state, more-screen,
 * computer-only-page, draft-banner, install-sheet, connection-banner),
 * and, for the screen-reader labels inside shared primitives ("Back",
 * "Close", "Actions"), through lib/phone-words.ts, which re-exports this.
 *
 * ONLY Phase 1 of the phone plan edits this block; later phases read it.
 * A phase that needs a word not here asks the lead to add it.
 *
 * Allowed Latin on a phone screen: complaint references (C-000123),
 * numbers, names as entered, and the computer-only page's screen titles,
 * which come from nav.ts.
 */
export const GU_PHONE = {
  /** Screen-reader labels and fixed words inside shared primitives. */
  a11y: {
    back: "પાછા જાઓ",
    close: "બંધ કરો",
    /** A three-dot menu's sheet title and label. */
    actions: "વિકલ્પો",
    /** A select's sheet title when the field gives none. */
    chooseOption: "વિકલ્પ પસંદ કરો",
    /** A popover's sheet title when it gives none. */
    details: "વિગત",
    search: "શોધો",
    selectPlaceholder: "પસંદ કરો",
    nothingMatches: "આ શોધ મુજબ કંઈ મળ્યું નથી.",
    showMore: "વધુ બતાવો",
    showLess: "ઓછું બતાવો",
    undo: "પાછું કરો",
    mainNav: "મુખ્ય મેનુ",
    loading: "લોડ થઈ રહ્યું છે",
    skipToContent: "મુખ્ય ભાગ પર જાઓ",
  },

  /** The tab bar (plan-phone section 6). */
  tabs: {
    myWork: "મારું કામ",
    complaints: "ફરિયાદો",
    more: "વધુ",
  },

  /** App bar titles. */
  titles: {
    myWork: "મારું કામ",
    complaints: "ફરિયાદો",
    more: "વધુ",
    comments: "ટિપ્પણીઓ",
    resolve: "ફરિયાદ ઉકેલો",
    raise: "ફરિયાદ નોંધાવો",
    /** The shell's fallback app bar and a screen with no nav.ts owner. */
    product: "Sadbhavna",
  },

  /** The round add button on both lists (41.5 rule 7). */
  add: "ફરિયાદ નોંધાવો",

  /** More (5.7). */
  more: {
    signOut: "સાઇન આઉટ",
    install: "એપ ઇન્સ્ટોલ કરો",
    notifications: "સૂચનાઓ",
  },

  /**
   * empty-state.tsx's phone words (its EmptyStateText): the computer-only
   * page (41.11, plan 5.8) and My work's nothing-waiting (41.15 rule 9).
   */
  emptyState: {
    goHome: "હોમ પર જાઓ",
    shareLink: "લિંક શેર કરો",
    copyLink: "લિંક કૉપી કરો",
    linkCopied: "લિંક કૉપી થઈ ગઈ",
    copyFailed: "લિંક કૉપી થઈ શકી નથી. ઉપર સરનામાની પટ્ટીમાંથી કૉપી કરો.",
    signOut: "સાઇન આઉટ",
    desktopOnlyHeading: "આ સ્ક્રીન કમ્પ્યુટર પર ચાલે છે",
    desktopOnlyLine: "કમ્પ્યુટર પર ખોલો. આ લિંક ત્યાં આ જ સ્ક્રીન ખોલશે.",
    nothingWaitingHeading: "તમારે માટે કંઈ બાકી નથી",
    nothingWaitingLine: "તમને સોંપાયેલી નવી ફરિયાદો અહીં દેખાશે.",
  },

  /**
   * The phone list (41.5), shared by My work and Complaints. Shaped like
   * phone-list.tsx's PhoneListText; the noun is ignored, because the list
   * is always of complaints.
   */
  list: {
    search: () => "ફરિયાદ શોધો",
    clearSearch: "શોધ સાફ કરો",
    count: (n: number) => `${formatNumber(n)} ${n === 1 ? "ફરિયાદ" : "ફરિયાદો"}`,
    filter: "ફિલ્ટર",
    filters: "ફિલ્ટર",
    sort: "ક્રમ",
    clearAll: "બધું સાફ કરો",
    showResults: (n: number | undefined) =>
      n === undefined ? "પરિણામ બતાવો" : `${formatNumber(n)} પરિણામ બતાવો`,
    removeFilter: (label: string) => `ફિલ્ટર દૂર કરો: ${label}`,
    activeFilters: "લાગુ કરેલા ફિલ્ટર",
    all: "બધી",
    capped: (total: number) =>
      `${formatNumber(total)} માંથી ${formatNumber(200)} ફરિયાદો બતાવી છે. બાકીની શોધવા માટે શોધો કે ફિલ્ટર કરો.`,
    moreFailed: () => "આગળની ફરિયાદો લોડ થઈ શકી નથી. ઇન્ટરનેટ તપાસીને ફરી પ્રયાસ કરો.",
    tryAgain: "ફરી પ્રયાસ કરો",
    failedHeading: () => "ફરિયાદો લોડ થઈ શકી નથી",
    failedLine: "ઇન્ટરનેટ તપાસીને ફરી પ્રયાસ કરો.",
    noMatchSearch: (_noun: unknown, query: string) => `'${query}' સાથે મેળ ખાતી કોઈ ફરિયાદ નથી`,
    noMatchFilters: () => "આ ફિલ્ટર મુજબ કોઈ ફરિયાદ નથી",
    noMatchLine: {
      search: "જોડણી તપાસો, અથવા શોધ સાફ કરો.",
      filters: "ફિલ્ટર બદલો, અથવા સાફ કરો.",
      both: "શોધ કે ફિલ્ટર બદલો, અથવા સાફ કરો.",
    },
    clearFound: {
      search: "શોધ સાફ કરો",
      filters: "ફિલ્ટર સાફ કરો",
      both: "શોધ અને ફિલ્ટર સાફ કરો",
    },
    emptyStatus: (_noun: unknown, status: string) => `${status} સ્થિતિમાં કોઈ ફરિયાદ નથી.`,
    loading: "લોડ થઈ રહ્યું છે",
    /** Row line 3 (5.2): "C-000123 · 12 Aug 2026 ના રોજ નોંધાઈ · 3 દિવસ". */
    rowMeta: (ref: string, date: string, age: string) => `${ref} · ${date} ના રોજ નોંધાઈ · ${age}`,
  },

  /** The filter sheet (5.2). */
  filter: {
    title: "ફિલ્ટર",
    status: "સ્થિતિ",
    site: "સાઇટ",
    category: "ફરિયાદનો પ્રકાર",
    any: "બધી",
    searchSites: "સાઇટ શોધો",
  },

  /** The sort sheet (5.2): one tick. */
  sort: {
    title: "ક્રમ",
    newest: "નવી પહેલાં",
    oldest: "જૂની પહેલાં",
    number: "નંબર",
    site: "સાઇટ",
  },

  /** The record (5.3) and record-summary.tsx's text. */
  record: {
    notSet: "ભરેલું નથી",
    addComment: "ટિપ્પણી ઉમેરો",
    showMore: "વધુ બતાવો",
    history: "ઇતિહાસ",
    historyCapped: "જૂનો ઇતિહાસ કમ્પ્યુટર પર જુઓ.",
    historyFailed: "ઇતિહાસ લોડ થઈ શક્યો નથી. ફરી પ્રયાસ કરો.",
    /** "C-000123 · રમેશ દ્વારા 12 Aug 2026, 3:45 PM ના રોજ નોંધાવી · 3 દિવસ". */
    meta: (ref: string, by: string, when: string, age: string) =>
      `${ref} · ${by} દ્વારા ${when} ના રોજ નોંધાવી · ${age}`,
    keyFacts: {
      site: "સાઇટ",
      category: "ફરિયાદનો પ્રકાર",
      phone: "ફરિયાદીનો મોબાઇલ નંબર",
      supervisor: "સુપરવાઇઝર",
    },
    details: {
      description: "ફરિયાદની વિગત",
      complainant: "ફરિયાદીનું નામ",
      exactPlace: "ચોક્કસ જગ્યા",
      manager: "મેનેજર",
    },
    problemPhotos: "સમસ્યાના ફોટા",
    resolution: "ઉકેલ",
    rootCause: "સમસ્યાનું મૂળ કારણ",
    whatWasDone: "શું કામ કર્યું",
    fixPhotos: "કામ પૂરું થયાના ફોટા",
    resolvedBy: (by: string, when: string) => `${by} દ્વારા ${when} ના રોજ ઉકેલાઈ`,
    startWork: "કામ શરૂ કરો",
    resolve: "ફરિયાદ ઉકેલો",
  },

  /** The comments screen (5.4). */
  comments: {
    title: "ટિપ્પણીઓ",
    empty: "હજી કોઈ ટિપ્પણી નથી",
    emptyLine: "પહેલી ટિપ્પણી નીચે લખો.",
    placeholder: "ટિપ્પણી લખો",
    label: "ટિપ્પણી",
    send: "મોકલો",
    sending: "મોકલાઈ રહી છે",
  },

  /** draft-banner.tsx's text (41.7 rules 13 and 14). */
  draft: {
    offer: (when: string) => `તમારો ${when} નો ન સાચવેલો ડ્રાફ્ટ છે.`,
    notUsed: (when: string, changedBy: string | null | undefined, changedAt: string) =>
      changedBy
        ? `તમારો ${when} નો ડ્રાફ્ટ વાપર્યો નથી, કારણ કે ${changedBy} એ ${changedAt} વાગ્યે આ ફરિયાદ બદલી છે.`
        : `તમારો ${when} નો ડ્રાફ્ટ વાપર્યો નથી, કારણ કે આ ફરિયાદ ${changedAt} વાગ્યે બદલાઈ છે.`,
    use: "ડ્રાફ્ટ વાપરો",
    discard: "ડ્રાફ્ટ કાઢી નાખો",
    close: "બંધ કરો",
    /** Plan D6: photos are never part of a draft, and the banner says so. */
    photosNotKept: "ફોટા ડ્રાફ્ટમાં સચવાતા નથી, તેને ફરીથી ઉમેરો.",
  },

  /** Phase 5: install-sheet.tsx's text (41.12 rule 8). */
  install: {
    title: "એપ ઇન્સ્ટોલ કરો",
    iPhoneIntro: "એપને હોમ સ્ક્રીન પર ઉમેરો, જેથી તે બીજી એપની જેમ ખૂલે.",
    iPhoneSteps: [
      "બ્રાઉઝરની પટ્ટીમાં Share (શેર) બટન દબાવો.",
      "\"Add to Home Screen\" દબાવો. ન દેખાય તો યાદી નીચે સરકાવો.",
      "Add દબાવો.",
    ],
    otherSteps: "બ્રાઉઝરનું મેનુ ખોલો અને \"Install app\" અથવા \"Add to Home screen\" પસંદ કરો.",
  },

  /** Phase 5: connection-banner.tsx's text (41.14 rules 6, 10 and 11). */
  connection: {
    banner: "તમે ઓફલાઇન છો. ઇન્ટરનેટ પાછું આવે ત્યાં સુધી ફેરફાર સાચવી શકાશે નહીં.",
    heading: "ઓફલાઇન ઉપલબ્ધ નથી",
    line: "ઇન્ટરનેટ પાછું આવે પછી આ સ્ક્રીન ખૂલશે.",
    retry: "ફરી પ્રયાસ કરો",
    newVersion: "નવું વર્ઝન તૈયાર છે",
    reload: "ફરી લોડ કરો",
  },

  /** Phase 6: the notification sheet and More's switch (L13). */
  notifications: {
    title: "આ ફોન પર સૂચનાઓ",
    why: "તમને નવી ફરિયાદ સોંપાય ત્યારે તરત સૂચના મળશે.",
    turnOn: "ચાલુ કરો",
    notNow: "હમણાં નહીં",
    turningOn: "ચાલુ થઈ રહી છે",
    turnedOn: "સૂચનાઓ ચાલુ થઈ ગઈ",
    turnedOff: "સૂચનાઓ બંધ થઈ ગઈ",
    failed: "સૂચનાઓ ચાલુ થઈ શકી નથી. ઇન્ટરનેટ તપાસીને ફરી પ્રયાસ કરો.",
    notSetUp: "આ એપ માટે ફોન સૂચનાઓ હજી ગોઠવાઈ નથી.",
    switchLabel: "સૂચનાઓ",
    on: "આ ફોન પર સૂચનાઓ ચાલુ છે.",
    off: "આ ફોન પર સૂચનાઓ બંધ છે.",
    needsInstall:
      "iPhone પર સૂચનાઓ ફક્ત એપ હોમ સ્ક્રીન પર ઉમેર્યા પછી જ મળે છે. પહેલાં એપ ઇન્સ્ટોલ કરો.",
    installLink: "એપ ઇન્સ્ટોલ કરો",
    unsupported: "આ બ્રાઉઝર ફોન સૂચનાઓ બતાવી શકતું નથી.",
    denied: (platform: "ios" | "android" | "other", installed: boolean, appName: string) => {
      const start = "આ ફોન પર સૂચનાઓ બંધ કરેલી છે, અને એપ ફરી પૂછી શકતી નથી. ચાલુ કરવા માટે "
      if (platform === "ios") {
        return `${start}iPhone ના Settings ખોલો, પછી Notifications, પછી ${appName}, અને Allow Notifications ચાલુ કરો.`
      }
      if (platform === "android" && installed) {
        return `${start}ફોનના Settings ખોલો, પછી Apps, પછી ${appName}, પછી Notifications, અને ચાલુ કરો.`
      }
      return `${start}બ્રાઉઝરની સરનામાની પટ્ટીની ડાબી બાજુના ચિહ્નને દબાવો, આ સાઇટના સેટિંગ્સ ખોલો અને Notifications ચાલુ કરો.`
    },
  },
}
