"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ImageOffIcon,
  RefreshCwIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"
import { complaintsApi, useAuthPhoto, type ComplaintPhoto } from "@/lib/complaints-api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The photos on a complaint: thumbnails, and a viewer that opens one
 * large. Every photo is behind the bearer token, so each one is fetched
 * and shown from a blob URL (`useAuthPhoto`), never an `<img src>` to
 * the API.
 *
 * No dead ends: a photo that fails to load says so and offers Retry,
 * and the viewer always offers Download.
 */
export function PhotoGrid({
  complaintId,
  photos,
  label,
}: {
  complaintId: string
  photos: ComplaintPhoto[]
  /** "Photo from the raise", used in each thumbnail's accessible name. */
  label: string
}) {
  const [open, setOpen] = React.useState<number | null>(null)

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {photos.map((photo, index) => (
          <li key={photo.id} className="min-w-0">
            <Thumbnail
              complaintId={complaintId}
              photo={photo}
              label={`${label} ${index + 1} of ${photos.length}`}
              onOpen={() => setOpen(index)}
            />
          </li>
        ))}
      </ul>
      {open !== null ? (
        <PhotoViewer
          complaintId={complaintId}
          photos={photos}
          index={open}
          label={label}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}

function Thumbnail({
  complaintId,
  photo,
  label,
  onOpen,
}: {
  complaintId: string
  photo: ComplaintPhoto
  label: string
  onOpen: () => void
}) {
  const [attempt, setAttempt] = React.useState(0)
  const state = useAuthPhoto(complaintsApi.photoPath(complaintId, photo.id), attempt)

  if (state.status === "failed") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-sunken p-2 text-center">
        <ImageOffIcon className="size-4 text-text-secondary" aria-hidden="true" />
        <span className="text-meta text-text-secondary">Photo not loaded</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
          <RefreshCwIcon />
          Retry
        </Button>
      </div>
    )
  }

  if (state.status === "loading") {
    return <Skeleton className="block aspect-square w-full rounded-lg" />
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${label}`}
      className={cn(
        "tap-area block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border border-border-light bg-surface-sunken",
        "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
      )}
    >
      {/* A blob URL: next/image cannot optimise it and must not try. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.url} alt={label} className="size-full object-cover" />
    </button>
  )
}

/**
 * One photo, large, with previous and next. Full screen on a phone
 * (the agreed field-screen exception), the large 800px dialog above it.
 */
function PhotoViewer({
  complaintId,
  photos,
  index,
  label,
  onIndexChange,
  onClose,
}: {
  complaintId: string
  photos: ComplaintPhoto[]
  index: number
  label: string
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const photo = photos[index]
  const [attempt, setAttempt] = React.useState(0)
  const state = useAuthPhoto(complaintsApi.photoPath(complaintId, photo.id), attempt)
  const many = photos.length > 1

  const go = (step: number) => onIndexChange((index + step + photos.length) % photos.length)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        size="lg"
        className="max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none"
        onKeyDown={(event) => {
          if (!many) return
          if (event.key === "ArrowRight") go(1)
          if (event.key === "ArrowLeft") go(-1)
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {label} {index + 1} of {photos.length}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <DialogDescription>
            Added by {photo.uploadedBy.name} on {formatDateTime(photo.uploadedAt)}
          </DialogDescription>
          <div className="flex min-h-64 flex-1 items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
            {state.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.url}
                alt={`${label} ${index + 1}`}
                className="max-h-[60vh] w-full object-contain max-sm:max-h-[70dvh]"
              />
            ) : state.status === "failed" ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-body text-text-secondary">{state.message}</p>
                <Button type="button" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
                  <RefreshCwIcon />
                  Try again
                </Button>
              </div>
            ) : (
              <Skeleton className="block h-64 w-full" />
            )}
          </div>
        </div>
        <DialogFooter className="max-sm:flex-wrap">
          {many ? (
            <span className="mr-auto flex gap-2">
              <NavButton label="Previous photo" onClick={() => go(-1)}>
                <ChevronLeftIcon />
              </NavButton>
              <NavButton label="Next photo" onClick={() => go(1)}>
                <ChevronRightIcon />
              </NavButton>
            </span>
          ) : null}
          {state.status === "ready" ? (
            <Button
              variant="secondary"
              nativeButton={false}
              render={
                <a
                  href={state.url}
                  download={`complaint-photo-${index + 1}.${extensionFor(photo.contentType)}`}
                />
              }
            >
              <DownloadIcon />
              Download photo
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png"
  if (contentType.includes("webp")) return "webp"
  return "jpg"
}
