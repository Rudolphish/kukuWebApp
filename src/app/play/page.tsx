import { Suspense } from 'react'
import PlayScreen from '@/components/PlayScreen'

export default function PlayPage() {
  return (
    <Suspense fallback={<main className="app" />}>
      <PlayScreen />
    </Suspense>
  )
}
