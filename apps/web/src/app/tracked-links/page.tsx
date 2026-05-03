'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiResponse, Tag } from '@line-crm/shared'
import Header from '@/components/layout/header'
import { api, fetchApi } from '@/lib/api'

interface TrackedLink {
  id: string
  name: string
  originalUrl: string
  trackingUrl: string
  tagId: string | null
  scenarioId: string | null
  introTemplateId: string | null
  rewardTemplateId: string | null
  isActive: boolean
  clickCount: number
  createdAt: string
  updatedAt: string
}

type Notice = { type: 'success' | 'error'; text: string } | null

const PRIMARY_COLOR = '#06C755'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function ClickRanking({ links }: { links: TrackedLink[] }) {
  const ranked = [...links]
    .filter((link) => link.clickCount > 0)
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 5)

  if (ranked.length === 0) return null

  const maxClicks = Math.max(...ranked.map((link) => link.clickCount), 1)

  return (
    <div className="mb-6 bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">クリック上位</h2>
      <div className="space-y-3">
        {ranked.map((link) => (
          <div key={link.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-gray-600">{link.name}</span>
            <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(8, (link.clickCount / maxClicks) * 100)}%`,
                  backgroundColor: PRIMARY_COLOR,
                }}
              />
            </div>
            <span className="w-12 text-right text-xs font-semibold text-gray-800">
              {link.clickCount.toLocaleString('ja-JP')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TrackedLinksPage() {
  const [links, setLinks] = useState<TrackedLink[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', originalUrl: '', tagId: '' })

  const tagById = useMemo(() => {
    return new Map(tags.map((tag) => [tag.id, tag]))
  }, [tags])

  const totalClicks = useMemo(() => {
    return links.reduce((total, link) => total + (link.clickCount || 0), 0)
  }, [links])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [linksResult, tagsResult] = await Promise.allSettled([
        fetchApi<ApiResponse<TrackedLink[]>>('/api/tracked-links'),
        api.tags.list(),
      ])

      if (linksResult.status === 'fulfilled') {
        const res = linksResult.value
        if (res.success) {
          setLinks(res.data)
        } else {
          setError(res.error)
        }
      } else {
        setError(getErrorMessage(linksResult.reason, 'トラッキングリンクの読み込みに失敗しました。'))
      }

      if (tagsResult.status === 'fulfilled' && tagsResult.value.success) {
        setTags(tagsResult.value.data)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'トラッキングリンクの読み込みに失敗しました。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')
    setNotice(null)

    const name = form.name.trim()
    const originalUrl = form.originalUrl.trim()
    if (!name || !originalUrl) {
      setFormError('リンク名と遷移先URLを入力してください。')
      return
    }

    try {
      const url = new URL(originalUrl)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
    } catch {
      setFormError('遷移先URLは http:// または https:// で入力してください。')
      return
    }

    setSaving(true)
    try {
      const res = await fetchApi<ApiResponse<TrackedLink>>('/api/tracked-links', {
        method: 'POST',
        body: JSON.stringify({
          name,
          originalUrl,
          tagId: form.tagId || null,
        }),
      })

      if (res.success) {
        setLinks((current) => [res.data, ...current])
        setForm({ name: '', originalUrl: '', tagId: '' })
        setShowCreate(false)
        setNotice({ type: 'success', text: 'トラッキングリンクを作成しました。' })
      } else {
        setFormError(res.error)
      }
    } catch (err) {
      setFormError(getErrorMessage(err, '作成に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (link: TrackedLink) => {
    setNotice(null)
    try {
      const res = await fetchApi<ApiResponse<TrackedLink>>(`/api/tracked-links/${link.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !link.isActive }),
      })
      if (res.success) {
        setLinks((current) => current.map((item) => (item.id === link.id ? res.data : item)))
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '状態変更に失敗しました。') })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このトラッキングリンクを削除しますか？')) return

    setNotice(null)
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/tracked-links/${id}`, { method: 'DELETE' })
      if (res.success) {
        setLinks((current) => current.filter((link) => link.id !== id))
        setNotice({ type: 'success', text: 'トラッキングリンクを削除しました。' })
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '削除に失敗しました。') })
    }
  }

  const handleCopy = async (link: TrackedLink) => {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(link.trackingUrl)
      setCopiedId(link.id)
      window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setNotice({ type: 'error', text: 'コピーに失敗しました。' })
    }
  }

  const activeCount = links.filter((link) => link.isActive).length

  return (
    <div>
      <Header
        title="トラッキングリンク"
        description="広告や投稿ごとのクリックを確認"
        action={
          <button
            onClick={() => {
              setShowCreate((current) => !current)
              setFormError('')
            }}
            className="px-4 py-2 min-h-[44px] rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: PRIMARY_COLOR }}
          >
            {showCreate ? 'キャンセル' : '+ 新規リンク'}
          </button>
        }
      />

      {notice && (
        <div
          className={
            'mb-4 rounded-lg border p-3 text-sm flex items-center justify-between gap-3 ' +
            (notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700')
          }
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-gray-500 hover:text-gray-700">
            閉じる
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規リンクを作成</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">リンク名</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: Instagram広告"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">遷移先URL</label>
              <input
                type="url"
                value={form.originalUrl}
                onChange={(event) => setForm({ ...form, originalUrl: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">クリック時に付けるタグ</label>
              <select
                value={form.tagId}
                onChange={(event) => setForm({ ...form, tagId: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">タグなし</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-sm text-red-600">{formError}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 min-h-[44px] rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_COLOR }}
            >
              {saving ? '作成中...' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setFormError('')
              }}
              className="px-4 py-2 min-h-[44px] rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        </form>
      )}

      {!loading && !error && links.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <MetricCard label="リンク数" value={links.length.toLocaleString('ja-JP')} />
            <MetricCard label="有効リンク" value={activeCount.toLocaleString('ja-JP')} />
            <MetricCard label="総クリック" value={totalClicks.toLocaleString('ja-JP')} />
          </div>
          <ClickRanking links={links} />
        </>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          読み込み中...
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={load} className="mt-3 text-sm text-red-600 underline">
            再読み込み
          </button>
        </div>
      ) : links.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          トラッキングリンクがまだありません
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">リンク</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">付与タグ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">クリック</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">作成日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {links.map((link) => {
                const tag = link.tagId ? tagById.get(link.tagId) : null
                return (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{link.name}</div>
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block max-w-[280px] truncate text-xs text-blue-600 hover:underline"
                      >
                        {link.originalUrl}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {tag ? (
                        <span className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">タグなし</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {link.clickCount.toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
                          (link.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {link.isActive ? '有効' : '停止中'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(link.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(link)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {copiedId === link.id ? 'コピー済' : 'コピー'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(link)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {link.isActive ? '停止' : '有効化'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(link.id)}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
