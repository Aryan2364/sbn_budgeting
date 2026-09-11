import { ProjectForm } from "@/components/forms/project-form"

/** Edit. The same component as Add (section 4 rule 1). */
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProjectForm projectId={id} />
}
