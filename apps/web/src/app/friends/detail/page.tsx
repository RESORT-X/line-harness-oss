'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import FriendDetail from './client'

function FriendDetailInner() {
  const params = useSearchParams()
  const friendId = params.get('id') || ''
  return <FriendDetail friendId={friendId} />
}

export default function FriendDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">読み込み中...</div>}>
      <FriendDetailInner />
    </Suspense>
  )
}
