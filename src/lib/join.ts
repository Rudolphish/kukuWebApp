import qrcode from 'qrcode-generator'

/**
 * 子どもの端末をつなぐための URL と QR。
 *
 * 合言葉は URL の # 以降（フラグメント）に入れる。フラグメントはブラウザの外へ
 * 送られないので、サーバやプロキシのログに残らない。受け取った側は読んだ直後に
 * アドレスバーから消す（app/join/page.tsx）。
 *
 * 合言葉が未設定のとき、または共有の設定がないときは、アプリを開くだけの URL にする。
 */
export const JOIN_PATH = '/join'

export function buildJoinUrl(origin: string, familyCode: string): string {
  const base = origin.replace(/\/+$/, '')
  const code = familyCode.trim()
  if (!code) return `${base}/`
  return `${base}${JOIN_PATH}#code=${encodeURIComponent(code)}`
}

/** location.hash から合言葉を取り出す。無い・壊れているときは null */
export function parseJoinHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const raw = params.get('code')
  if (raw === null) return null
  const code = raw.trim()
  return code ? code : null
}

/**
 * localhost などで開いている親の端末から QR を出すと、子どもの端末では開けない。
 * よくある取り違えなので、画面で注意を出すために判定だけ用意する。
 */
export function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      /^127\./.test(hostname) ||
      /^(10|192\.168)\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
  } catch {
    return true
  }
}

/**
 * QR のマス目。true が黒。
 *
 * 誤り訂正は M。画面に出して読ませる用途なので、汚れへの強さより
 * マス目の粗さ（読み取りやすさ）を優先する。URL は ASCII のみになる前提
 * （合言葉は encodeURIComponent 済み）。
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const size = qr.getModuleCount()
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)))
}
