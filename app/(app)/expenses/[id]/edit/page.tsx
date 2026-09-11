"use client"

import * as React from "react"

import { ExpenseForm } from "@/components/forms/expense-form"

/** Edit. The same component as Add (section 4 rule 1). */
export default function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)
  return (
    <React.Suspense fallback={null}>
      <ExpenseForm expenseId={id} />
    </React.Suspense>
  )
}
