import { RoleEditor } from "../role-editor"

/** A role's editor (kit 40.3). The same component as Add (section 4 rule 1). */
export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RoleEditor roleId={id} />
}
