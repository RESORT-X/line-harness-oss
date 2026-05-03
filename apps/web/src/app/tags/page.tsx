'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Tag } from '@line-crm/shared'
import Header from '@/components/layout/header'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'

type TagWithCount = Tag & { friendCount?: number }
type Notice = { type: 'success' | 'error'; text: string } | null

const PRIMARY_COLOR = '#06C755'
const TAG_COLORS = ['#06C755', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280']

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function TagUsage({ tags }: { tags: TagWithCount[] }) {
  const ranked = [...tags]
    .filter((tag) => (tag.friendCount ?? 0) > 0)
    .sort((a, b) => (b.friendCount ?? 0) - (a.friendCount ?? 0))
    .slice(0, 5)

  if (ranked.length === 0) return null

  const maxCount = Math.max(...ranked.map((tag) => tag.friendCount ?? 0), 1)

  return (
    <div className="mb-6 bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">利用数の多いタグ</h2>
      <div className="space-y-3">
        {ranked.map((tag) => (
          <div key={tag.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-gray-600">{tag.name}</span>
            <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(8, ((tag.friendCount ?? 0) / maxCount) * 100)}%`,
                  backgroundColor: tag.color,
                }}
              />
            </div>
            <span className="w-12 text-right text-xs font-semibold text-gray-800">
              {(tag.friendCount ?? 0).toLocaleString('ja-JP')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TagsPage() {
  const { selectedAccountId, loading: accountLoading } = useAccount()
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ name: '', color: PRIMARY_COLOR })

  const load = useCallback(async () => {
    if (accountLoading) return

    setLoading(true)
    setError('')
    try {
      const res = await api.tags.list()
      if (!res.success) {
        setError(res.error)
        setTags([])
        return
      }

      const baseTags = res.data.map((tag) => ({ ...tag, friendCount: undefined }))
      setTags(baseTags)

      const countResults = await Promise.allSettled(
        baseTags.map(async (tag) => {
          const friendsRes = await api.friends.list({
            tagId: tag.id,
            limit: 1,
            accountId: selectedAccountId || undefined,
          })
          if (!friendsRes.success) return null
          return { id: tag.id, count: friendsRes.data.total }
        }),
      )

      const counts = new Map<string, number>()
      for (const result of countResults) {
        if (result.status === 'fulfilled' && result.value) {
          counts.set(result.value.id, result.value.count)
        }
      }

      setTags(baseTags.map((tag) => ({ ...tag, friendCount: counts.get(tag.id) })))
    } catch (err) {
      setError(getErrorMessage(err, 'タグの読み込みに失敗しました。'))
    } finally {
      setLoading(false)
    }
  }, [accountLoading, selectedAccountId])

  useEffect(() => {
    load()
  }, [load])

  const totalAssigned = useMemo(() => {
    return tags.reduce((total, tag) => total + (tag.friendCount ?? 0), 0)
  }, [tags])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')
    setNotice(null)

    const name = form.name.trim()
    if (!name) {
      setFormError('タグ名を入力してください。')
      return
    }

    setSaving(true)
    try {
      const res = await api.tags.create({ name, color: form.color })
      if (res.success) {
        setForm({ name: '', color: PRIMARY_COLOR })
        setShowCreate(false)
        setNotice({ type: 'success', text: 'タグを作成しました。' })
        load()
      } else {
        setFormError(res.error)
      }
    } catch (err) {
      setFormError(getErrorMessage(err, '作成に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tag: TagWithCount) => {
    if (!confirm(`「${tag.name}」を削除しますか？`)) return

    setNotice(null)
    try {
      const res = await api.tags.delete(tag.id)
      if (res.success) {
        setTags((current) => current.filter((item) => item.id !== tag.id))
        setNotice({ type: 'success', text: 'タグを削除しました。' })
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '削除に失敗しました。') })
    }
  }

  return (
    <div>
      <Header
        title="タグ管理"
        description="友だち分類に使うタグを管理"
        action={
          <button
            onClick={() => {
              setShowCreate((current) => !current)
              setFormError('')
            }}
            className="px-4 py-2 min-h-[44px] rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: PRIMARY_COLOR }}
          >
            {showCreate ? 'キャンセル' : '+ 新規タグ'}
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
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規タグを作成</h2>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タグ名</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 広告経由"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カラー</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`カラー ${color}`}
                    onClick={() => setForm({ ...form, color })}
                    className={
                      'h-9 w-9 rounded-full border-2 transition ' +
                      (form.color === color ? 'border-gray-900' : 'border-transparent')
                    }
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
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

      {!loading && !error && tags.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <MetricCard label="タグ数" value={tags.length.toLocaleString('ja-JP')} />
            <MetricCard label="タグ付け済み延べ人数" value={totalAssigned.toLocaleString('ja-JP')} />
          </div>
          <TagUsage tags={tags} />
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
      ) : tags.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          タグがまだありません
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div key={tag.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    <h2 className="truncate text-sm font-semibold text-gray-900">{tag.name}</h2>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    友だち {tag.friendCount === undefined ? '-' : tag.friendCount.toLocaleString('ja-JP')}人
                  </p>
                  <p className="mt-1 text-xs text-gray-400">作成日 {formatDate(tag.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(tag)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
