/*
 * オフラインでも開けるようにするための最小限の Service Worker。
 *
 * 電波の無い場所で開かないアプリは、それだけで習慣にならない。
 * 同一オリジンの GET を stale-while-revalidate で扱う:
 * キャッシュがあれば即返し、裏で更新する。子どもに読み込み中を見せない方を優先する。
 */
const CACHE = 'kuku-v1'
const PRECACHE = ['/', '/play', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      // キャッシュがあれば待たずに返す
      return cached || network
    }),
  )
})
