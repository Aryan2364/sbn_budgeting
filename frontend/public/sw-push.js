/*
 * Section 41.12 rules 2 and 3 - phone notifications, inside the service
 * worker. Plain JavaScript, no package, no build step: public/sw.js
 * (part 6B) loads it with importScripts("/sw-push.js").
 *
 * WHAT ARRIVES. The product's backend sends each phone notification as
 * JSON: { title, body, url, tag }.
 *
 *   - title, body: the backend's words, shown as they are. A phone
 *     notification shows on the lock screen, so they never carry amounts
 *     or private details; they name the event: title "Approval waiting",
 *     body "Invoice INV-2041 is waiting for your approval." (41.12 rule 3).
 *     This file adds nothing to them, so it can never add a figure.
 *   - url: the same address the in-app notification opens (41.12 rule 2),
 *     a path on this site: "/invoices/INV-2041". An address on another
 *     site is never opened from a notification; it falls back to "/".
 *   - tag: optional. A later notification with the same tag replaces the
 *     earlier one instead of stacking ("invoice-INV-2041").
 *
 * WHAT A TAP DOES. Closes the notification, then brings the app to the
 * front at `url`: a window already showing that address is focused; else
 * an open window of the app is focused and moved there; else a new window
 * opens. The screen opened this way has no previous screen in the app, so
 * its back arrow goes to its parent (41.4 rule 7).
 *
 * The words, the icon and how a tap behaves are the same in the browser
 * and in the installed app; on iPhone this only ever runs once the app is
 * installed (41.12 rule 5), because only then can the phone subscribe.
 */

/**
 * The app's icon beside the notification: the 192px install icon (41.12
 * rule 9), drawn by app/install-icon/[name]/route.tsx (lib/install-icon.tsx).
 */
var PUSH_ICON = "/install-icon/192"

/** Used only when a payload arrives with no title: never empty (the phone needs one). */
var PUSH_FALLBACK_TITLE = "New notification"

/** A path on this site, or "/" for anything else. */
function pushTarget(url) {
  try {
    var target = new URL(typeof url === "string" && url ? url : "/", self.location.origin)
    if (target.origin !== self.location.origin) return self.location.origin + "/"
    return target.href
  } catch {
    return self.location.origin + "/"
  }
}

function pushPayload(event) {
  if (!event.data) return {}
  try {
    var data = event.data.json()
    return data && typeof data === "object" ? data : {}
  } catch {
    // Not JSON: the text is the message.
    return { body: event.data.text() }
  }
}

self.addEventListener("push", function (event) {
  var data = pushPayload(event)
  var title = typeof data.title === "string" && data.title ? data.title : PUSH_FALLBACK_TITLE
  var options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: PUSH_ICON,
    data: { url: pushTarget(data.url) },
  }
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag
  // userVisibleOnly: every push shows a notification, always.
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  var target = pushTarget(event.notification.data && event.notification.data.url)

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      var own = windows.filter(function (client) {
        try {
          return new URL(client.url).origin === self.location.origin
        } catch {
          return false
        }
      })

      // Already showing that address: bring it to the front.
      for (var i = 0; i < own.length; i++) {
        if (own[i].url === target && "focus" in own[i]) return own[i].focus()
      }

      // An open window of the app: bring it to the front and move it there.
      // navigate() works only on a window this worker controls; where it
      // refuses, a new window opens instead.
      var open = own.find(function (client) {
        return "navigate" in client && "focus" in client
      })
      if (open) {
        return open
          .focus()
          .then(function (client) {
            return (client || open).navigate(target)
          })
          .catch(function () {
            return self.clients.openWindow(target)
          })
      }

      return self.clients.openWindow(target)
    })
  )
})

/*
 * NOT HANDLED HERE: pushsubscriptionchange. When the push service renews
 * a subscription by itself, the backend still holds the old one and its
 * sends start failing (404 or 410). The backend deletes a subscription on
 * either answer, and the app calls subscribe() (lib/push.ts) at every
 * sign-in where permission is granted, which hands the backend the
 * current one.
 */
