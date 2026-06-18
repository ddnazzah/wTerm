// wTerm mobile bridge — service worker. Its only job is Web Push: show a
// notification when the desktop signals a terminal needs attention, and focus
// the app when the user taps it. (No offline caching — the app is useless
// without a live connection to the desktop anyway.)

self.addEventListener('push', (event) => {
  let data = { title: 'wTerm', body: 'A terminal needs your attention' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // non-JSON payload — keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.terminalId || 'wterm',
      data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
      return undefined
    })
  )
})
