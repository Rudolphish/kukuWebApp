'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildJoinUrl, isLocalOrigin, qrMatrix } from '@/lib/join'

/**
 * 子どもの端末で読み取る QR。親画面に置く。
 *
 * 合言葉が入っているときは、読み取るだけで子どもの端末につながる。
 * そのぶん QR そのものが合言葉と同じ重さを持つので、押すまで出さない。
 */
export default function JoinQr({ familyCode }: { familyCode: string }) {
  const [origin, setOrigin] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  // origin はブラウザでしか分からない。描画中に読むと hydration が食い違う
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const code = familyCode.trim()
  const url = origin ? buildJoinUrl(origin, code) : null
  const matrix = useMemo(() => (url && shown ? qrMatrix(url) : null), [url, shown])

  return (
    <div>
      <button className="subButton" style={{ width: '100%' }} onClick={() => setShown((v) => !v)}>
        {shown ? 'QR をしまう' : '子どもの端末で開く QR を出す'}
      </button>

      {shown && matrix && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <QrSvg matrix={matrix} />
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: 0, alignSelf: 'stretch' }}>
            {code
              ? '子どもの端末のカメラで読み取ると、この合言葉で「子どもの端末」としてつながります。この QR には合言葉が入っています。写真に撮ったり、ほかの人に見せたりしないでください。'
              : '子どもの端末のカメラで読み取ると、このアプリが開きます。合言葉が未設定のため、記録の共有は含みません。'}
          </p>
          {origin && isLocalOrigin(origin) && (
            <p style={{ fontSize: 12, lineHeight: 1.7, margin: 0, color: 'var(--danger)', alignSelf: 'stretch' }}>
              いまは {origin} で開いているため、ほかの端末からは開けません。デプロイ先の URL で親画面を開いてから出してください。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * マス目を 1 本の path にして描く。
 * 背景は白・前景は黒で固定する。着せ替えの色に合わせると読み取れなくなる。
 */
function QrSvg({ matrix }: { matrix: boolean[][] }) {
  const quiet = 4
  const size = matrix.length + quiet * 2
  const d = matrix
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + quiet},${y + quiet}h1v1h-1z` : '')))
    .join('')
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: 240, aspectRatio: '1 / 1', background: '#fff', borderRadius: 8 }}
      shapeRendering="crispEdges"
      role="img"
      aria-label="子どもの端末で開く QR コード"
    >
      <path d={d} fill="#000" />
    </svg>
  )
}
