import { RANK_LABEL, RANK_MARK, type Rank } from '@/lib/rank'

/**
 * ランクの表示。
 *
 * 大きさは 3 つだけ。結果画面の主役（big）、記録の横に添える札（inline）、
 * 段カードの下辺を横切る帯（bar）。
 *
 * 帯は以前は丸の中の絵文字だった。絵文字は字面が指定した大きさより縦に大きく、
 * 小さい丸に入れると上端が切れる。帯なら切れようがなく、色だけで読める。
 */
export default function RankBadge({
  rank,
  size = 'inline',
}: {
  rank: Rank
  size?: 'big' | 'inline' | 'bar'
}) {
  if (size === 'bar') {
    return <span className="rankBar" data-rank={rank} aria-label={RANK_LABEL[rank]} />
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
