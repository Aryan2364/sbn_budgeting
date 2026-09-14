"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { api, type Project } from "@/lib/api"
import { errorMessage } from "@/components/shell/session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PageColumn, PageHeader } from "@/components/templates/page"
import {
  FormField,
  FormFooter,
  FormFrame,
  FormScrollArea,
  FormSection,
} from "@/components/templates/form-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { FormError, FormLoadFailed } from "@/components/forms/form-error"

/**
 * Add and Edit, in ONE component (section 4 rule 1).
 *
 * `projectId` is the only thing that differs between them. Same fields,
 * same order, same labels, same validation — only the page title and
 * the submit label change, and both are derived here rather than
 * passed in, so the two can never drift.
 */
export function ProjectForm({ projectId }: { projectId?: string }) {
  const router = useRouter()
  const isEdit = projectId !== undefined

  const [donorName, setDonorName] = React.useState("")
  const [name, setName] = React.useState("")
  const [plannedTrees, setPlannedTrees] = React.useState("")
  const [loading, setLoading] = React.useState(isEdit)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Section 13: a failed LOAD is its own state, not a failed save.
   * Kept apart from `error`, which carries save failures only.
   */
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    api
      .get<Project>(`/projects/${projectId}`)
      .then((project) => {
        if (cancelled) return
        setDonorName(project.donorName)
        setName(project.name)
        setPlannedTrees(String(project.plannedTrees))
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setLoadError(errorMessage(caught))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadTick])

  /**
   * Section 11.3 rule 6: validation runs when the user leaves a field,
   * not on every keystroke.
   */
  function validateField(field: string, value: string): string | null {
    if (field === "donorName" && value.trim() === "") return "Enter the donor name"
    if (field === "name" && value.trim() === "") return "Enter the project name"
    if (field === "plannedTrees") {
      if (value.trim() === "") return "Enter the number of trees"
      if (!/^\d+$/.test(value.trim())) {
        return "Enter the number of trees as a whole number, like 5000"
      }
      if (Number(value) < 1) return "A project needs at least one tree"
    }
    return null
  }

  function blur(field: string, value: string) {
    const message = validateField(field, value)
    setFieldErrors((current) => {
      const next = { ...current }
      if (message) next[field] = message
      else delete next[field]
      return next
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const found: Record<string, string> = {}
    for (const [field, value] of [
      ["donorName", donorName],
      ["name", name],
      ["plannedTrees", plannedTrees],
    ] as const) {
      const message = validateField(field, value)
      if (message) found[field] = message
    }
    if (Object.keys(found).length > 0) {
      setFieldErrors(found)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body = { donorName, name, plannedTrees: Number(plannedTrees) }
      const saved = isEdit
        ? await api.patch<Project>(`/projects/${projectId}`, body)
        : await api.post<Project>("/projects", body)
      router.push(`/projects/${saved.id}`)
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  const title = isEdit ? name || "Edit project" : "New project"

  return (
    <FormFrame>
      <FormScrollArea>
        <PageColumn>
          <RecordBreadcrumb
            trail={[{ label: "Projects", href: "/projects" }]}
            current={isEdit ? "Edit" : "New project"}
          />

          <PageHeader className="mt-4" title={loading ? <Skeleton className="h-8 w-64" /> : title} />

          {loadError !== null ? (
            <FormLoadFailed
              message={loadError}
              onRetry={() => {
                setLoadError(null)
                setLoading(true)
                setReloadTick((t) => t + 1)
              }}
            />
          ) : null}

          <FormError message={error} />

          <form id="project-form" onSubmit={submit} className="mt-8">
            <FormSection
              label="Project"
              description="A donor funds a project for a number of trees. The trees are then split across one or more sites."
            >
              <FormField
                span={6}
                label="Donor name"
                required
                htmlFor="donorName"
                error={fieldErrors.donorName}
              >
                <Input
                  id="donorName"
                  value={donorName}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.donorName) || undefined}
                  onChange={(event) => setDonorName(event.target.value)}
                  onBlur={(event) => blur("donorName", event.target.value)}
                />
              </FormField>

              <FormField
                span={6}
                label="Project name"
                required
                htmlFor="name"
                error={fieldErrors.name}
              >
                <Input
                  id="name"
                  value={name}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.name) || undefined}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={(event) => blur("name", event.target.value)}
                />
              </FormField>

              <FormField
                span={3}
                label="Number of trees"
                required
                htmlFor="plannedTrees"
                hint="Sites are budgeted per tree against this count."
                error={fieldErrors.plannedTrees}
              >
                {/* Section 17: number fields align their content right. */}
                <Input
                  id="plannedTrees"
                  inputMode="numeric"
                  value={plannedTrees}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.plannedTrees) || undefined}
                  className="text-right tabular-nums"
                  placeholder="5000"
                  onChange={(event) => setPlannedTrees(event.target.value)}
                  onBlur={(event) => blur("plannedTrees", event.target.value)}
                />
              </FormField>
            </FormSection>
          </form>
        </PageColumn>
      </FormScrollArea>

      {/* Section 11.3 rule 7: Cancel on the left, primary on the right. */}
      <FormFooter>
        <Button
          variant="secondary"
          render={<Link href={isEdit ? `/projects/${projectId}` : "/projects"} />}
        >
          Cancel
        </Button>
        <Button type="submit" form="project-form" disabled={saving || loading}>
          {saving ? "Saving…" : isEdit ? "Save project" : "Create project"}
        </Button>
      </FormFooter>
    </FormFrame>
  )
}
