'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Tag } from '@line-crm/shared'
import { api, fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type ApiResult<T> = {
  success: boolean
  data: T
  error?: string
}

interface FriendDetailData {
  id: string
  lineUserId: string
  displayName: string | null
  pictureUrl: string | null
  statusMessage: string | null
  isFollowing: boolean
  metadata: Record<string, unknown>
  refCode: string | null
  userId?: string | null
  tags: Tag[]
  createdAt: string
  updatedAt?: string
}

interface MessageLog {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface FormForMetadataLabels {
  id: string
  fields: Array<{
    name?: string
    label?: string
  }>
}

interface LeadFormSubmissionField {
  key?: string
  label?: string
  value?: unknown
}

interface LeadFormSubmission {
  source?: string
  submittedAt?: string
  fullName?: string
  fields?: LeadFormSubmissionField[]
}

type TabKey = 'profile' | 'history'

const TAG_COLORS = ['#06C755', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#14B8A6']

const messageTypeLabels: Record<string, string> = {
  text: 'テキスト',
  image: '画像',
  flex: 'Flex',
}

const fallbackMetadataLabels: Record<string, string> = {
  interest_level: '検討状況',
  preferred_contact_time: '希望連絡時間',
  questions: '相談内容',
  phone: '電話番号',
  email: 'メールアドレス',
  line_ref: '流入元',
  line_latest_form_id: '最新フォームID',
  line_latest_form_submitted_at: '最新フォーム回答日時',
  line_latest_form_answers_json: '最新フォーム回答内容',
  lp_form_submission: 'フォーム入力項目',
}

const hiddenMetadataKeys = new Set(['real_name', 'lp_form_submission_text'])

function formatDateTime(iso?: string | null) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => (item === null || item === undefined ? '' : String(item)))
      .filter(Boolean)
      .join('、')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return formatMetadataValue(parsed)
      } catch {
        // 文字列として表示する。
      }
    }
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatMetadataLabel(key: string, labels: Record<string, string>) {
  return labels[key] || fallbackMetadataLabels[key] || key
}

function getRealName(metadata?: Record<string, unknown> | null) {
  const value = metadata?.real_name
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function isLeadFormSubmission(value: unknown): value is LeadFormSubmission {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as LeadFormSubmission).fields),
  )
}

function normalizeLeadFields(value: LeadFormSubmission) {
  return (value.fields || [])
    .map((field) => {
      const label = typeof field.label === 'string' ? field.label.trim() : ''
      const key = typeof field.key === 'string' ? field.key.trim() : ''
      const formattedValue = formatMetadataValue(field.value).trim()
      if (!formattedValue) return null
      return {
        key,
        label: label || key || '項目',
        value: formattedValue,
      }
    })
    .filter((field): field is { key: string; label: string; value: string } => Boolean(field))
}

function MetadataValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false)

  if (isLeadFormSubmission(value)) {
    const fields = normalizeLeadFields(value)
    const totalLength = fields.reduce((sum, field) => sum + field.label.length + field.value.length, 0)
    const shouldCollapse = fields.length > 6 || totalLength > 420
    const visibleFields = shouldCollapse && !expanded ? fields.slice(0, 6) : fields

    return (
      <div className="mt-2">
        {(value.source || value.submittedAt) && (
          <p className="mb-3 text-xs text-gray-400">
            {[value.source, value.submittedAt ? formatDateTime(value.submittedAt) : ''].filter(Boolean).join(' / ')}
          </p>
        )}
        <div className="space-y-2">
          {visibleFields.map((field, index) => (
            <div key={`${field.key || field.label}-${index}`} className="rounded-md bg-white border border-gray-100 px-3 py-2">
              <p className="text-xs font-medium text-gray-500">{field.label}</p>
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">{field.value}</p>
            </div>
          ))}
        </div>
        {shouldCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="mt-3 text-xs font-medium text-green-700 hover:text-green-800"
          >
            {expanded ? '閉じる' : `すべて見る（${fields.length}項目）`}
          </button>
        )}
      </div>
    )
  }

  const text = formatMetadataValue(value)
  const lines = text.split(/\r?\n/)
  const shouldCollapse = text.length > 220 || lines.length > 6
  const visibleText = !shouldCollapse || expanded
    ? text
    : lines.length > 6
      ? `${lines.slice(0, 6).join('\n')}\n...`
      : `${text.slice(0, 220)}...`

  return (
    <>
      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">{visibleText}</p>
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-xs font-medium text-green-700 hover:text-green-800"
        >
          {expanded ? '閉じる' : 'すべて見る'}
        </button>
      )}
    </>
  )
}

function collectFlexText(value: unknown, texts: string[]) {
  if (!value || typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  if (obj.type === 'text' && typeof obj.text === 'string') {
    const text = obj.text.trim()
    if (text && !text.startsWith('{{')) texts.push(text)
  }
  for (const key of ['header', 'hero', 'body', 'footer']) {
    collectFlexText(obj[key], texts)
  }
  if (Array.isArray(obj.contents)) {
    for (const child of obj.contents) collectFlexText(child, texts)
  }
}

function renderMessageContent(message: MessageLog) {
  if (message.messageType === 'text') return message.content
  if (message.messageType === 'image') return '[画像]'
  if (message.messageType === 'flex') {
    try {
      const parsed = JSON.parse(message.content)
      const texts: string[] = []
      collectFlexText(parsed, texts)
      return texts.slice(0, 4).join(' / ') || '[Flex Message]'
    } catch {
      return '[Flex Message]'
    }
  }
  return `[${message.messageType}]`
}

export default function FriendDetail({ friendId }: { friendId: string }) {
  const [friend, setFriend] = useState<FriendDetailData | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('profile')

  const [selectedTagId, setSelectedTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [tagSaving, setTagSaving] = useState(false)
  const [tagError, setTagError] = useState('')

  const [metadataKey, setMetadataKey] = useState('')
  const [metadataValue, setMetadataValue] = useState('')
  const [metadataLabels, setMetadataLabels] = useState<Record<string, string>>({})
  const [metadataSaving, setMetadataSaving] = useState(false)
  const [metadataError, setMetadataError] = useState('')

  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messageError, setMessageError] = useState('')

  const loadFriend = useCallback(async () => {
    if (!friendId) {
      setError('友だちIDが指定されていません')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResult<FriendDetailData>>(`/api/friends/${friendId}`)
      if (res.success) {
        setFriend(res.data)
      } else {
        setError(res.error || '友だちの読み込みに失敗しました')
      }
    } catch {
      setError('友だちの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [friendId])

  const loadTags = useCallback(async () => {
    try {
      const res = await api.tags.list()
      if (res.success) setAllTags(res.data)
    } catch {
      // タグ一覧は補助情報なので、詳細画面全体は止めない。
    }
  }, [])

  const loadFormLabels = useCallback(async () => {
    try {
      const res = await fetchApi<ApiResult<FormForMetadataLabels[]>>('/api/forms')
      if (!res.success) return
      const labels: Record<string, string> = {}
      for (const form of res.data) {
        for (const field of form.fields || []) {
          const name = field.name?.trim()
          const label = field.label?.trim()
          if (name && label) labels[name] = label
        }
      }
      setMetadataLabels(labels)
    } catch {
      // フォームラベルは表示補助なので、友だち詳細の表示自体は止めない。
    }
  }, [])

  const loadMessages = useCallback(async () => {
    if (!friendId) return
    setLoadingMessages(true)
    setMessageError('')
    try {
      const res = await fetchApi<ApiResult<MessageLog[]>>(`/api/friends/${friendId}/messages`)
      if (res.success) {
        setMessages(res.data)
      } else {
        setMessageError(res.error || 'メッセージ履歴の読み込みに失敗しました')
      }
    } catch {
      setMessageError('メッセージ履歴の読み込みに失敗しました')
    } finally {
      setLoadingMessages(false)
    }
  }, [friendId])

  useEffect(() => {
    loadFriend()
    loadTags()
    loadFormLabels()
  }, [loadFriend, loadTags, loadFormLabels])

  useEffect(() => {
    if (activeTab === 'history') loadMessages()
  }, [activeTab, loadMessages])

  const availableTags = useMemo(() => {
    if (!friend) return []
    return allTags.filter((tag) => !friend.tags.some((friendTag) => friendTag.id === tag.id))
  }, [allTags, friend])

  const metadataEntries = useMemo(() => {
    return Object.entries(friend?.metadata || {}).filter(([key, value]) => {
      return !hiddenMetadataKeys.has(key) && value !== null && value !== undefined
    })
  }, [friend])

  const realName = useMemo(() => getRealName(friend?.metadata), [friend])

  const addExistingTag = async () => {
    if (!selectedTagId || !friend) return
    setTagSaving(true)
    setTagError('')
    try {
      const res = await api.friends.addTag(friend.id, selectedTagId)
      if (!res.success) {
        setTagError(res.error || 'タグの追加に失敗しました')
        return
      }
      setSelectedTagId('')
      await loadFriend()
    } catch {
      setTagError('タグの追加に失敗しました')
    } finally {
      setTagSaving(false)
    }
  }

  const createAndAddTag = async () => {
    const name = newTagName.trim()
    if (!name || !friend) return
    setTagSaving(true)
    setTagError('')
    try {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
      const created = await api.tags.create({ name, color })
      if (!created.success) {
        setTagError(created.error || 'タグの作成に失敗しました')
        return
      }
      const added = await api.friends.addTag(friend.id, created.data.id)
      if (!added.success) {
        setTagError(added.error || 'タグの追加に失敗しました')
        return
      }
      setNewTagName('')
      await Promise.all([loadFriend(), loadTags()])
    } catch {
      setTagError('タグの作成に失敗しました')
    } finally {
      setTagSaving(false)
    }
  }

  const removeTag = async (tagId: string) => {
    if (!friend) return
    setTagSaving(true)
    setTagError('')
    try {
      const res = await api.friends.removeTag(friend.id, tagId)
      if (!res.success) {
        setTagError(res.error || 'タグの削除に失敗しました')
        return
      }
      await loadFriend()
    } catch {
      setTagError('タグの削除に失敗しました')
    } finally {
      setTagSaving(false)
    }
  }

  const saveMetadata = async () => {
    if (!friend || !metadataKey.trim() || !metadataValue.trim()) return
    setMetadataSaving(true)
    setMetadataError('')
    try {
      const res = await fetchApi<ApiResult<FriendDetailData>>(`/api/friends/${friend.id}/metadata`, {
        method: 'PUT',
        body: JSON.stringify({ [metadataKey.trim()]: metadataValue.trim() }),
      })
      if (!res.success) {
        setMetadataError(res.error || 'メモの保存に失敗しました')
        return
      }
      setFriend(res.data)
      setMetadataKey('')
      setMetadataValue('')
    } catch {
      setMetadataError('メモの保存に失敗しました')
    } finally {
      setMetadataSaving(false)
    }
  }

  const deleteMetadata = async (key: string) => {
    if (!friend) return
    setMetadataSaving(true)
    setMetadataError('')
    try {
      const res = await fetchApi<ApiResult<FriendDetailData>>(`/api/friends/${friend.id}/metadata`, {
        method: 'PUT',
        body: JSON.stringify({ [key]: null }),
      })
      if (!res.success) {
        setMetadataError(res.error || 'メモの削除に失敗しました')
        return
      }
      setFriend(res.data)
    } catch {
      setMetadataError('メモの削除に失敗しました')
    } finally {
      setMetadataSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="友だち詳細" description="プロフィール、タグ、メモ、メッセージ履歴を確認します" />
        <div className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-3 w-56 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !friend) {
    return (
      <div>
        <Header title="友だち詳細" description="プロフィール、タグ、メモ、メッセージ履歴を確認します" />
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-red-600">{error || '友だちが見つかりません'}</p>
          <Link href="/friends" className="mt-4 inline-flex px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
            友だち一覧へ戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="友だち詳細"
        description="プロフィール、タグ、メモ、メッセージ履歴を確認します"
        action={
          <Link href="/friends" className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
            一覧へ戻る
          </Link>
        }
      />

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {friend.pictureUrl ? (
              <img
                src={friend.pictureUrl}
                alt={friend.displayName || 'LINE user'}
                className="h-14 w-14 rounded-full object-cover bg-gray-100 flex-shrink-0"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold flex-shrink-0">
                {(friend.displayName || '?').charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                {friend.displayName || '名前なし'}
                {realName && <span className="ml-1 text-sm font-semibold text-gray-500">（{realName}）</span>}
              </h1>
              {friend.statusMessage && (
                <p className="mt-0.5 text-sm text-gray-500 truncate">{friend.statusMessage}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  friend.isFollowing ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {friend.isFollowing ? 'フォロー中' : 'ブロック/退会'}
                </span>
                {friend.refCode && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    ref: {friend.refCode}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 sm:text-right">
            <p>登録日: {formatDateTime(friend.createdAt)}</p>
            <p className="mt-1 font-mono text-gray-400 break-all">{friend.lineUserId}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
        {[
          { key: 'profile' as const, label: '基本情報' },
          { key: 'history' as const, label: '履歴' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab === tab.key ? { backgroundColor: '#06C755' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-gray-900">タグ</h2>
              <span className="text-xs text-gray-400">{friend.tags.length}件</span>
            </div>
            {tagError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {tagError}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {friend.tags.length === 0 ? (
                <p className="text-sm text-gray-400">タグはまだありません</p>
              ) : (
                friend.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: `${tag.color || '#06C755'}20`,
                      color: tag.color || '#047857',
                    }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => removeTag(tag.id)}
                      disabled={tagSaving}
                      className="text-current opacity-60 hover:opacity-100 disabled:opacity-30"
                      aria-label={`${tag.name}を削除`}
                    >
                      x
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedTagId}
                  onChange={(e) => setSelectedTagId(e.target.value)}
                  disabled={availableTags.length === 0 || tagSaving}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">既存タグを選択</option>
                  {availableTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addExistingTag}
                  disabled={!selectedTagId || tagSaving}
                  className="px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: '#06C755' }}
                >
                  追加
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndAddTag()
                  }}
                  placeholder="新しいタグ名"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={createAndAddTag}
                  disabled={!newTagName.trim() || tagSaving}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40"
                >
                  作成して追加
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-gray-900">メモ</h2>
              <span className="text-xs text-gray-400">{metadataEntries.length}件</span>
            </div>
            {metadataError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {metadataError}
              </div>
            )}
            <div className="space-y-2 mb-4">
              {metadataEntries.length === 0 ? (
                <p className="text-sm text-gray-400">メモはまだありません</p>
              ) : (
                metadataEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 break-all" title={key}>
                          {formatMetadataLabel(key, metadataLabels)}
                        </p>
                        <MetadataValue value={value} />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMetadata(key)}
                        disabled={metadataSaving}
                        className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr]">
                <input
                  type="text"
                  value={metadataKey}
                  onChange={(e) => setMetadataKey(e.target.value)}
                  placeholder="項目名"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="text"
                  value={metadataValue}
                  onChange={(e) => setMetadataValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveMetadata()
                  }}
                  placeholder="内容"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                type="button"
                onClick={saveMetadata}
                disabled={!metadataKey.trim() || !metadataValue.trim() || metadataSaving}
                className="w-full px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                style={{ backgroundColor: '#06C755' }}
              >
                {metadataSaving ? '保存中...' : 'メモを保存'}
              </button>
            </div>
          </section>
        </div>
      ) : (
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">メッセージ履歴</h2>
            <button
              type="button"
              onClick={loadMessages}
              disabled={loadingMessages}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40"
            >
              更新
            </button>
          </div>
          {messageError && (
            <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {messageError}
            </div>
          )}
          {loadingMessages ? (
            <div className="p-8 text-center text-sm text-gray-400">読み込み中...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">メッセージ履歴はまだありません</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {messages.map((message) => {
                const outgoing = message.direction === 'outgoing'
                return (
                  <div key={message.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${outgoing ? 'bg-green-500' : 'bg-blue-500'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${outgoing ? 'text-green-700' : 'text-blue-700'}`}>
                            {outgoing ? '送信' : '受信'}
                          </span>
                          <span className="text-xs text-gray-400">{formatDateTime(message.createdAt)}</span>
                          <span className="text-xs text-gray-400">{messageTypeLabels[message.messageType] || message.messageType}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                          {renderMessageContent(message)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
