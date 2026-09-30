"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlertIcon, TriangleAlertIcon, UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { api, ApiError, type Location, type Person } from "@/lib/api"
import { complaintsApi, type ComplaintCategory } from "@/lib/complaints-api"
import { errorMessage, useSession } from "@/components/shell/session"
import { Banner, BannerAction, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { FileUpload, filesToSend, isBusy, type FileUploadItem } from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ctrlEnterSaves } from "@/components/ui/keyboard-shortcuts"
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import {
  FormField,
  FormFooter,
  FormFrame,
  FormScrollArea,
  FormSection,
} from "@/components/templates/form-page"
import { PageHeader } from "@/components/templates/page"
import { Choice } from "@/components/complaints/choice"
import { useComplaintMasters } from "@/components/complaints/use-masters"

/**
 * `/complaints/new` — the raise form (section 11.3, and the agreed
 * phone exception: single column below 640px, full-width controls,
 * 16px inputs, the camera one tap away).
 *
 * The contract's fields in the partner's own order: location, category,
 * complainant name and phone (prefilled from the signed-in person and
 * editable), a note on where exactly, the description, and up to three
 * photos.
 *
 * Routing is decided by the server at raise time. The form previews it
 * from the location row (its supervisor), so a location with nobody to
 * send to is flagged BEFORE the person types a paragraph, and the
 * server's 422 is still shown as a banner with a way forward if the
 * picture changed in between.
 */

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
/** Phones: 16px text so iOS does not zoom into the field (agreed exception). */
const PHONE_TEXT = "max-sm:text-base"

interface Values {
  locationId: string
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
    case "locationId":
      return values.locationId ? null : "Choose the location the complaint is about"
    case "categoryId":
      return values.categoryId ? null : "Choose the kind of complaint"
    case "complainantName":
      return values.complainantName.trim() ? null : "Enter the name of the person complaining"
    case "complainantPhone": {
      const d = digits(values.complainantPhone)
      if (!d) return "Enter a phone number the supervisor can call"
      return d.length >= 10 ? null : "Enter the full 10-digit phone number, like 98765 43210"
    }
    case "description":
      return values.description.trim()
        ? null
        : "Describe the problem, so the supervisor knows what to fix"
    case "photos":
      return photos.length > MAX_PHOTOS ? `Add at most ${MAX_PHOTOS} photos` : null
    default:
      return null
  }
}

const ORDER: FieldKey[] = [
  "locationId",
  "categoryId",
  "complainantName",
  "complainantPhone",
  "description",
  "photos",
]

export function RaiseComplaintForm() {
  const router = useRouter()
  const { user, can } = useSession()
  const masters = useComplaintMasters({ activeOnly: true })

  // The signed-in person's own locations come first in the picker.
  const [mine, setMine] = React.useState<string[]>([])
  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .get<Person>(`/users/${user.id}`)
      .then((person) => {
        if (!cancelled) setMine(person.locations.map((l) => l.id))
      })
      .catch(() => {
        // Ordering only. The picker still lists every location.
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const initial = React.useMemo<Values>(
    () => ({
      locationId: "",
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
  })

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setFailure((f) => (f?.routing && key === "locationId" ? null : f))
  }
  const blur = (key: FieldKey) => () =>
    setErrors((e) => ({ ...e, [key]: validate(key, values, photos) ?? undefined }))

  // ---- options ------------------------------------------------------
  const locations = React.useMemo(() => masters.locations ?? [], [masters.locations])
  const locationOptions = React.useMemo(() => {
    const own = locations.filter((l) => mine.includes(l.id))
    const rest = locations.filter((l) => !mine.includes(l.id))
    return [...own, ...rest].map((l) => ({
      value: l.id,
      label: mine.includes(l.id) ? `${l.name} (your location)` : l.name,
    }))
  }, [locations, mine])
  const categories = masters.categories ?? []
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  const location: Location | undefined = locations.find((l) => l.id === values.locationId)
  const category: ComplaintCategory | undefined = categories.find(
    (c) => c.id === values.categoryId,
  )

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
          locationId: values.locationId,
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
            <EmptyState variant="failed" heading="The form could not be loaded" onAction={masters.retry}>
              {masters.error} Nothing has been saved.
            </EmptyState>
          </div>
        </FormScrollArea>
      </FormFrame>
    )
  }

  const noSupervisor = location !== undefined && location.supervisor === null
  const busy = saving || isBusy(photos)

  return (
    <form onSubmit={submit} noValidate className="h-full">
      {unsaved.warning}
      <FormFrame>
        <FormScrollArea>
          <div className="mx-auto w-full max-w-content-max p-6 max-sm:px-4">
            <RecordBreadcrumb trail={[{ label: "Complaints", href: "/complaints" }]} current="Raise complaint" />
            <PageHeader
              className="mt-4"
              title="Raise complaint"
              meta="It goes straight to the supervisor of the location, with a copy to their manager, the HOD and the CEO."
            />

            <div ref={bannerRef}>
              {failure ? (
                <Banner variant="danger" className="mt-6">
                  <CircleAlertIcon />
                  <BannerTitle>
                    {failure.routing ? "This complaint cannot be sent yet" : "The complaint was not raised"}
                  </BannerTitle>
                  <BannerDescription>
                    {failure.message}
                    {failure.routing ? null : " Your entries are still here. Try again."}
                  </BannerDescription>
                  {failure.routing ? (
                    <BannerAction className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => document.getElementById("raise-locationId")?.focus()}
                      >
                        Choose another location
                      </Button>
                      {can.platformAdmin ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={<Link href="/settings/locations" />}
                        >
                          Open location settings
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
              <>
                <FormSection label="Where and what" className="mt-8">
                  <FormField
                    span={6}
                    label="Location"
                    required
                    htmlFor="raise-locationId"
                    error={errors.locationId}
                    hint={
                      location?.supervisor
                        ? `Goes to ${location.supervisor.name}, the supervisor at ${location.name}.`
                        : mine.length > 0
                          ? "Your own locations are listed first."
                          : undefined
                    }
                  >
                    <Choice
                      id="raise-locationId"
                      options={locationOptions}
                      value={values.locationId}
                      onValueChange={(v) => {
                        set("locationId", v)
                        setErrors((e) => ({ ...e, locationId: undefined }))
                      }}
                      onBlur={blur("locationId")}
                      invalid={Boolean(errors.locationId)}
                      placeholder="Choose a location"
                      searchPlaceholder="Search locations"
                      className="max-w-none sm:max-w-field-max"
                    />
                    {noSupervisor ? (
                      <Banner variant="warning" className="mt-2">
                        <TriangleAlertIcon />
                        <BannerTitle>{location.name} has no supervisor yet</BannerTitle>
                        <BannerDescription>
                          A complaint here would reach nobody.{" "}
                          {can.platformAdmin
                            ? "Assign a supervisor in Settings, Locations, then raise it."
                            : "Ask an administrator to assign one, or choose another location."}
                        </BannerDescription>
                      </Banner>
                    ) : null}
                  </FormField>

                  <FormField
                    span={6}
                    label="Category"
                    required
                    htmlFor="raise-categoryId"
                    error={errors.categoryId}
                    hint={
                      category
                        ? category.requiresApproval
                          ? `Closing it needs approval from ${article(category.approverDesignation?.name ?? "HOD")}.`
                          : "The supervisor's fix closes it directly."
                        : undefined
                    }
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
                      placeholder="Choose a category"
                      searchPlaceholder="Search categories"
                      className="max-w-none sm:max-w-field-max"
                    />
                  </FormField>

                  <FormField
                    span={12}
                    label="Where exactly"
                    htmlFor="raise-locationNote"
                    hint="Optional. The building, room or landmark, so the supervisor finds it first time."
                  >
                    <Textarea
                      id="raise-locationNote"
                      rows={2}
                      value={values.locationNote}
                      onChange={(e) => set("locationNote", e.target.value)}
                      onKeyDown={ctrlEnterSaves}
                      placeholder="For example: behind the main gate, near the water tank"
                      className={PHONE_TEXT}
                    />
                  </FormField>

                  <FormField
                    span={12}
                    label="Description"
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
                </FormSection>

                <FormSection
                  label="Complainant"
                  description="Filled in with your details. Change them if you are raising this for someone else."
                >
                  <FormField
                    span={6}
                    label="Name"
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
                    label="Phone number"
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
                      Raised by you, on behalf of {values.complainantName.trim() || "the complainant"}.
                    </p>
                  ) : null}
                </FormSection>

                <FormSection label="Photos" description="Optional. A photo helps the supervisor see the problem before they arrive.">
                  <FormField
                    span={12}
                    label="Photos of the problem"
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
                      disabled={saving}
                      invalid={Boolean(errors.photos)}
                    />
                  </FormField>
                </FormSection>
              </>
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
            Cancel
          </Button>
          <PermissionTooltip
            allowed={!noSupervisor}
            reason={`${location?.name ?? "This location"} has no supervisor yet, so this complaint would reach nobody. Choose another location.`}
          >
            <Button
              type="submit"
              size="lg"
              disabled={busy || masters.loading || noSupervisor}
              className="max-sm:w-full"
            >
              {saving ? "Raising…" : "Raise complaint"}
            </Button>
          </PermissionTooltip>
        </FormFooter>
      </FormFrame>
    </form>
  )
}

/** "an HOD", "a Manager", "the CEO". */
function article(designation: string): string {
  if (/^ceo$/i.test(designation)) return "the CEO"
  return /^[aeiou]|^h(od)/i.test(designation) ? `an ${designation}` : `a ${designation}`
}
