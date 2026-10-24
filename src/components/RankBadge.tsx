import { RANK_LABEL, RANK_MARK, type Rank } from '@/lib/rank'

/**
 * ランクの表示。
 *
 * 大きさは 3 つだけ。結果画面の主役（big）、記録の横に添える印（inline）、
 * 段カードの隅に出す点（dot）。点は名前を出さない。カードが文字で埋まる。
 */
export default function RankBadge({
  rank,
  size = 'inline',
}: {
  rank: Rank
  size?: 'big' | 'inline' | 'dot'
}) {
  if (size === 'dot') {
    return (
      <span className="rankDot" data-rank={rank} aria-label={RANK_LABEL[rank]}>
        <span aria-hidden>{RANK_MARK[rank]}</span>
      </span>
    )
  }

  return (
    <span className={size === 'big' ? 'rank rankBig' : 'rank'} data-rank={rank}>
      <span className="rankMark" aria-hidden>
        {RANK_MARK[rank]}
      </span>
      {RANK_LABEL[rank]}
    </span>
  )
}
