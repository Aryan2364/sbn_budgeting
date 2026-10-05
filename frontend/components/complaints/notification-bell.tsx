"use client"

import * as React from "react"

import { notificationsApi, type NotificationItem } from "@/lib/complaints-api"
import { useSession } from "@/components/shell/session"
import {
  NotificationBell as Bell,
  type Notification,
} from "@/components/shell/notification-panel"

/**
 * The top bar's bell (7.3, 7.4, 12.2), fed by `/notifications`.
 *
 * The panel itself is the kit's `NotificationBell` from
 * shell/notification-panel.tsx; this file owns only the data:
 *
 *   - polled every 60 seconds while the tab is visible, and at once when
 *     the tab comes back into view, so a phone left in a pocket does not
 *     poll all afternoon;
 *   - opening a notification marks it read (optimistically, so the dot
 *     goes at once) and goes to its complaint;
 *   - "Mark all as read" marks everything read.
 *
 * Rows stay neutral (7.3). A status badge appears only where the event
 * genuinely is good: a complaint closed (success).
 *
 * "View all" goes to the complaints list: there is no notifications
 * list endpoint that pages (CONTRACT §9, fe-complaints).
 */

const POLL_MS = 60_000
const LIMIT = 25

function toPanel(item: NotificationItem): Notification {
  const status: Notification["status"] = item.kind === "closed" ? "success" : undefined
  return {
    id: item.id,
    text: item.body ? `${item.title}. ${item.body}` : item.title,
    at: new Date(item.createdAt),
    read: item.readAt !== null,
    href: item.complaintId ? `/complaints/${item.complaintId}` : "/complaints",
    status,
  }
}

function NotificationBell() {
  const { status } = useSession()
  const [items, setItems] = React.useState<NotificationItem[]>([])

  const load = React.useCallback(() => {
    notificationsApi
      .list(LIMIT)
      .then((feed) => setItems(feed.items))
      .catch(() => {
        // A missed poll is not worth interrupting anyone for: the next
        // one, a minute later, tries again, and the list keeps what it had.
      })
  }, [])

  React.useEffect(() => {
    if (status !== "in") return
    let timer: number | undefined
    const schedule = () => {
      window.clearInterval(timer)
      if (document.visibilityState === "visible") {
        load()
        timer = window.setInterval(load, POLL_MS)
      }
    }
    schedule()
    document.addEventListener("visibilitychange", schedule)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", schedule)
    }
  }, [status, load])

  const panelItems = React.useMemo(() => items.map(toPanel), [items])

  if (status !== "in") return null

  return (
    <Bell
      notifications={panelItems}
      viewAllHref="/complaints"
      onRead={(id) => {
        const item = items.find((n) => n.id === id)
        if (!item || item.readAt) return
        const now = new Date().toISOString()
        setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: now } : n)))
        notificationsApi.read(id).catch(load)
      }}
      onMarkAllRead={() => {
        const now = new Date().toISOString()
        setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })))
        notificationsApi.readAll().catch(load)
      }}
    />
  )
}

export { NotificationBell }
