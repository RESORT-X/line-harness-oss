'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'

type ApiResult<T> = {
  success: boolean
  data: T
  error?: string
}

interface ConversationItem {
  friendId: string
  lineUserId: string
  displayName: string | null
  lineAccountId: string | null
  lineAccountName: string | null
  lastIncomingAt: string
  hoursSince: number
  lastIncomingPreview: string | null
  lastIncomingType: string | null
  tags: string[]
}

interface ConversationsData {
  total: number
  items: ConversationItem[]
}

const PAGE_SIZE = 50

const hourFilters = [
  { label: '全て', minHours: 0 },
  { label: '1時間以上', minHours: 1 },
  { label: '3時間以上', minHours: 3 },
  { label: '6時間以上', minHours: 6 },
  { label: '24時間以上', minHours: 24 },
  { label: '72時間以上', minHours: 72 },
]

function formatHours(hours: number) {
  const safeHours = Math.max(0, hours)
  if (safeHours < 1) return `${Math.round(safeHours * 60)}分前`
  if (safeHours < 24) return `${Math.round(safeHours)}時間前`
  return `${Math.round(safeHours / 24)}日前`
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function urgencyClass(hours: number) {
  if (hours >= 72) return 'bg-red-100 text-red-700'
  if (hours >= 24) return 'bg-orange-100 text-orange-700'
  if (hours >= 6) return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-700'
}

function previewText(item: ConversationItem) {
  if (item.lastIncomingPreview) return item.lastIncomingPreview
  if (item.lastIncomingType && item.lastIncomingType !== 'text') return `[${item.lastIncomingType}]`
  return '-'
}

export default function ConversationsPage() {
  const { selectedAccountId } = useAccount()
  const [data, setData] = useState<ConversationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [minHours, setMinHours] = useState(0)
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        minHoursSince: String(minHours),
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (selectedAccountId) params.set('lineAccountId', selectedAccountId)

      const res = await fetchApi<ApiResult<ConversationsData>>(`/api/conversations?${params}`)
      if (res.success) {
        setData(res.data)
      } else {
        setError(res.error || '未返信一覧の読み込みに失敗しました')
      }
    } catch {
      setError('未返信一覧の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [minHours, page, selectedAccountId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(0)
  }, [selectedAccountId])

  const totalPages = useMemo(() => {
    if (!data || data.total === 0) return 0
    return Math.ceil(data.total / PAGE_SIZE)
  }, [data])

  const currentStart = data && data.total > 0 ? page * PAGE_SIZE + 1 : 0
  const currentEnd = data ? Math.min((page + 1) * PAGE_SIZE, data.total) : 0

  const handleFilterChange = (nextMinHours: number) => {
    setMinHours(nextMinHours)
    setPage(0)
  }

  return (
    <div>
      <Header
        title="未返信インボックス"
        description="ユーザーからの受信後、手動返信がまだない会話を確認します"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {hourFilters.map((filter) => {
          const active = minHours === filter.minHours
          return (
            <button
              key={filter.minHours}
              type="button"
              onClick={() => handleFilterChange(filter.minHours)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                active ? 'text-white' : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
              }`}
              style={active ? { backgroundColor: '#06C755' } : undefined}
            >
              {filter.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40"
        >
          更新
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">未返信件数</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data ? data.total.toLocaleString('ja-JP') : '-'}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">表示範囲</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {data ? `${currentStart}-${currentEnd}` : '-'}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">現在の条件</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {hourFilters.find((filter) => filter.minHours === minHours)?.label || '全て'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="px-4 py-4 border-b border-gray-100 animate-pulse flex items-center gap-4">
              <div className="h-9 w-9 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-gray-200" />
                <div className="h-2 w-56 rounded bg-gray-100" />
              </div>
              <div className="h-6 w-20 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">友だち</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">最後の受信</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">経過時間</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">受信日時</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">タグ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((item) => (
                    <tr key={item.friendId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.displayName || '名前なし'}</p>
                          <p className="mt-0.5 text-xs text-gray-400 font-mono truncate">{item.lineUserId}</p>
                          {item.lineAccountName && (
                            <p className="mt-0.5 text-xs text-gray-400 truncate">{item.lineAccountName}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-xs truncate text-sm text-gray-700">{previewText(item)}</p>
                        {item.lastIncomingType && item.lastIncomingType !== 'text' && (
                          <p className="mt-0.5 text-xs text-gray-400">{item.lastIncomingType}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${urgencyClass(item.hoursSince)}`}>
                          {formatHours(item.hoursSince)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDateTime(item.lastIncomingAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.tags.length === 0 ? (
                            <span className="text-xs text-gray-400">なし</span>
                          ) : (
                            <>
                              {item.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {tag}
                                </span>
                              ))}
                              {item.tags.length > 3 && (
                                <span className="text-xs text-gray-400">+{item.tags.length - 3}</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/friends/detail?id=${item.friendId}`}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                            詳細
                          </Link>
                          <Link
                            href="/chats"
                            className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                            style={{ backgroundColor: '#06C755' }}
                          >
                            返信
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                {currentStart}-{currentEnd}件 / 全{data.total.toLocaleString('ja-JP')}件
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  前へ
                </button>
                <span className="px-2 text-sm text-gray-600">{page + 1} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">未返信のメッセージはありません</p>
        </div>
      )}
    </div>
  )
}
