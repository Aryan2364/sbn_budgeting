import { scopesFor, type AccessContext } from '../access/access-context';
import { reasonFor } from '../access/permission.guard';

/**
 * Every sentence the complaints API sends to a person, in Gujarati
 * (owner decision, 7 Oct 2026: the whole Complaints area is in Gujarati,
 * as the raise form already was). One place, so the words stay the same
 * on every route and match the screens (frontend
 * `components/complaints/gu.ts`, which carries the same glossary).
 *
 * Glossary (the raise form's own words, reused everywhere):
 *   complaint            ફરિયાદ            (plural ફરિયાદો)
 *   site                 સાઇટ
 *   category             ફરિયાદનો પ્રકાર
 *   title                ફરિયાદનો વિષય
 *   supervisor / manager સુપરવાઇઝર / મેનેજર
 *   open / in progress / closed   ખુલ્લી / કામ ચાલુ / બંધ
 *   start work           કામ શરૂ કરવું
 *   resolve              ફરિયાદ ઉકેલવી
 *   resolution note      શું કામ કર્યું
 *   root cause           સમસ્યાનું મૂળ કારણ
 *   reassign             બીજાને સોંપવી
 *   comment              ટિપ્પણી
 *   sign in              લૉગિન
 *
 * Names of people, sites and categories are passed in and kept as typed.
 * Numbers stay in the digits used today (kit 18).
 *
 * Not here, and still English: the shared access layer's own sentences
 * (`reasonFor`, `recordReason`) on routes outside Complaints, and the
 * `can` map on list rows, which no complaint screen shows. The
 * complaints routes rewrite the access layer's 403 sentences through
 * `ComplaintsForbiddenFilter` and `refusedFor` below.
 */

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export const NOT_FOUND =
  'આ ફરિયાદ મળી નથી, અથવા તે તમને મોકલવામાં આવી નથી. લિંક તપાસો, અથવા ફરિયાદોની યાદીમાંથી ખોલો.';

export const PHOTO_GONE = 'આ ફોટો હવે નથી. ફરિયાદ ફરી લોડ કરો.';

export const unknownTab = (tab: string | undefined, tabs: readonly string[]): string =>
  `"${tab}" નામનું કોઈ ટેબ નથી. આમાંથી એક વાપરો: ${tabs.join(', ')}.`;

export const unknownStatus = (status: string, statuses: readonly string[]): string =>
  `"${status}" નામની કોઈ સ્થિતિ નથી. આમાંથી એક વાપરો: ${statuses.join(', ')}.`;

export const notAnId = (name: string): string => `${name} યાદીમાંથી પસંદ કરેલું હોવું જોઈએ.`;

/** The list's "matched in" labels, one per searched field. */
export const SEARCH_LABEL = {
  title: 'વિષય',
  description: 'વિગત',
  complainant: 'ફરિયાદી',
  complainantPhone: 'ફરિયાદીનો મોબાઇલ નંબર',
  site: 'સાઇટ',
  location: 'વિસ્તાર',
  locationNote: 'ચોક્કસ જગ્યા',
  category: 'ફરિયાદનો પ્રકાર',
  supervisor: 'સુપરવાઇઝર',
  raisedBy: 'નોંધાવનાર',
} as const;

// ---------------------------------------------------------------------
// Raise
// ---------------------------------------------------------------------

export const RAISE = {
  needTitle: 'ફરિયાદનો વિષય ટૂંકમાં લખો',
  longTitle: 'વિષય 120 અક્ષર સુધીમાં લખો',
  needSite: 'ફરિયાદ કઈ સાઇટની છે તે યાદીમાંથી પસંદ કરો',
  needCategory: 'ફરિયાદનો પ્રકાર યાદીમાંથી પસંદ કરો',
  longName: 'ફરિયાદીનું નામ 200 અક્ષર સુધીમાં લખો',
  longPhone: 'મોબાઇલ નંબર 40 અક્ષર સુધીમાં લખો',
  longPlace: 'ચોક્કસ જગ્યા 500 અક્ષર સુધીમાં લખો',
  longDescription: 'ફરિયાદની વિગત 5000 અક્ષર સુધીમાં લખો',
  shortPhone: (phone: string) =>
    `"${phone}" પૂરો મોબાઇલ નંબર નથી. 10 આંકડા લખો, જેમ કે 98250 12345.`,
  siteGone: 'આ સાઇટ હવે નથી. બીજી સાઇટ પસંદ કરો.',
  siteNotYours: (site: string) =>
    `તમે પસંદ કરી શકો એવી સાઇટ પર જ ફરિયાદ નોંધાવી શકો છો, અને ${site} તેમાંની નથી. બીજી સાઇટ પસંદ કરો.`,
  categoryGone: 'આ ફરિયાદનો પ્રકાર હવે નથી. બીજો પ્રકાર પસંદ કરો.',
  categoryRetired: (category: string) =>
    `${category} હવે વપરાતો નથી. બીજો ફરિયાદનો પ્રકાર પસંદ કરો.`,
} as const;

/**
 * The sentence for a site nobody could receive a complaint at: the raise
 * 422 and the site picker's `reason` (GET /complaints/sites).
 */
export const noSupervisorReason = (site: string): string =>
  `${site} માટે લૉગિન કરી શકે એવા કોઈ સુપરવાઇઝર હજી નથી, તેથી આ ફરિયાદ કોઈને પહોંચશે નહીં. બજેટ એડમિનિસ્ટ્રેટરને સાઇટ પર સુપરવાઇઝર નક્કી કરવા કહો.`;

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

/** The root cause's limit (owner, 7 Oct 2026; migration 0015). */
export const ROOT_CAUSE_MAX = 2000;

export const ACT = {
  needResolutionNote: 'શું કામ કર્યું તે લખો. ફરિયાદ ઉકેલવા માટે આ જરૂરી છે.',
  longResolutionNote: 'શું કામ કર્યું તે 5000 અક્ષર સુધીમાં લખો',
  needRootCause: 'સમસ્યાનું મૂળ કારણ લખો: સમસ્યા કેમ થઈ. ફરિયાદ ઉકેલવા માટે આ જરૂરી છે.',
  longRootCause: `સમસ્યાનું મૂળ કારણ ${ROOT_CAUSE_MAX} અક્ષર સુધીમાં લખો`,
  needReassignNote: 'ફરિયાદ કેમ બીજાને સોંપો છો તે લખો. બીજાને સોંપવા માટે આ જરૂરી છે.',
  needReassignTarget: 'ફરિયાદ કોને સોંપવી તે યાદીમાંથી પસંદ કરો',
  longNote: 'નોંધ 5000 અક્ષર સુધીમાં લખો',
  needComment: 'મોકલતા પહેલાં ટિપ્પણી લખો.',
  personGone: 'આ વ્યક્તિ હવે નથી. બીજી વ્યક્તિ પસંદ કરો.',
  cannotWork: (name: string) =>
    `${name} ફરિયાદ પર કામ શરૂ કરી કે ઉકેલી શકતા નથી, તેથી આ ફરિયાદ તેમને સોંપી શકાય નહીં. એવી વ્યક્તિ પસંદ કરો જે કરી શકે.`,
  cannotSignIn: (name: string) =>
    `${name} લૉગિન કરી શકતા નથી, તેથી આ ફરિયાદ પર કામ કરી શકે નહીં. બીજી વ્યક્તિ પસંદ કરો, અથવા પહેલાં તેમને લૉગિન આપો.`,
  alreadySupervisor: (name: string) => `${name} પહેલેથી જ આ ફરિયાદના સુપરવાઇઝર છે.`,
  notAvailable: 'આ કામ હમણાં થઈ શકે એમ નથી.',
  refresh: 'હાલની સ્થિતિ જોવા માટે ફરિયાદ ફરી લોડ કરો.',
} as const;

/**
 * A 409's opening: who moved the complaint first. `actor` is null when
 * it was the caller ("તમે"); a name otherwise, or "someone else" when
 * the person is gone.
 */
export function alreadyMoved(kind: string, actor: { you: boolean; name: string | null }): string | null {
  const who = actor.you ? 'તમે' : actor.name ? `${actor.name} એ` : 'બીજા કોઈએ';
  switch (kind) {
    case 'started':
      return `${who} આ ફરિયાદ પર પહેલેથી કામ શરૂ કરી દીધું છે.`;
    case 'resolved':
      return `${who} આ ફરિયાદ પહેલેથી ઉકેલી દીધી છે.`;
    case 'closed':
      return `${who} આ ફરિયાદ પહેલેથી બંધ કરી દીધી છે.`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Notifications (the bell). `what` is the site and the category.
// ---------------------------------------------------------------------

export const NOTIFY = {
  what: (site: string, category: string) => `${site} – ${category}`,
  assigned: (reference: string, what: string) => `નવી ફરિયાદ ${reference} તમને સોંપાઈ: ${what}`,
  copied: (reference: string, what: string) => `ફરિયાદ ${reference} નોંધાઈ: ${what}`,
  closed: (reference: string, by: string) => `ફરિયાદ ${reference} ${by} એ ઉકેલીને બંધ કરી`,
  reassignedToYou: (reference: string, by: string) => `ફરિયાદ ${reference} ${by} એ તમને સોંપી`,
  reassignedAway: (reference: string, to: string) => `ફરિયાદ ${reference} હવે ${to} ને સોંપાઈ છે`,
} as const;

// ---------------------------------------------------------------------
// Permission sentences (the access layer's, in Gujarati)
// ---------------------------------------------------------------------

/** What each complaints permission lets a person do, as "the permission to ...". */
const PERMISSION_NOUN: Readonly<Record<string, string>> = {
  'complaints.complaints.view': 'ફરિયાદો જોવાની',
  'complaints.complaints.raise': 'ફરિયાદ નોંધાવવાની',
  'complaints.complaints.comment': 'ફરિયાદો પર ટિપ્પણી કરવાની',
  'complaints.complaints.work': 'પોતાને સોંપેલી ફરિયાદો પર કામ શરૂ કરવાની અને ઉકેલવાની',
  'complaints.complaints.reassign': 'ફરિયાદો બીજાને સોંપવાની',
  'platform.people.pick': 'લોકોની યાદીમાંથી પસંદ કરવાની',
  'budget.sites.pick': 'સાઇટની યાદીમાંથી પસંદ કરવાની',
};

/** The reach phrases of `recordReason`, for a complaint. */
const REACH = {
  own: 'જે ફરિયાદોમાં તમારું નામ હોય તેના માટે',
  ownManager: 'જે ફરિયાદોના તમે મેનેજર હો તેના માટે',
  team: 'તમારી ટીમની અને તમારી ટીમ સંભાળે છે તે સાઇટ્સની ફરિયાદો માટે',
  units: 'તમે પસંદ કરેલી અને તમે સંભાળો છો તે સાઇટ્સની ફરિયાદો માટે',
} as const;

/** True when `key` has Gujarati words here. */
export function knowsPermission(key: string): boolean {
  return key in PERMISSION_NOUN;
}

/** `reasonFor` in Gujarati: the permission is not held at all. */
export function notHeld(key: string): string {
  const noun = PERMISSION_NOUN[key];
  return noun ? `ફક્ત ${noun} પરવાનગી ધરાવતા લોકો જ આ કરી શકે છે.` : reasonFor(key);
}

/**
 * `recordReason` (access/scope.ts) in Gujarati, for a complaint: why
 * `key` does not reach this complaint, from the scopes the caller holds,
 * never a role. Same answer as the English one, word for word in meaning.
 */
export function refusedFor(ctx: AccessContext, key: string): string {
  const held = scopesFor(ctx, key as Parameters<typeof scopesFor>[1]);
  const noun = PERMISSION_NOUN[key];
  if (!noun || held.size === 0 || held.has('all')) return notHeld(key);
  const reach: string[] = [];
  if (held.has('own')) reach.push(key === 'complaints.complaints.reassign' ? REACH.ownManager : REACH.own);
  if (held.has('team')) reach.push(REACH.team);
  if (held.has('units')) reach.push(REACH.units);
  return `તમને ${noun} પરવાનગી ફક્ત ${reach.join(', અથવા ')} છે.`;
}

/** The guard's answer to a request with no signed-in person. */
export const SIGN_IN = 'આગળ વધવા માટે લૉગિન કરો.';

/** Gujarati script: a sentence already written for this area. */
export function isGujarati(text: unknown): boolean {
  return typeof text === 'string' && /[઀-૿]/.test(text);
}
