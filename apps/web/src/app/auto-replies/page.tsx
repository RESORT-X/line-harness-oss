'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'

type ApiResult<T> = {
  success: boolean
  data: T
  error?: string
}

interface AutoReply {
  id: string
  keyword: string
  matchType: 'exact' | 'contains'
  responseType: string
  responseContent: string
  lineAccountId: string | null
  isActive: boolean
  createdAt: string
}

interface AutoReplyForm {
  keyword: string
  matchType: 'exact' | 'contains'
  responseType: string
  responseContent: string
}

const DEFAULT_FORM: AutoReplyForm = {
  keyword: '',
  matchType: 'contains',
  responseType: 'text',
  responseContent: '',
}

const matchTypeLabels: Record<AutoReply['matchType'], string> = {
  exact: '完全一致',
  contains: '部分一致',
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function findMatchedRule(input: string, items: AutoReply[]) {
  if (!input) return null
  const ordered = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return ordered.find((item) => {
    if (!item.isActive) return false
    if (item.matchType === 'exact') return input === item.keyword
    return input.includes(item.keyword)
  }) ?? null
}

export default function AutoRepliesPage() {
  const { selectedAccountId } = useAccount()
  const [items, setItems] = useState<AutoReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<AutoReply | null>(null)
  const [form, setForm] = useState<AutoReplyForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [testInput, setTestInput] = useState('')
  const [testMatch, setTestMatch] = useState<AutoReply | null | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = selectedAccountId ? `?accountId=${encodeURIComponent(selectedAccountId)}` : ''
      const res = await fetchApi<ApiResult<AutoReply[]>>(`/api/auto-replies${params}`)
      if (res.success) {
        setItems(res.data)
      } else {
        setError(res.error || '自動返信の読み込みに失敗しました')
      }
    } catch {
      setError('自動返信の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditItem(null)
    setForm(DEFAULT_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (item: AutoReply) => {
    setEditItem(item)
    setForm({
      keyword: item.keyword,
      matchType: item.matchType,
      responseType: item.responseType,
      responseContent: item.responseContent,
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.keyword.trim() || !form.responseContent.trim()) {
      setFormError('キーワードと返信内容を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const body = {
        keyword: form.keyword.trim(),
        matchType: form.matchType,
        responseType: form.responseType,
        responseContent: form.responseContent.trim(),
        ...(editItem ? {} : { lineAccountId: selectedAccountId || null }),
      }
      const res = editItem
        ? await fetchApi<ApiResult<AutoReply>>(`/api/auto-replies/${editItem.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await fetchApi<ApiResult<AutoReply>>('/api/auto-replies', {
            method: 'POST',
            body: JSON.stringify(body),
          })

      if (!res.success) {
        setFormError(res.error || '保存に失敗しました')
        return
      }
      setShowForm(false)
      setEditItem(null)
      setForm(DEFAULT_FORM)
      await load()
    } catch {
      setFormError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AutoReply) => {
    if (!confirm(`「${item.keyword}」を削除してもよいですか？`)) return
    setError('')
    try {
      const res = await fetchApi<ApiResult<null>>(`/api/auto-replies/${item.id}`, { method: 'DELETE' })
      if (!res.success) {
        setError(res.error || '削除に失敗しました')
        return
      }
      await load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleToggle = async (item: AutoReply) => {
    setError('')
    try {
      const res = await fetchApi<ApiResult<AutoReply>>(`/api/auto-replies/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      if (!res.success) {
        setError(res.error || '状態の更新に失敗しました')
        return
      }
      await load()
    } catch {
      setError('状態の更新に失敗しました')
    }
  }

  const handleTest = () => {
    setTestMatch(findMatchedRule(testInput, items))
  }

  const scopeLabel = (item: AutoReply) => {
    if (!item.lineAccountId) return '共通'
    if (item.lineAccountId === selectedAccountId) return '選択中アカウント'
    return '個別'
  }

  return (
    <div>
      <Header
        title="自動返信設定"
        description="受信メッセージのキーワードに応じた自動返信ルールを管理します"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: '#06C755' }}
          >
            新規キーワード追加
          </button>
        }
      />

      <section className="mb-4 bg-white border border-gray-200 rounded-lg p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-900">キーワードテスター</h2>
          <p className="mt-1 text-xs text-gray-500">実際のWebhookと同じ順序と一致条件で、現在の有効ルールを確認します。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={testInput}
            onChange={(event) => setTestInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleTest()
            }}
            placeholder="ユーザーのメッセージを入力"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="button"
            onClick={handleTest}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: '#06C755' }}
          >
            テスト
          </button>
        </div>
        {testMatch !== undefined && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            testMatch ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}>
            {testMatch ? (
              <div>
                <p className="font-medium">
                  「{testMatch.keyword}」にマッチしました（{matchTypeLabels[testMatch.matchType]}）
                </p>
                <p className="mt-1 text-xs whitespace-pre-wrap break-words">{testMatch.responseContent}</p>
              </div>
            ) : (
              'マッチする有効ルールはありません'
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200 p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900">{editItem ? '自動返信を編集' : '新規自動返信'}</h2>
              <p className="mt-1 text-sm text-gray-500">キーワードと返信内容を設定します。</p>
            </div>
            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">キーワード</label>
                <input
                  type="text"
                  value={form.keyword}
                  onChange={(event) => setForm((current) => ({ ...current, keyword: event.target.value }))}
                  placeholder="例: キャンセル"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">一致タイプ</label>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                  {(['contains', 'exact'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, matchType: type }))}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        form.matchType === type ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      style={form.matchType === type ? { backgroundColor: '#06C755' } : undefined}
                    >
                      {matchTypeLabels[type]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {form.matchType === 'exact'
                    ? 'ユーザーのメッセージがキーワードと完全一致したときに返信します。'
                    : 'ユーザーのメッセージにキーワードが含まれるときに返信します。'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">返信内容</label>
                <textarea
                  value={form.responseContent}
                  onChange={(event) => setForm((current) => ({ ...current, responseContent: event.target.value }))}
                  rows={5}
                  placeholder="返信するメッセージを入力"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.keyword.trim() || !form.responseContent.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="px-4 py-4 border-b border-gray-100 animate-pulse">
              <div className="h-3 w-40 rounded bg-gray-200" />
              <div className="mt-2 h-2 w-64 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">自動返信はまだ設定されていません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">キーワード</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">一致</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">返信内容</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">範囲</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">状態</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">作成日</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.keyword}</td>
                    <td className="px-4 py-3 text-gray-600">{matchTypeLabels[item.matchType]}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <p className="max-w-xs truncate">{item.responseContent}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{scopeLabel(item)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                          item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {item.isActive ? '有効' : '無効'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="mr-3 text-xs font-medium text-gray-700 hover:text-gray-900"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="text-xs font-medium text-red-500 hover:text-red-700"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
