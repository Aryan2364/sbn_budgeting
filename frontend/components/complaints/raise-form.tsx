"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlertIcon, TriangleAlertIcon, UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import {
  complaintsApi,
  type ComplaintSiteOption,
} from "@/lib/complaints-api"
import { useCan } from "@/lib/permissions"
import { errorMessage, useSession } from "@/components/shell/session"
import { Banner, BannerAction, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import {
  FileUpload,
  filesToSend,
  isBusy,
  type FileUploadItem,
  type FileUploadText,
} from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ctrlEnterSaves } from "@/components/ui/keyboard-shortcuts"
import {
  isChanged,
  useUnsavedChanges,
  type UnsavedChangesText,
} from "@/components/ui/unsaved-changes"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import {
  FormField,
  FormFooter,
  FormFrame,
  FormScrollArea,
} from "@/components/templates/form-page"
import { PageHeader } from "@/components/templates/page"
import { Choice } from "@/components/complaints/choice"
import { useComplaintMasters } from "@/components/complaints/use-masters"

/**
 * `/complaints/new` — the raise form (section 11.3, and the agreed
 * phone exception: single column below 640px, full-width controls,
 * 16px inputs, the camera one tap away).
 *
 * The contract's fields in the partner's own order: site, category,
 * complainant name and phone (prefilled from the signed-in person and
 * editable), a note on where exactly, the description, and up to three
 * photos.
 *
 * A complaint is filed against a budget site (CONTRACT §10). Routing is
 * decided by the server at raise time. The form previews it from the
 * `/complaints/sites` row (who its supervisor is now), so a site with
 * nobody to send to is flagged BEFORE the person types a paragraph, and
 * the server's 422 is still shown as a banner with a way forward if the
 * picture changed in between. The supervisor is set on the site itself,
 * so only someone allowed to change a site's people is offered the way
 * to the site form.
 */

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
/** Phones: 16px text so iOS does not zoom into the field (agreed exception). */
const PHONE_TEXT = "max-sm:text-base"

/**
 * Every word this screen shows, in Gujarati. The field labels are in the
 * JSX below. Names of people and places are passed in and kept as they
 * are. Text that comes from the server (a 422 routing message, say) is
 * shown as the server sent it.
 */
const GU = {
  // Page
  title: "ફરિયાદ નોંધાવો",
  meta: "આ ફરિયાદ સીધી સાઇટના સુપરવાઇઝરને જશે. તેની નકલ તેમના મેનેજરને પણ જશે.",
  breadcrumbLabel: "પેજનો માર્ગ",

  // Masters failed to load
  loadFailedHeading: "ફોર્મ ખૂલી શક્યું નથી",
  loadFailedNothingSaved: "કંઈ સાચવાયું નથી.",
  tryAgain: "ફરી પ્રયાસ કરો",

  // Validation
  needSite: "ફરિયાદ કઈ સાઇટની છે તે પસંદ કરો",
  needCategory: "ફરિયાદનો પ્રકાર પસંદ કરો",
  needName: "ફરિયાદીનું નામ લખો",
  needPhone: "મોબાઇલ નંબર લખો, જેથી સુપરવાઇઝર ફોન કરી શકે",
  shortPhone: "પૂરો 10 આંકડાનો મોબાઇલ નંબર લખો, જેમ કે 98765 43210",
  needDescription: "સમસ્યાની વિગત લખો, જેથી સુપરવાઇઝરને ખબર પડે કે શું સુધારવાનું છે",
  tooManyPhotos: (max: number) => `વધુમાં વધુ ${max} ફોટા ઉમેરો`,

  // Submit failure banner
  routingFailedTitle: "આ ફરિયાદ હજી મોકલી શકાતી નથી",
  raiseFailedTitle: "ફરિયાદ નોંધાઈ નથી",
  raiseFailedNext: "તમે ભરેલી માહિતી અહીં જ છે. ફરી પ્રયાસ કરો.",
  chooseAnotherSite: "બીજી સાઇટ પસંદ કરો",
  openSite: "સાઇટ ખોલો",

  // Site field
  routingHint: (supervisor: string, site: string) =>
    `આ ફરિયાદ ${site} ના સુપરવાઇઝર ${supervisor} ને જશે.`,
  sitePlaceholder: "સાઇટ પસંદ કરો",
  siteSearch: "સાઇટ શોધો",
  siteNoMatch: "આ નામની કોઈ સાઇટ મળી નથી. બીજું નામ લખીને શોધો.",
  /**
   * At most two lines in the half-width site field (pending banner
   * rule 1). Someone who can edit sites reads the cause, and the "Open
   * site" button beside it is the next step. Anyone else has no button,
   * so the next step is in the sentence.
   */
  noSupervisorAdmin: (site: string) =>
    `${site} માટે સુપરવાઇઝર નથી, તેથી ફરિયાદ કોઈને નહીં પહોંચે.`,
  noSupervisorOthers: (site: string) =>
    `${site} માટે સુપરવાઇઝર નથી, તેથી ફરિયાદ નહીં પહોંચે. બીજી સાઇટ પસંદ કરો.`,

  // Category field
  categoryPlaceholder: "ફરિયાદનો પ્રકાર પસંદ કરો",
  categorySearch: "ફરિયાદનો પ્રકાર શોધો",
  categoryNoMatch: "આ નામનો કોઈ ફરિયાદનો પ્રકાર મળ્યો નથી. બીજું નામ લખીને શોધો.",

  // Exact place field
  locationNoteHint:
    "જરૂરી નથી. મકાન, રૂમ કે કોઈ નિશાની લખો, જેથી સુપરવાઇઝરને જગ્યા તરત મળી જાય.",
  locationNotePlaceholder: "જેમ કે: મુખ્ય દરવાજાની પાછળ, પાણીની ટાંકી પાસે",

  // Raised on someone else's behalf
  onBehalfOf: (name: string) => `તમે આ ફરિયાદ ${name} વતી નોંધાવી રહ્યા છો.`,
  theComplainant: "ફરિયાદી",

  // Footer
  cancel: "રદ કરો",
  submit: "ફરિયાદ નોંધાવો",
  submitting: "ફરિયાદ નોંધાઈ રહી છે…",
  noSupervisorReason: (site: string | undefined) =>
    `${site ?? "આ સાઇટ"} માટે હજી કોઈ સુપરવાઇઝર નથી, તેથી આ ફરિયાદ કોઈને પહોંચશે નહીં. બીજી સાઇટ પસંદ કરો.`,
}

/**
 * The leave warning, in its create wording: nothing exists until the
 * complaint is submitted, and there is no draft to save
 * (KIT-PENDING-leave-warning.md).
 */
const GU_UNSAVED: UnsavedChangesText = {
  title: "આ ફરિયાદ છોડી દેવી છે?",
  description: "તમે ભરેલી માહિતી જતી રહેશે.",
  stay: "ભરવાનું ચાલુ રાખો",
  leave: "છોડી દો",
}

/** The photo upload's own words (it stays English on other screens). */
const GU_UPLOAD: FileUploadText = {
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

interface Values {
  siteId: string
  categoryId: string
  complainantName: string
  complainantPhone: string
  locationNote: string
  description: string
}

type FieldKey = keyof Values | "photos"

function digits(text: string) {
  return text.replace(/\D/g, "")
}

function validate(key: FieldKey, values: Values, photos: FileUploadItem[]): string | null {
  switch (key) {
    case "siteId":
      return values.siteId ? null : GU.needSite
    case "categoryId":
      return values.categoryId ? null : GU.needCategory
    case "complainantName":
      return values.complainantName.trim() ? null : GU.needName
    case "complainantPhone": {
      const d = digits(values.complainantPhone)
      if (!d) return GU.needPhone
      return d.length >= 10 ? null : GU.shortPhone
    }
    case "description":
      return values.description.trim() ? null : GU.needDescription
    case "photos":
      return photos.length > MAX_PHOTOS ? GU.tooManyPhotos(MAX_PHOTOS) : null
    default:
      return null
  }
}

const ORDER: FieldKey[] = [
  "siteId",
  "categoryId",
  "complainantName",
  "complainantPhone",
  "description",
  "photos",
]

export function RaiseComplaintForm() {
  const router = useRouter()
  const { user } = useSession()
  const masters = useComplaintMasters({ activeOnly: true })
  /**
   * Only someone allowed to change a site's people may set its supervisor
   * (the API refuses anyone else, and the site form disables the field
   * for them), so only they are offered the way there.
   */
  const canEditSites = useCan("budget.sites.change_people") === true

  const initial = React.useMemo<Values>(
    () => ({
      siteId: "",
      categoryId: "",
      complainantName: user?.name ?? "",
      complainantPhone: user?.phone ?? "",
      locationNote: "",
      description: "",
    }),
    [user],
  )
  const [values, setValues] = React.useState<Values>(initial)
  const [photos, setPhotos] = React.useState<FileUploadItem[]>([])
  const [errors, setErrors] = React.useState<Partial<Record<FieldKey, string>>>({})
  const [saving, setSaving] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [failure, setFailure] = React.useState<{ message: string; routing: boolean } | null>(null)
  const bannerRef = React.useRef<HTMLDivElement>(null)

  const unsaved = useUnsavedChanges({
    changed: !done && (isChanged(values, initial) || photos.length > 0),
    noun: "complaint",
    mode: "create",
    text: GU_UNSAVED,
  })

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setFailure((f) => (f?.routing && key === "siteId" ? null : f))
  }
  const blur = (key: FieldKey) => () =>
    setErrors((e) => ({ ...e, [key]: validate(key, values, photos) ?? undefined }))

  // ---- options ------------------------------------------------------
  // Sites arrive ordered by name. The picker has one line per option, so
  // the site's location is not shown beside its name.
  const sites = React.useMemo(() => masters.sites ?? [], [masters.sites])
  const siteOptions = React.useMemo(
    () => sites.map((s) => ({ value: s.id, label: s.name })),
    [sites],
  )
  const categories = masters.categories ?? []
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  const site: ComplaintSiteOption | undefined = sites.find((s) => s.id === values.siteId)

  // ---- submit -------------------------------------------------------
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    const next: Partial<Record<FieldKey, string>> = {}
    for (const key of ORDER) {
      const message = validate(key, values, photos)
      if (message) next[key] = message
    }
    setErrors(next)
    const first = ORDER.find((key) => next[key])
    if (first) {
      // 39.3: after a failed save, focus goes to the first error.
      document.getElementById(`raise-${first}`)?.focus()
      return
    }

    setSaving(true)
    setFailure(null)
    try {
      const detail = await complaintsApi.raise(
        {
          siteId: values.siteId,
          categoryId: values.categoryId,
          complainantName: values.complainantName.trim(),
          complainantPhone: values.complainantPhone.trim(),
          locationNote: values.locationNote.trim() || undefined,
          description: values.description.trim(),
        },
        filesToSend(photos),
      )
      setDone(true)
      router.push(`/complaints/${detail.id}?raised=1`)
    } catch (caught) {
      const routing = caught instanceof ApiError && caught.status === 422
      setFailure({ message: errorMessage(caught), routing })
      setSaving(false)
      // Scroll the form's own scroller to the banner, never the page
      // frame around it (scrollIntoView would move every ancestor).
      window.requestAnimationFrame(() => {
        const banner = bannerRef.current
        const scroller = banner?.closest<HTMLElement>("[data-slot=form-scroll-area]")
        if (banner && scroller) {
          const top = banner.getBoundingClientRect().top - scroller.getBoundingClientRect().top
          scroller.scrollTo({ top: scroller.scrollTop + top - 16, behavior: "smooth" })
        }
      })
    }
  }

  if (masters.error) {
    return (
      <FormFrame>
        <FormScrollArea>
          <div className="mx-auto w-full max-w-content-max p-6 max-sm:px-4">
            <EmptyState
              variant="failed"
              heading={GU.loadFailedHeading}
              actionLabel={GU.tryAgain}
              onAction={masters.retry}
            >
              {masters.error} {GU.loadFailedNothingSaved}
            </EmptyState>
          </div>
        </FormScrollArea>
      </FormFrame>
    )
  }

  const noSupervisor = site !== undefined && !site.canReceive
  const busy = saving || isBusy(photos)

  return (
    <form onSubmit={submit} noValidate className="h-full">
      {unsaved.warning}
      <FormFrame>
        <FormScrollArea>
          <div className="mx-auto w-full max-w-content-max p-6 max-sm:px-4">
            <RecordBreadcrumb
              trail={[{ label: "Complaints", href: "/complaints" }]}
              current={GU.title}
              label={GU.breadcrumbLabel}
            />
            <PageHeader className="mt-4" title={GU.title} meta={GU.meta} />

            <div ref={bannerRef}>
              {/* Pending banner rule 4: one banner per page. While the
                  site has no supervisor, its banner in the site field is
                  the one that matters, and Submit cannot be pressed. */}
              {failure && !noSupervisor ? (
                <Banner variant="danger" className="mt-6">
                  <CircleAlertIcon />
                  <BannerTitle>
                    {failure.routing ? GU.routingFailedTitle : GU.raiseFailedTitle}
                  </BannerTitle>
                  <BannerDescription>
                    {failure.message}
                    {failure.routing ? null : ` ${GU.raiseFailedNext}`}
                  </BannerDescription>
                  {failure.routing ? (
                    <BannerAction className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => document.getElementById("raise-siteId")?.focus()}
                      >
                        {GU.chooseAnotherSite}
                      </Button>
                      {canEditSites && values.siteId ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/sites/${values.siteId}/edit`} />}
                        >
                          {GU.openSite}
                        </Button>
                      ) : null}
                    </BannerAction>
                  ) : null}
                </Banner>
              ) : null}
            </div>

            {masters.loading ? (
              <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-control w-full max-w-field-max" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-12 gap-6">
                <FormField
                  span={6}
                  label="સાઇટ"
                  required
                  htmlFor="raise-siteId"
                  error={errors.siteId}
                  hint={
                    site?.canReceive && site.supervisor
                      ? GU.routingHint(site.supervisor.name, site.name)
                      : undefined
                  }
                >
                  <Choice
                    id="raise-siteId"
                    options={siteOptions}
                    value={values.siteId}
                    onValueChange={(v) => {
                      set("siteId", v)
                      setErrors((e) => ({ ...e, siteId: undefined }))
                    }}
                    onBlur={blur("siteId")}
                    invalid={Boolean(errors.siteId)}
                    placeholder={GU.sitePlaceholder}
                    searchPlaceholder={GU.siteSearch}
                    emptyMessage={GU.siteNoMatch}
                    className="max-w-none sm:max-w-field-max"
                  />
                  {/* Pending banner rule 3: it explains the disabled Submit,
                      so it has no close. All Gujarati, built here; the
                      server's English sentence is not shown. */}
                  {noSupervisor ? (
                    <Banner variant="warning" layout="line" className="mt-2">
                      <TriangleAlertIcon />
                      <BannerDescription wrap>
                        {canEditSites
                          ? GU.noSupervisorAdmin(site.name)
                          : GU.noSupervisorOthers(site.name)}
                      </BannerDescription>
                      {canEditSites ? (
                        <BannerAction>
                          <Button
                            variant="secondary"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/sites/${site.id}/edit`} />}
                          >
                            {GU.openSite}
                          </Button>
                        </BannerAction>
                      ) : null}
                    </Banner>
                  ) : null}
                </FormField>

                <FormField
                  span={6}
                  label="ફરિયાદનો પ્રકાર"
                  required
                  htmlFor="raise-categoryId"
                  error={errors.categoryId}
                >
                  <Choice
                    id="raise-categoryId"
                    options={categoryOptions}
                    value={values.categoryId}
                    onValueChange={(v) => {
                      set("categoryId", v)
                      setErrors((e) => ({ ...e, categoryId: undefined }))
                    }}
                    onBlur={blur("categoryId")}
                    invalid={Boolean(errors.categoryId)}
                    placeholder={GU.categoryPlaceholder}
                    searchPlaceholder={GU.categorySearch}
                    emptyMessage={GU.categoryNoMatch}
                    className="max-w-none sm:max-w-field-max"
                  />
                </FormField>

                <FormField
                  span={12}
                  label="ચોક્કસ જગ્યા"
                  htmlFor="raise-locationNote"
                  hint={GU.locationNoteHint}
                >
                  <Textarea
                    id="raise-locationNote"
                    rows={2}
                    value={values.locationNote}
                    onChange={(e) => set("locationNote", e.target.value)}
                    onKeyDown={ctrlEnterSaves}
                    placeholder={GU.locationNotePlaceholder}
                    className={PHONE_TEXT}
                  />
                </FormField>

                <FormField
                  span={12}
                  label="ફરિયાદની વિગત"
                  required
                  htmlFor="raise-description"
                  error={errors.description}
                >
                  <Textarea
                    id="raise-description"
                    rows={4}
                    value={values.description}
                    aria-invalid={Boolean(errors.description) || undefined}
                    onChange={(e) => set("description", e.target.value)}
                    onBlur={blur("description")}
                    onKeyDown={ctrlEnterSaves}
                    className={PHONE_TEXT}
                  />
                </FormField>

                <FormField
                  span={6}
                  label="ફરિયાદીનું નામ"
                  required
                  htmlFor="raise-complainantName"
                  error={errors.complainantName}
                >
                  <Input
                    id="raise-complainantName"
                    autoComplete="name"
                    value={values.complainantName}
                    aria-invalid={Boolean(errors.complainantName) || undefined}
                    onChange={(e) => set("complainantName", e.target.value)}
                    onBlur={blur("complainantName")}
                    className={cn(PHONE_TEXT, "max-sm:max-w-none")}
                  />
                </FormField>
                <FormField
                  span={4}
                  label="ફરિયાદીનો મોબાઇલ નંબર"
                  required
                  htmlFor="raise-complainantPhone"
                  error={errors.complainantPhone}
                >
                  <Input
                    id="raise-complainantPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={values.complainantPhone}
                    aria-invalid={Boolean(errors.complainantPhone) || undefined}
                    onChange={(e) => set("complainantPhone", e.target.value)}
                    onBlur={blur("complainantPhone")}
                    className={cn(PHONE_TEXT, "max-sm:max-w-none")}
                  />
                </FormField>
                {user && values.complainantName.trim() !== user.name ? (
                  <p className="col-span-12 -mt-4 flex items-center gap-1 text-label text-text-secondary">
                    <UserIcon className="size-4" aria-hidden="true" />
                    {GU.onBehalfOf(values.complainantName.trim() || GU.theComplainant)}
                  </p>
                ) : null}

                <FormField
                  span={12}
                  label="સમસ્યાના ફોટા"
                  htmlFor="raise-photos"
                  error={errors.photos}
                >
                  <FileUpload
                    id="raise-photos"
                    value={photos}
                    onChange={(next) => {
                      setPhotos(next)
                      setErrors((e) => ({ ...e, photos: undefined }))
                    }}
                    accept="image/jpeg,image/png,image/webp"
                    maxFiles={MAX_PHOTOS}
                    maxBytes={MAX_PHOTO_BYTES}
                    capture="environment"
                    noun={{ one: "photo", many: "photos" }}
                    text={GU_UPLOAD}
                    disabled={saving}
                    invalid={Boolean(errors.photos)}
                  />
                </FormField>
              </div>
            )}
          </div>
        </FormScrollArea>

        <FormFooter className="max-sm:[&>div]:grid max-sm:[&>div]:grid-cols-2 max-sm:[&>div]:px-4">
          {/* A link, so leaving with unsaved entries asks first (11.3.10). */}
          <Button
            variant="secondary"
            size="lg"
            nativeButton={false}
            render={<Link href="/complaints" />}
            className="max-sm:w-full"
          >
            {GU.cancel}
          </Button>
          <PermissionTooltip
            allowed={!noSupervisor}
            reason={GU.noSupervisorReason(site?.name)}
          >
            <Button
              type="submit"
              size="lg"
              disabled={busy || masters.loading || noSupervisor}
              className="max-sm:w-full"
            >
              {saving ? GU.submitting : GU.submit}
            </Button>
          </PermissionTooltip>
        </FormFooter>
      </FormFrame>
    </form>
  )
}
