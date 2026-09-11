"use client"

import * as React from "react"

import { ExpenseForm } from "@/components/forms/expense-form"

/** Add. The same component as Edit (section 4 rule 1). */
export default function NewExpensePage() {
  return (
    <React.Suspense fallback={null}>
      <ExpenseForm />
    </React.Suspense>
  )
}
