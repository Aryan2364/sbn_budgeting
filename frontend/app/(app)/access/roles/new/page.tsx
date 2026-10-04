import { RoleEditor } from "../role-editor"

/**
 * Add role, and Duplicate (kit 40.2 rules 8 and 9): `?from=<id>` opens the
 * editor as a new role named "Copy of …" with every tick and scope copied.
 * Nothing is saved until Save; there is no duplicate API (R12).
 */
export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { from } = await searchParams
  return <RoleEditor fromId={typeof from === "string" && from ? from : undefined} />
}
