'use client'

import { useSearchParams } from 'next/navigation'
import StoryOrderScreen from './StoryOrderScreen'

/** ?from=<話の id> があれば、その話の つづきを注文する */
export default function StoryOrderEntry() {
  const fromId = useSearchParams().get('from') ?? undefined
  return <StoryOrderScreen fromId={fromId} />
}
