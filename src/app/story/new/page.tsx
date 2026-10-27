import { Suspense } from 'react'
import StoryOrderEntry from '@/components/StoryOrderEntry'

export default function StoryOrderPage() {
  return (
    <Suspense fallback={<main className="app" />}>
      <StoryOrderEntry />
    </Suspense>
  )
}
