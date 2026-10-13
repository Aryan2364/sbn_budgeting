/**
 * Phase 3b: words for the phone record and comments screens that are not
 * already in `GU_PHONE` (gu.ts) or `GU_COMMON`. Plan-phone's rule (section
 * 7.5, D7) is that Phase 1 alone edits gu.ts, so anything genuinely
 * missing for this phase is added here instead, in the same Gujarati the
 * rest of the complaints area uses.
 */

/** `ComplaintDetailPage`'s desktop GU, duplicated here only for the strings
 *  this phone screen also needs and that are not exported from there. */
export const GU_RECORD = {
  notFound: "ફરિયાદ મળી નથી",
  notFoundBody: "તે કદાચ નથી, અથવા તમને મોકલવામાં આવી નથી. તમે જોઈ શકો તે ફરિયાદો યાદીમાં છે.",
  openList: "ફરિયાદોની યાદી ખોલો",
  loadFailed: "ફરિયાદ ખૂલી શકી નથી",
  actionFailed: "આ કામ થઈ શક્યું નથી",
  stale: "કોઈએ આ ફરિયાદ બદલી છે",
  starting: "કામ શરૂ થઈ રહ્યું છે…",
  started: (reference: string) => `ફરિયાદ ${reference} પર કામ શરૂ થયું`,
  closed: (by: string | null, when: string | null) =>
    `${
      by && when
        ? `${by} એ ${when} ના રોજ આ ફરિયાદ બંધ કરી.`
        : by
          ? `${by} એ આ ફરિયાદ બંધ કરી.`
          : when
            ? `આ ફરિયાદ ${when} ના રોજ બંધ થઈ.`
            : "આ ફરિયાદ બંધ છે."
    } હવે તેમાં ફેરફાર થઈ શકે નહીં, પણ જેમને તે મોકલાઈ છે તેઓ હજી ટિપ્પણી કરી શકે છે.`,
  raised: (reference: string) => `ફરિયાદ ${reference} નોંધાઈ ગઈ`,
  sentTo: (supervisor: string, place: string) => `તે ${place} ના સુપરવાઇઝર ${supervisor} ને મોકલાઈ છે`,
  copiedTo: (manager: string) => `, અને તેની નકલ મેનેજર ${manager} ને પણ ગઈ છે`,
  complaintCard: "ફરિયાદ",
  noDescription: "ફરિયાદની વિગત લખી નથી.",
  noName: "નામ આપ્યું નથી",
  noPhone: "મોબાઇલ નંબર આપ્યો નથી",
  noPlace: "કોઈ નોંધ લખી નથી",
  problemPhoto: "સમસ્યાનો ફોટો",
  noProblemPhotos: "ફરિયાદ નોંધાવતી વખતે કોઈ ફોટો ઉમેર્યો નથી.",
  fixPhoto: "કામ પૂરું થયાનો ફોટો",
  sentToCard: "કોને મોકલી",
  nobody: "કોઈ નહીં",
  dates: "તારીખો",
  raisedOn: "નોંધાઈ",
  workStarted: "કામ શરૂ થયું",
  resolvedOn: "ઉકેલાઈ",
  closedOn: "બંધ થઈ",
  took: "લાગેલો સમય",
  age: "કેટલા દિવસથી",
  notYet: "હજી નહીં",
}
