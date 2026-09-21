'use client'

import { useSearchParams } from 'next/navigation'
import StoryScreen from './StoryScreen'

export default function StoryEntry() {
  const areaId = useSearchParams().get('area') ?? 'area-1'
  return <StoryScreen areaId={areaId} />
}
