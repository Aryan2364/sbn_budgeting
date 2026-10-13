"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"

/**
 * Section 41.7 rules 12 to 15 - drafts of a form, kept on the phone.
 *
 * What is typed into a form is kept on the phone as it is typed, so a
 * phone call, a switch to another app or the browser closing never loses
 * it (rule 12). Opening the form again offers it back (rule 13), unless
 * the record changed after the draft was started (rule 14).
 *
 *   const draft = useDraft({
 *     person: me.id,
 *     form: "customer",
 *     record: customer?.id,                 // leave out on an Add form
 *     values,
 *     changed: isChanged(values, saved),    // as useUnsavedChanges gets it
 *     recordUpdatedAt: customer?.updatedAt,
 *     recordUpdatedBy: customer?.updatedByName,
 *   })
 *   const unsaved = useUnsavedChanges({ changed, noun: "customer", onLeave: draft.clear })
 *   ...
 *   <DraftBanner draft={draft} onUse={(kept) => setValues({ ...values, ...kept })} />
 *   ...
 *   async function save() { await put(values); draft.clear(); ... }
 *
 * PHONE ONLY. Rule 12 is in the phone section (41.7), so drafts are kept
 * and offered only in the phone layout. On the computer this hook reads
 * and writes nothing and `offer` is always null, so a desktop form is
 * exactly as it was. A phone's drafts stay where they are if the layout
 * changes (a foldable opened mid-form), and are offered again once it is
 * a phone.
 *
 * WHERE. The browser's localStorage, one entry per person, form and
 * record: `draft|<person>|<form>|<record or "new">`. Never shared between
 * people on one phone, never sent anywhere.
 *
 * WHAT IS NEVER KEPT (rule 15, section 32):
 *   - a field named in `exclude`;
 *   - a password: any field whose input in the form is a password field
 *     (pass `formRef` and it is found by itself, even while its text is
 *     shown), and, as a second net, any field whose name says password,
 *     passcode, passphrase, secret or OTP;
 *   - a file or photo: a File or Blob does not survive being written as
 *     text, and a photo is uploaded, not drafted.
 * Only the top level of `values` is looked at: a secret inside a nested
 * value must be named in `exclude` by its top-level field.
 *
 * WHEN IT IS DELETED (rule 15):
 *   - clear(): once the form is saved, and when the person chooses Leave
 *     in the unsaved-changes warning (pass it as that hook's onLeave). Call
 *     it as soon as the save succeeds, before moving away: a form that
 *     unmounts with typing not yet written writes it first.
 *   - discard(): the banner's Discard, or closing the banner that says the
 *     draft was not used (rule 14).
 *   - 7 days after it was last written: dropped when any form opens.
 *   - clearDrafts(person): when the person signs out.
 *
 * WHEN IT IS WRITTEN. 400ms after typing stops, and at once when the page
 * is hidden (a call, another app) or closed, or the form unmounts. Only
 * while the form is changed: `changed`, or, when it is not given, values
 * that differ from those the form opened with. Typing back to the saved
 * values deletes this visit's draft. While a draft is on offer, new typing
 * is still kept, as a draft of its own: Discard then deletes only the
 * offered draft, and Use draft brings the offered one back over it.
 *
 * THE RECORD CHANGED (rule 14). A draft remembers `recordUpdatedAt` as
 * it was when the draft started. If the record's is different when the
 * form opens again, someone saved the record in between, and the draft is
 * not offered: `offer` is a conflict, naming `recordUpdatedBy` and when.
 * Comparing the server's own value, rather than the phone's clock against
 * the server's, cannot be fooled by a phone whose clock is wrong. Mount
 * the form once the record has loaded, so the comparison has a value.
 *
 * STORAGE THAT FAILS NEVER BREAKS THE FORM. Every read and write is in
 * try/catch: storage that cannot be read offers nothing, and a write that
 * fails (private browsing, a full quota) is skipped. The form works
 * exactly as it would without drafts.
 */

type DraftValues = Record<string, unknown>

/** What useDraft offers when the form opens; null when nothing. */
type DraftOffer =
  /** Rule 13: "You have an unsaved draft from 3:45 PM." */
  | { savedAt: Date }
  /** Rule 14: the record changed after the draft was started. */
  | {
      conflict: {
        /** When the draft was last written. */
        savedAt: Date
        /** The record's last editor, as the caller passed it. */
        changedBy: string | null
        changedAt: Date
      }
    }

type Draft<T extends DraftValues> = {
  offer: DraftOffer | null
  /**
   * Rule 13's "Use draft": the offered draft's values, to set over the
   * form's. The draft carries on from there, still dated from when it
   * was started.
   */
  restore: () => Partial<T>
  /** Rule 13's "Discard", and closing rule 14's banner: deletes the offered draft. */
  discard: () => void
  /** Saved, or Leave: deletes this form's draft and anything waiting to be written. */
  clear: () => void
}

type Stored = {
  v: 1
  values: DraftValues
  /** When this draft was started (Date.now()). */
  startedAt: number
  /** When it was last written. */
  savedAt: number
  /** The record's updatedAt when the draft started, as a time; null on an Add form. */
  basedOn: number | null
}

const PREFIX = "draft|"
/** Rule 15: a draft is deleted after 7 days. */
const KEEP_FOR = 7 * 24 * 60 * 60 * 1000
/** Typing is written this long after it stops. */
const WRITE_AFTER = 400

/** A second net under formRef and `exclude`: names that hold a secret. */
const SECRET_NAME = /pass(word|code|phrase)|secret|^otp|otp$/i

// Every part is encoded, so a "|" inside an id can never make one
// person's prefix match another person's drafts.
const part = (value: string) => encodeURIComponent(value)

function keyFor(person: string, form: string, record: string | null | undefined): string {
  return `${PREFIX}${part(person)}|${part(form)}|${part(record ?? "new")}`
}

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<Stored>
  return (
    v.v === 1 &&
    !!v.values &&
    typeof v.values === "object" &&
    typeof v.startedAt === "number" &&
    typeof v.savedAt === "number" &&
    (v.basedOn === null || typeof v.basedOn === "number")
  )
}

/** The draft under `key`, or null: none, unreadable, or past 7 days (then deleted). */
function read(key: string): Stored | null {
  try {
    const raw = store()?.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStored(parsed) || Date.now() - parsed.savedAt > KEEP_FOR) {
      remove(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function write(key: string, value: Stored) {
  try {
    store()?.setItem(key, JSON.stringify(value))
  } catch {
    // Full or refused: the form carries on without a draft.
  }
}

function remove(key: string) {
  try {
    store()?.removeItem(key)
  } catch {}
}

/** Removes every draft whose key starts with `prefix` and passes `drop`. */
function removeWhere(prefix: string, drop: (raw: string | null) => boolean) {
  const s = store()
  if (!s) return
  try {
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    // Collected first: removing while counting would skip entries.
    for (const key of keys) if (drop(s.getItem(key))) s.removeItem(key)
  } catch {}
}

/** Once per page load: every person's drafts past 7 days go (rule 15). */
let swept = false
function sweep() {
  if (swept) return
  swept = true
  const now = Date.now()
  removeWhere(PREFIX, (raw) => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return !isStored(parsed) || now - parsed.savedAt > KEEP_FOR
    } catch {
      return true
    }
  })
}

/**
 * Rule 15: removes all of a person's drafts, on every form. Call it when
 * the person signs out, before the session ends. Safe on the server and
 * where storage cannot be used.
 */
function clearDrafts(person: string) {
  if (typeof window === "undefined") return
  removeWhere(`${PREFIX}${part(person)}|`, () => true)
}

function toTime(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/** The values that may be kept: no password, nothing excluded, no file. */
function keepable(
  values: DraftValues,
  exclude: readonly string[] | undefined,
  root: HTMLElement | null | undefined
): DraftValues {
  const secret = new Set(exclude)
  // password-input.tsx turns its field to type="text" while it is shown,
  // so its own wrapper is looked for as well as the type.
  root
    ?.querySelectorAll<HTMLInputElement>('input[type="password"], [data-slot="password-input"] input')
    .forEach((input) => {
      if (input.name) secret.add(input.name)
    })
  const kept: DraftValues = {}
  for (const [name, value] of Object.entries(values)) {
    if (secret.has(name) || SECRET_NAME.test(name)) continue
    if (typeof Blob !== "undefined" && value instanceof Blob) continue
    kept[name] = value
  }
  return kept
}

function serialise(values: DraftValues): string {
  try {
    return JSON.stringify(values)
  } catch {
    return ""
  }
}

function useDraft<T extends DraftValues>({
  person,
  form,
  record,
  values,
  changed,
  recordUpdatedAt,
  recordUpdatedBy,
  exclude,
  formRef,
}: {
  /** The signed-in person. Without one nothing is kept. */
  person: string | null | undefined
  /** Which form: "customer", "invoice". */
  form: string
  /** The record an edit form holds. Left out on an Add form. */
  record?: string | null
  /** The form's current values, one entry per field. */
  values: T
  /**
   * Whether the values differ from the saved ones (isChanged, as
   * useUnsavedChanges takes it). Left out, they are compared with the
   * values the form opened with.
   */
  changed?: boolean
  /** The record's last change, from the server. */
  recordUpdatedAt?: string | number | Date | null
  /** Who made it, as a name to show: "Suresh Patel". */
  recordUpdatedBy?: string | null
  /** Fields never kept, besides passwords. */
  exclude?: readonly string[]
  /** The form, so its password fields are found by their type. */
  formRef?: React.RefObject<HTMLElement | null>
}): Draft<T> {
  const { layout } = useLayout()
  const on = layout === "phone" && !!person
  const key = person ? keyFor(person, form, record) : null

  const [offer, setOffer] = React.useState<DraftOffer | null>(null)
  // The key the opening read was made for; writes wait for it.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)

  /** The draft found when the form opened, while it is on offer. */
  const offered = React.useRef<Stored | null>(null)
  /** The draft this visit is writing: when it started, and the record's version then. */
  const own = React.useRef<{ startedAt: number; basedOn: number | null } | null>(null)
  /** The values the form opened with, for `changed` when it is not given. */
  const baseline = React.useRef<string | null>(null)
  /** After clear(), nothing is written until the values change again. */
  const hold = React.useRef<string | null>(null)
  /** The latest keepable values, and whether they are still to be written. */
  const latest = React.useRef<{ values: DraftValues; snapshot: string } | null>(null)
  const pending = React.useRef(false)
  /** The values a write is waiting for or was made for, so a re-render does not restart the wait. */
  const scheduled = React.useRef<string | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // The options an effect needs at the moment it runs, without re-running for them.
  const options = React.useRef({ recordUpdatedAt, recordUpdatedBy, exclude, formRef, values })
  React.useLayoutEffect(() => {
    options.current = { recordUpdatedAt, recordUpdatedBy, exclude, formRef, values }
  })

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = false
  }, [])

  const flush = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!pending.current || !key || !latest.current) return
    pending.current = false
    const now = Date.now()
    own.current ??= { startedAt: now, basedOn: toTime(options.current.recordUpdatedAt) }
    write(key, {
      v: 1,
      values: latest.current.values,
      startedAt: own.current.startedAt,
      savedAt: now,
      basedOn: own.current.basedOn,
    })
  }, [key])

  // Opening: find the draft, and decide whether to offer it (rules 13, 14).
  React.useEffect(() => {
    offered.current = null
    own.current = null
    hold.current = null
    latest.current = null
    baseline.current = null
    scheduled.current = null
    let next: DraftOffer | null = null
    if (on && key) {
      sweep()
      const o = options.current
      baseline.current = serialise(keepable(o.values, o.exclude, o.formRef?.current))
      const stored = read(key)
      offered.current = stored
      const changedAt = toTime(o.recordUpdatedAt)
      if (
        stored &&
        changedAt !== null &&
        // The record's version the draft was based on; a draft without
        // one falls back to comparing times.
        (stored.basedOn !== null ? stored.basedOn !== changedAt : changedAt > stored.startedAt)
      ) {
        next = {
          conflict: {
            savedAt: new Date(stored.savedAt),
            changedBy: o.recordUpdatedBy ?? null,
            changedAt: new Date(changedAt),
          },
        }
      } else if (stored) {
        next = { savedAt: new Date(stored.savedAt) }
      }
    }
    // Reading storage after hydration is the point of this effect: the
    // server has no storage, so the first render offers nothing, and the
    // draft is offered once the browser has read it.
    setOffer(next)
    setOpenedFor(on ? key : null)
  }, [on, key])

  // Typing: keep it, 400ms after it stops (rule 12).
  React.useEffect(() => {
    if (!on || !key || openedFor !== key) return
    const kept = keepable(values, exclude, formRef?.current)
    const snapshot = serialise(kept)
    if (hold.current !== null) {
      if (snapshot === hold.current) return
      hold.current = null
    }
    const isChanged = changed ?? snapshot !== baseline.current
    if (!isChanged) {
      // Back to the saved values: this visit's draft goes, an offered one stays.
      cancel()
      if (own.current) {
        const stored = read(key)
        if (stored && stored.startedAt === own.current.startedAt) remove(key)
        own.current = null
      }
      latest.current = { values: kept, snapshot }
      scheduled.current = null
      return
    }
    // Already waiting for, or written with, these values.
    if (scheduled.current === snapshot) return
    scheduled.current = snapshot
    latest.current = { values: kept, snapshot }
    pending.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, WRITE_AFTER)
  }, [on, key, openedFor, values, changed, exclude, formRef, cancel, flush])

  // A call, another app, the browser closing, or leaving the form:
  // written at once (rule 12).
  React.useEffect(() => {
    if (!on || !key) return
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [on, key, flush])

  const restore = React.useCallback((): Partial<T> => {
    const stored = offered.current
    offered.current = null
    setOffer(null)
    if (!stored) return {}
    // The draft carries on, still dated from its start and still based on
    // the record's version then.
    own.current = { startedAt: stored.startedAt, basedOn: stored.basedOn }
    hold.current = null
    scheduled.current = null
    return stored.values as Partial<T>
  }, [])

  const discard = React.useCallback(() => {
    const stored = offered.current
    offered.current = null
    setOffer(null)
    if (!stored || !key) return
    // Only the offered draft: typing since the form opened is a draft of
    // its own, and stays.
    const now = read(key)
    if (now && now.startedAt === stored.startedAt) remove(key)
  }, [key])

  const clear = React.useCallback(() => {
    cancel()
    offered.current = null
    own.current = null
    scheduled.current = null
    setOffer(null)
    if (key) remove(key)
    // What is in the form now is the saved state: write nothing more until
    // it changes.
    const now = latest.current?.snapshot ?? null
    hold.current = now
    baseline.current = now
  }, [key, cancel])

  return { offer, restore, discard, clear }
}

export { useDraft, clearDrafts, type Draft, type DraftOffer, type DraftValues }
