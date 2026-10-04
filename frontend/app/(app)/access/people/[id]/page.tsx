import { PersonAccessPage } from "./person-access-page"

/** A person's access page (kit 40.7), under the People tab (kit 40.1 rule 3). */
export default async function AccessPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PersonAccessPage personId={id} />
}
