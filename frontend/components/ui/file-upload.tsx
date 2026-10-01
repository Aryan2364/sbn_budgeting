"use client"

import * as React from "react"
import {
  CameraIcon,
  DownloadIcon,
  FileIcon,
  OctagonXIcon,
  RotateCwIcon,
  UploadIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Truncate } from "@/components/ui/truncate"

/**
 * Section 29: file uploads and attachments.
 *
 *   - A bordered drop zone with a browse button inside it. Dragging and
 *     clicking both work.
 *   - The accepted types and the size limit are stated BEFORE the user
 *     tries ("JPG or PNG. Up to 5 MB each.").
 *   - Each file is a row: name (truncated, section 8), size, a remove
 *     button and a download link. Images show a small preview, other
 *     types a file icon.
 *   - Progress shows on the row, never as a page-wide overlay.
 *   - A failed file stays in the list in the danger colour with Retry.
 *     It never vanishes silently.
 *   - Removing a SAVED file follows section 15 (a confirmation). An
 *     unsaved file is removed at once.
 *
 * CONTROLLED. The caller owns the list (`value` / `onChange`) because the
 * files usually travel with the form they belong to - a complaint's
 * photos are posted with the complaint, as one multipart request. The
 * caller may also write `status: "uploading"` with a `progress`, or
 * `status: "failed"` with an `error`, onto an item while it sends it,
 * and the row shows it. `onRetry` is then called for that row.
 *
 * PHOTOS ARE COMPRESSED IN THE BROWSER. A phone camera photo is 3-8 MB;
 * each image is redrawn on a canvas at most 1600px on its long edge as a
 * JPEG at quality 0.8 (usually 200-500 KB) before it is added, so the
 * size limit applies to what is actually sent. Turn it off with
 * `compressImages={false}`.
 *
 * PHONE CAMERA (agreed exception to section 9 for the complaint field
 * screens): `capture` adds a "Take photo" button on touch screens, which
 * opens the camera directly. "Choose photos" stays beside it, because
 * `capture` alone removes the gallery on Android.
 */

type FileUploadStatus = "processing" | "ready" | "uploading" | "failed" | "saved"

type FileUploadItem = {
  /** Stable id for the row. The component makes one for files it adds. */
  id: string
  name: string
  /** Bytes. */
  size: number
  /** MIME type, e.g. "image/jpeg". */
  type: string
  /**
   * The local file, for an item that is not saved yet. After compression
   * this is the compressed JPEG, which is what should be sent.
   */
  file?: File
  /** A saved file's address, for its download link. */
  url?: string
  /**
   * A saved image's preview address - an authenticated blob URL the
   * caller loaded, for instance. Local files make their own.
   */
  previewUrl?: string
  status: FileUploadStatus
  /** 0 to 1, while `status` is "uploading". */
  progress?: number
  /** Cause, then next action (7.2), while `status` is "failed". */
  error?: string
  /**
   * Set by the component when the file failed HERE (it could not be read
   * as a photo, or is over the limit even after compression). Retry then
   * prepares it again rather than calling `onRetry`, and it is never
   * sent. The caller leaves it alone.
   */
  failedLocally?: boolean
}

type Noun = { one: string; many: string }

const DEFAULT_NOUN: Noun = { one: "file", many: "files" }

/**
 * Every word the component shows, so a screen in another language can
 * pass its own (the complaint raise form passes Gujarati). Each key is
 * optional on the `text` prop; anything not passed keeps the English
 * below. Sizes arrive already formatted ("5 MB"), type names already
 * joined by `typeList`.
 */
type FileUploadText = {
  /** The accepted type names joined: "JPG or PNG", "JPG, PNG or PDF". */
  typeList: (names: string[]) => string
  /** The line under the zone: "JPG or PNG. Up to 5 MB each. 3 photos at most." */
  limits: (p: { types: string | null; maxSize: string; maxFiles: number; noun: Noun }) => string
  /** The zone's line once the list is full. */
  full: (p: { count: number; maxFiles: number; noun: Noun }) => string
  /** Pointer screens: "Drag photos here, or choose them." */
  drag: (p: { maxFiles: number; noun: Noun }) => string
  /** Touch screens: "Take a photo or choose photos." / "Choose photos." */
  touch: (p: { maxFiles: number; noun: Noun; camera: boolean }) => string
  /** The camera button: "Take photo". */
  takeButton: (p: { noun: Noun }) => string
  /** The browse button: "Choose photos". */
  chooseButton: (p: { maxFiles: number; noun: Noun }) => string
  /** A photo the browser could not decode. */
  unreadable: (p: { name: string }) => string
  /** A file over the size limit. */
  tooLarge: (p: { name: string; size: string; maxSize: string; noun: Noun }) => string
  /** A file of a type the zone does not take. */
  wrongType: (p: { name: string; types: string | null; noun: Noun }) => string
  /** A file past the most the list may hold. */
  tooMany: (p: { name: string; maxFiles: number; noun: Noun }) => string
  /** Row status while a file is compressed: "Preparing photo". */
  preparing: (p: { noun: Noun }) => string
  /** Row status while the caller sends it: "Uploading, 40%". */
  uploading: (p: { percent: number }) => string
  /** A row the caller failed without giving an error. */
  uploadFailed: (p: { name: string }) => string
  retry: string
  /** The download button's tooltip. */
  download: string
  /** The download button's accessible name. */
  downloadLabel: (p: { name: string }) => string
  remove: string
  /** The remove button's accessible name. */
  removeLabel: (p: { name: string }) => string
  /** Confirmation for removing a SAVED file. */
  confirmTitle: (p: { noun: Noun }) => string
  confirmBody: (p: { name: string; context?: string }) => string
  confirmCancel: string
  confirmAction: (p: { noun: Noun }) => string
}

/** "a photo", "an image": the one-file wording (37.5 singular/plural). */
const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`
const pluralFor = (maxFiles: number, noun: Noun) => (maxFiles === 1 ? noun.one : noun.many)

const DEFAULT_TEXT: FileUploadText = {
  typeList: (names) =>
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`,
  limits: ({ types, maxSize, maxFiles, noun }) =>
    [
      types ? `${types}.` : null,
      `Up to ${maxSize} ${maxFiles === 1 ? "" : "each"}`.trim() + ".",
      maxFiles > 1 ? `${maxFiles} ${noun.many} at most.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  full: ({ count, maxFiles, noun }) =>
    `${count} of ${maxFiles} ${pluralFor(maxFiles, noun)} added. Remove one to add another.`,
  drag: ({ maxFiles, noun }) =>
    maxFiles === 1
      ? `Drag ${withArticle(noun.one)} here, or choose one.`
      : `Drag ${pluralFor(maxFiles, noun)} here, or choose them.`,
  touch: ({ maxFiles, noun, camera }) =>
    camera
      ? `Take ${withArticle(noun.one)} or choose ${maxFiles === 1 ? "one" : pluralFor(maxFiles, noun)}.`
      : `Choose ${maxFiles === 1 ? withArticle(noun.one) : pluralFor(maxFiles, noun)}.`,
  takeButton: ({ noun }) => `Take ${noun.one}`,
  chooseButton: ({ maxFiles, noun }) => `Choose ${pluralFor(maxFiles, noun)}`,
  unreadable: ({ name }) =>
    `${name} could not be read as a photo. Choose a JPG or PNG photo, or take it again.`,
  tooLarge: ({ name, size, maxSize, noun }) =>
    `${name} is ${size}, over the ${maxSize} limit. Choose a smaller ${noun.one}.`,
  wrongType: ({ name, types, noun }) =>
    `${name} is not ${types ? `a ${types}` : "an accepted type"}. Choose ${types ? `a ${types} ${noun.one}` : `another ${noun.one}`}.`,
  tooMany: ({ name, maxFiles, noun }) =>
    `${name} was not added: ${maxFiles} ${pluralFor(maxFiles, noun)} is the most. Remove one to add another.`,
  preparing: ({ noun }) => `Preparing ${noun.one}`,
  uploading: ({ percent }) => `Uploading, ${percent}%`,
  uploadFailed: ({ name }) => `${name} did not upload. Retry, or remove it.`,
  retry: "Retry",
  download: "Download",
  downloadLabel: ({ name }) => `Download ${name}`,
  remove: "Remove",
  removeLabel: ({ name }) => `Remove ${name}`,
  confirmTitle: ({ noun }) => `Remove ${noun.one}?`,
  confirmBody: ({ name, context }) =>
    `${name} will be removed${context ? ` from ${context}` : ""}. This cannot be undone.`,
  confirmCancel: "Cancel",
  confirmAction: ({ noun }) => `Remove ${noun.one}`,
}

/** Section 29 via the brief: at most 1600px on the long edge, JPEG ~0.8. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"])

const TYPE_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/heic": "HEIC",
  "image/*": "Images",
  "application/pdf": "PDF",
  ".pdf": "PDF",
  ".jpg": "JPG",
  ".jpeg": "JPG",
  ".png": "PNG",
  ".xlsx": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
}

/** "12 KB", "1.4 MB". Sizes are shown in the units people use for files. */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  // A whole number of MB reads as one ("5 MB"), never "5.0 MB".
  const shown = mb >= 10 || Number.isInteger(mb) ? String(Math.round(mb)) : mb.toFixed(1)
  return `${shown} MB`
}

function acceptList(accept: string | undefined) {
  return (accept ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

/** "JPG or PNG", "JPG, PNG or PDF". Unique names, in the order given. */
function describeTypes(accept: string | undefined, typeList: FileUploadText["typeList"]) {
  const names = [
    ...new Set(acceptList(accept).map((part) => TYPE_NAMES[part] ?? part.replace(/^\./, "").toUpperCase())),
  ]
  if (names.length === 0) return null
  return typeList(names)
}

function matchesAccept(file: File, accept: string | undefined) {
  const list = acceptList(accept)
  if (list.length === 0) return true
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return list.some((part) => {
    if (part.startsWith(".")) return name.endsWith(part)
    if (part.endsWith("/*")) return type.startsWith(part.slice(0, -1))
    return type === part
  })
}

let idCounter = 0
function makeId() {
  idCounter += 1
  return `upload-${Date.now().toString(36)}-${idCounter}`
}

/**
 * Redraws an image at most `maxEdge` px on its long edge as a JPEG.
 *
 * Exported so a screen that receives a File some other way can send the
 * same size of photo. EXIF orientation is applied by the browser when it
 * decodes (createImageBitmap's default is "from-image"), so a portrait
 * phone photo stays upright. Transparent PNG pixels would turn black in a
 * JPEG, so the canvas is filled white first. If the redrawn file comes
 * out LARGER than the original and no resize was needed (a small,
 * already-compressed JPEG), the original is kept.
 */
async function compressImage(
  file: File,
  { maxEdge = MAX_EDGE, quality = JPEG_QUALITY }: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no 2d context")
    // Canvas paint, not a CSS colour: the ground behind a transparent PNG.
    context.fillStyle = "white"
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    )
    if (!blob) throw new Error("encode failed")
    if (scale === 1 && file.type === "image/jpeg" && blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

/**
 * The local files to send, in list order: every prepared file, plus any
 * the caller marked failed while sending (they are sent again). A file
 * that failed here - unreadable, or over the limit - is never sent.
 */
function filesToSend(items: FileUploadItem[]) {
  return items.flatMap((item) =>
    item.file && (item.status === "ready" || (item.status === "failed" && !item.failedLocally))
      ? [item.file]
      : []
  )
}

/** True while any row is still being prepared or sent - disable Save. */
function isBusy(items: FileUploadItem[]) {
  return items.some((item) => item.status === "processing" || item.status === "uploading")
}

/** An object URL for a local file, revoked when the row goes away. */
function useObjectUrl(file: File | undefined) {
  // Keyed on the file it was made for, so a row whose file changes never
  // shows the previous (already revoked) address for a render.
  const [entry, setEntry] = React.useState<{ file: File; url: string } | null>(null)
  React.useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    let live = true
    // Published after the effect rather than inside it (no cascading
    // render); revoked when the row goes away or its file changes.
    void Promise.resolve().then(() => {
      if (live) setEntry({ file, url })
    })
    return () => {
      live = false
      URL.revokeObjectURL(url)
    }
  }, [file])
  return entry && entry.file === file ? entry.url : undefined
}

type FileUploadProps = {
  value: FileUploadItem[]
  onChange: (next: FileUploadItem[]) => void
  /** Same syntax as the input's accept: "image/jpeg,image/png", ".pdf". */
  accept?: string
  /** Most files the list may hold. Defaults to 10. */
  maxFiles?: number
  /** Per file, checked after compression. Defaults to 10 MB. */
  maxBytes?: number
  /** Add a "Take photo" button on touch screens that opens the camera. */
  capture?: "environment" | "user"
  /** Redraw images at 1600px / JPEG 0.8 before adding them. Defaults to true. */
  compressImages?: boolean
  /** The word for one file and several: { one: "photo", many: "photos" }. */
  noun?: Noun
  /** Replaces the generated "JPG or PNG. Up to 5 MB each." line. */
  description?: React.ReactNode
  /** Called when a row the caller marked failed is retried. */
  onRetry?: (item: FileUploadItem) => void
  /**
   * Called after a SAVED item has been confirmed for removal (section
   * 15). The item is already gone from `value` by then. Unsaved items
   * are removed without asking and without this call.
   */
  onRemoveSaved?: (item: FileUploadItem) => void
  /** What the confirmation says the saved file is removed from: "this complaint". */
  savedContext?: string
  /**
   * The component's own words, for a screen in another language. Keys
   * not given keep the English defaults. Pass a stable object (a module
   * constant), not one built on every render.
   */
  text?: Partial<FileUploadText>
  disabled?: boolean
  /** Marks the zone invalid - pass it with the form's own inline error. */
  invalid?: boolean
  /** Put on the browse button, so a Label's htmlFor reaches it. */
  id?: string
  "aria-describedby"?: string
  className?: string
}

function FileUpload({
  value,
  onChange,
  accept,
  maxFiles = 10,
  maxBytes = 10 * 1024 * 1024,
  capture,
  compressImages = true,
  noun = DEFAULT_NOUN,
  description,
  onRetry,
  onRemoveSaved,
  savedContext,
  text,
  disabled = false,
  invalid = false,
  id,
  "aria-describedby": describedBy,
  className,
}: FileUploadProps) {
  const t = React.useMemo<FileUploadText>(() => ({ ...DEFAULT_TEXT, ...text }), [text])
  const pickerRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const errorId = React.useId()
  const hintId = React.useId()
  const [dragging, setDragging] = React.useState(false)
  const [rejections, setRejections] = React.useState<string[]>([])
  const [confirming, setConfirming] = React.useState<FileUploadItem | null>(null)

  // The list changes while photos are still being compressed, so async
  // work reads the latest list here rather than the one it closed over.
  const valueRef = React.useRef(value)
  React.useEffect(() => {
    valueRef.current = value
  }, [value])
  const commit = React.useCallback(
    (next: FileUploadItem[]) => {
      valueRef.current = next
      onChange(next)
    },
    [onChange]
  )

  const full = value.length >= maxFiles
  const inert = disabled || full
  const types = describeTypes(accept, t.typeList)
  const generated = t.limits({ types, maxSize: formatBytes(maxBytes), maxFiles, noun })

  const prepare = React.useCallback(
    async (item: FileUploadItem, original: File) => {
      let prepared = original
      let error: string | undefined
      if (compressImages && COMPRESSIBLE.has(original.type)) {
        try {
          prepared = await compressImage(original)
        } catch {
          error = t.unreadable({ name: original.name })
        }
      }
      if (!error && prepared.size > maxBytes) {
        error = t.tooLarge({
          name: original.name,
          size: formatBytes(prepared.size),
          maxSize: formatBytes(maxBytes),
          noun,
        })
      }
      const current = valueRef.current
      if (!current.some((row) => row.id === item.id)) return // removed meanwhile
      commit(
        current.map((row) =>
          row.id === item.id
            ? error
              ? { ...row, status: "failed", error, file: original, failedLocally: true }
              : {
                  ...row,
                  status: "ready",
                  error: undefined,
                  failedLocally: undefined,
                  file: prepared,
                  name: prepared.name,
                  size: prepared.size,
                  type: prepared.type,
                }
            : row
        )
      )
    },
    [commit, compressImages, maxBytes, noun, t]
  )

  const addFiles = (list: FileList | File[]) => {
    const incoming = [...list]
    if (incoming.length === 0) return
    const problems: string[] = []
    const room = Math.max(0, maxFiles - valueRef.current.length)
    const accepted: File[] = []
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        problems.push(t.wrongType({ name: file.name, types, noun }))
      } else if (accepted.length >= room) {
        problems.push(t.tooMany({ name: file.name, maxFiles, noun }))
      } else if (!(compressImages && COMPRESSIBLE.has(file.type)) && file.size > maxBytes) {
        problems.push(
          t.tooLarge({
            name: file.name,
            size: formatBytes(file.size),
            maxSize: formatBytes(maxBytes),
            noun,
          })
        )
      } else {
        accepted.push(file)
      }
    }
    setRejections(problems)
    if (accepted.length === 0) return
    const rows: FileUploadItem[] = accepted.map((file) => ({
      id: makeId(),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      status: "processing",
    }))
    commit([...valueRef.current, ...rows])
    rows.forEach((row, index) => void prepare(row, accepted[index]))
  }

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files)
    // Cleared so choosing the same file again still fires a change.
    event.target.value = ""
  }

  const remove = (item: FileUploadItem) => {
    if (item.status === "saved") {
      setConfirming(item)
      return
    }
    setRejections([])
    commit(valueRef.current.filter((row) => row.id !== item.id))
  }

  const retry = (item: FileUploadItem) => {
    // A file that failed here (unreadable, too large) is prepared again;
    // one the caller failed while sending goes back to the caller.
    if (!item.failedLocally || !item.file) {
      onRetry?.(item)
      return
    }
    const next = { ...item, status: "processing" as const, error: undefined, failedLocally: undefined }
    commit(valueRef.current.map((row) => (row.id === item.id ? next : row)))
    void prepare(next, item.file)
  }

  const openPicker = (which: "files" | "camera") => {
    if (inert) return
    ;(which === "camera" ? cameraRef : pickerRef).current?.click()
  }

  return (
    <div data-slot="file-upload" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div
        data-slot="file-upload-zone"
        data-dragging={dragging || undefined}
        data-disabled={inert || undefined}
        aria-invalid={invalid || undefined}
        onClick={(event) => {
          // The zone itself is a target too (29: "clicking works"); a
          // click on one of its buttons belongs to that button.
          if ((event.target as Element).closest("button")) return
          openPicker("files")
        }}
        onDragEnter={(event) => {
          if (inert) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          if (inert) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!inert) addFiles(event.dataTransfer.files)
        }}
        className={cn(
          "flex min-w-0 flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center",
          "transition-[background-color,border-color] duration-(--duration-fast)",
          !inert && "cursor-pointer hover:border-border-strong",
          // Section 35.6's drop-target look: tinted, with a primary-border edge.
          "data-dragging:border-primary-border data-dragging:bg-primary-subtle",
          "aria-invalid:border-danger",
          inert && "bg-surface-sunken"
        )}
      >
        <UploadIcon aria-hidden className="size-icon-empty text-text-secondary" />
        <p className="text-body text-text-primary">
          {full
            ? t.full({ count: value.length, maxFiles, noun })
            : (
              <>
                <span className="pointer-coarse:hidden">{t.drag({ maxFiles, noun })}</span>
                <span className="hidden pointer-coarse:inline">
                  {t.touch({ maxFiles, noun, camera: Boolean(capture) })}
                </span>
              </>
            )}
        </p>
        <p id={hintId} className="text-label text-text-secondary">
          {description ?? generated}
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {capture ? (
            <Button
              type="button"
              variant="secondary"
              disabled={inert}
              onClick={() => openPicker("camera")}
              className="hidden w-full pointer-coarse:inline-flex sm:w-auto"
            >
              <CameraIcon />
              {t.takeButton({ noun })}
            </Button>
          ) : null}
          <Button
            id={id}
            type="button"
            variant="secondary"
            disabled={inert}
            onClick={() => openPicker("files")}
            aria-describedby={cn(hintId, rejections.length > 0 && errorId, describedBy) || undefined}
            aria-invalid={invalid || undefined}
            className="w-full sm:w-auto"
          >
            <UploadIcon />
            {t.chooseButton({ maxFiles, noun })}
          </Button>
        </div>
        <input
          ref={pickerRef}
          type="file"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          accept={accept}
          multiple={maxFiles > 1}
          disabled={inert}
          onChange={onInputChange}
        />
        {capture ? (
          <input
            ref={cameraRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            accept={accept ?? "image/*"}
            capture={capture}
            disabled={inert}
            onChange={onInputChange}
          />
        ) : null}
      </div>

      {rejections.length > 0 ? (
        <InlineFieldError id={errorId} className="mt-0">
          {rejections.length === 1
            ? rejections[0]
            : rejections.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
        </InlineFieldError>
      ) : null}

      {value.length > 0 ? (
        <ul data-slot="file-upload-list" className="flex min-w-0 flex-col gap-2">
          {value.map((item) => (
            <FileRow
              key={item.id}
              item={item}
              noun={noun}
              text={t}
              disabled={disabled}
              onRemove={() => remove(item)}
              onRetry={() => retry(item)}
            />
          ))}
        </ul>
      ) : null}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle({ noun })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmBody({ name: confirming?.name ?? "", context: savedContext })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const item = confirming
                setConfirming(null)
                if (!item) return
                commit(valueRef.current.filter((row) => row.id !== item.id))
                onRemoveSaved?.(item)
              }}
            >
              {t.confirmAction({ noun })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FileRow({
  item,
  noun,
  text: t,
  disabled,
  onRemove,
  onRetry,
}: {
  item: FileUploadItem
  noun: Noun
  text: FileUploadText
  disabled: boolean
  onRemove: () => void
  onRetry: () => void
}) {
  const localUrl = useObjectUrl(item.file)
  const isImage = item.type.startsWith("image/")
  const preview = item.previewUrl ?? (isImage ? localUrl : undefined)
  const download = item.url ?? localUrl
  const failed = item.status === "failed"
  const busy = item.status === "processing" || item.status === "uploading"
  const percent = Math.round(Math.min(1, Math.max(0, item.progress ?? 0)) * 100)

  const statusText =
    item.status === "processing"
      ? t.preparing({ noun })
      : item.status === "uploading"
        ? t.uploading({ percent })
        : null

  return (
    <li
      data-slot="file-upload-row"
      data-status={item.status}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-surface p-2",
        failed ? "border-danger-border bg-danger-bg" : "border-border-light"
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-control">
        {preview && !failed ? (
          // A local object URL or an authenticated blob: next/image cannot
          // optimise either, and a 48px thumbnail needs no optimising.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : failed ? (
          <OctagonXIcon aria-hidden className="size-icon-nav text-danger" />
        ) : (
          <FileIcon aria-hidden className="size-icon-nav text-text-secondary" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 basis-40 flex-col">
        <Truncate className="text-body text-text-primary">{item.name}</Truncate>
        {failed ? (
          <span role="alert" className="text-label text-danger">
            {item.error ?? t.uploadFailed({ name: item.name })}
          </span>
        ) : (
          <span className="text-label text-text-secondary tabular-nums">
            {formatBytes(item.size)}
            {statusText ? ` · ${statusText}` : null}
          </span>
        )}
        {busy ? (
          <span
            role="progressbar"
            aria-label={statusText ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.status === "uploading" ? percent : undefined}
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-control"
          >
            <span
              className={cn(
                "block h-full origin-left rounded-full bg-primary",
                "transition-transform duration-(--duration-fast) ease-enter motion-reduce:transition-none",
                item.status === "processing" && "animate-pulse motion-reduce:animate-none"
              )}
              style={{ transform: `scaleX(${item.status === "uploading" ? percent / 100 : 1})` }}
            />
          </span>
        ) : null}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {failed ? (
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onRetry}>
            <RotateCwIcon />
            {t.retry}
          </Button>
        ) : null}
        {download && !busy && !failed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  nativeButton={false}
                  render={<a href={download} download={item.name} />}
                  aria-label={t.downloadLabel({ name: item.name })}
                />
              }
            >
              <DownloadIcon />
            </TooltipTrigger>
            <TooltipContent>{t.download}</TooltipContent>
          </Tooltip>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || item.status === "uploading"}
          onClick={onRemove}
          aria-label={t.removeLabel({ name: item.name })}
        >
          {t.remove}
        </Button>
      </span>
    </li>
  )
}

export { FileUpload, compressImage, filesToSend, formatBytes, isBusy }
export type { FileUploadItem, FileUploadProps, FileUploadStatus, FileUploadText }
