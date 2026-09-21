import { Suspense } from 'react'
import StoryEntry from '@/components/StoryEntry'

export default function StoryPage() {
  return (
    <Suspense fallback={<main className="app" />}>
      <StoryEntry />
    </Suspense>
  )
}
