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
