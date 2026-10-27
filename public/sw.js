/*
 * オフラインでも開けるようにするための最小限の Service Worker。
 *
 * 電波の無い場所で開かないアプリは、それだけで習慣にならない。
 *
 * 取り方はリクエストの種類で分ける。
 * - 画面（ページの HTML）: ネットワーク優先。取れなければキャッシュ。
 *   以前はキャッシュ優先（stale-while-revalidate）だったため、更新のあと最初に開くと
 *   古い画面が出て、新しい部品と食い違うことがあった（「2 回開き直すと直る」状態）
 * - /_next/static/ の部品: 名前に版が入っていて中身が変わらないので、キャッシュ優先
 * - それ以外（アイコン等）: キャッシュがあれば即返し、裏で更新する
 */
const CACHE = 'kuku-v2'
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

function put(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone()
    caches.open(CACHE).then((cache) => cache.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 画面の遷移と、画面の中身（Next.js の RSC）は常に新しいものを取りに行く
  if (request.mode === 'navigate' || url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
    event.respondWith(
      fetch(request)
        .then((response) => put(request, response))
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((r) => put(request, r))))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => put(request, response))
        .catch(() => cached)
      // キャッシュがあれば待たずに返す
      return cached || network
    }),
  )
})
