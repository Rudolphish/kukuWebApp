'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import NovelScreen from './NovelScreen'
import WalkScreen from './WalkScreen'
import { getStory } from '@/lib/stories'
import { readyAreas } from '@/lib/storage/stories'
import { isNovel } from '@/lib/story'

/** 話の形に合わせて、読む画面を切り替える */
export default function StoryScreen({ areaId }: { areaId: string }) {
  const router = useRouter()
  const { stories } = useApp()
  // 子どもが注文して出来上がった話も、同梱の話と同じように引ける
  const area = useMemo(() => getStory(areaId, readyAreas(stories)), [areaId, stories])

  if (!area) {
    return (
      <main className="app" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <p>おはなしが みつからない</p>
        <button className="subButton" onClick={() => router.push('/')}>
          もどる
        </button>
      </main>
    )
  }
  return isNovel(area) ? <NovelScreen key={area.id} area={area} /> : <WalkScreen key={area.id} area={area} />
}
