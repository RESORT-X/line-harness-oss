'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'
import FlexPreviewComponent from '@/components/flex-preview'

type MessageTemplateType = 'text' | 'flex'

interface MessageTemplate {
  id: string
  name: string
  messageType: MessageTemplateType
  messageContent: string
  createdAt: string
  updatedAt: string
}

interface FormState {
  name: string
  messageType: MessageTemplateType
  messageContent: string
}

interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

const emptyForm: FormState = {
  name: '',
  messageType: 'text',
  messageContent: '',
}

const typeLabels: Record<MessageTemplateType, string> = {
  text: 'テキスト',
  flex: 'Flex',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function validateForm(form: FormState): string {
  if (!form.name.trim()) return 'テンプレート名を入力してください'
  if (!form.messageContent.trim()) return 'メッセージ内容を入力してください'
  if (form.messageType === 'flex') {
    try {
      JSON.parse(form.messageContent)
    } catch {
      return 'FlexメッセージはJSON形式で入力してください'
    }
  }
  return ''
}

function TemplatePreview({ template }: { template: MessageTemplate }) {
  if (template.messageType === 'flex') {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 overflow-x-auto">
        <FlexPreviewComponent content={template.messageContent} maxWidth={260} />
      </div>
    )
  }

  return (
    <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
      {template.messageContent}
    </div>
  )
}

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<MessageTemplate | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | MessageTemplateType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResult<MessageTemplate[]>>('/api/message-templates')
      if (res.success && res.data) {
        setTemplates(res.data)
      } else {
        setError(res.error || 'テンプレートの読み込みに失敗しました。')
      }
    } catch {
      setError('テンプレートの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => templates.filter((template) => typeFilter === 'all' || template.messageType === typeFilter),
    [templates, typeFilter]
  )

  const typeCounts = useMemo(
    () => ({
      text: templates.filter((template) => template.messageType === 'text').length,
      flex: templates.filter((template) => template.messageType === 'flex').length,
    }),
    [templates]
  )

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (template: MessageTemplate) => {
    setEditing(template)
    setForm({
      name: template.name,
      messageType: template.messageType,
      messageContent: template.messageContent,
    })
    setFormError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
  }

  const handleSave = async () => {
    const validationError = validateForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: form.name.trim(),
        messageType: form.messageType,
        messageContent: form.messageContent.trim(),
      }
      const res = editing
        ? await fetchApi<ApiResult<MessageTemplate>>(`/api/message-templates/${editing.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await fetchApi<ApiResult<MessageTemplate>>('/api/message-templates', {
            method: 'POST',
            body: JSON.stringify(payload),
          })

      if (!res.success) {
        setFormError(res.error || '保存に失敗しました')
        return
      }

      closeForm()
      await load()
    } catch {
      setFormError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (template: MessageTemplate) => {
    if (!confirm(`「${template.name}」を削除してもよいですか？`)) return
    try {
      const res = await fetchApi<ApiResult<null>>(`/api/message-templates/${template.id}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        setError(res.error || '削除に失敗しました')
        return
      }
      if (expandedId === template.id) setExpandedId(null)
      await load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setNotice('メッセージ内容をコピーしました')
      window.setTimeout(() => setNotice(''), 2000)
    } catch {
      setError('コピーに失敗しました。ブラウザの権限を確認してください。')
    }
  }

  return (
    <div>
      <Header
        title="配信用テンプレート"
        description="シナリオ配信や一斉配信で再利用する本文を管理します"
        action={
          <button
            onClick={openCreate}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            新規テンプレート
          </button>
        }
      />

      {notice && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs text-center">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          ['all', '全て', templates.length],
          ['text', 'テキスト', typeCounts.text],
          ['flex', 'Flex', typeCounts.flex],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${
              typeFilter === value ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
            style={typeFilter === value ? { backgroundColor: '#06C755' } : undefined}
          >
            {label} ({count})
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">表示 {filtered.length}件</span>
      </div>

      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">
            {editing ? 'テンプレート編集' : '新規テンプレート'}
          </h2>
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                テンプレート名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 予約完了フォロー"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メッセージタイプ</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.messageType}
                onChange={(e) => setForm({ ...form, messageType: e.target.value as MessageTemplateType })}
              >
                <option value="text">テキスト</option>
                <option value="flex">Flex</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                メッセージ内容 <span className="text-red-500">*</span>
                {form.messageType === 'flex' && (
                  <span className="ml-1 text-gray-400 font-normal">(JSON形式)</span>
                )}
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y font-mono"
                rows={form.messageType === 'flex' ? 10 : 5}
                placeholder={form.messageType === 'flex' ? '{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[]}}' : 'メッセージ内容を入力してください'}
                value={form.messageContent}
                onChange={(e) => setForm({ ...form, messageContent: e.target.value })}
              />
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? '保存中...' : editing ? '更新' : '作成'}
              </button>
              <button
                onClick={closeForm}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-72" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && !showForm ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            {templates.length === 0
              ? 'テンプレートがありません。「新規テンプレート」から作成してください。'
              : '条件に合うテンプレートがありません。'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    テンプレート
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    タイプ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    更新日時
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((template) => {
                  const expanded = expandedId === template.id
                  return (
                    <tr key={template.id} className="align-top hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{template.name}</p>
                        {expanded ? (
                          <div className="mt-3">
                            <TemplatePreview template={template} />
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-lg">
                            {template.messageType === 'flex'
                              ? 'Flexメッセージ'
                              : template.messageContent}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            template.messageType === 'flex'
                              ? 'bg-orange-50 text-orange-600'
                              : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {typeLabels[template.messageType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(template.updatedAt || template.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setExpandedId(expanded ? null : template.id)}
                            className="px-3 py-1 min-h-[32px] text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            {expanded ? '閉じる' : 'プレビュー'}
                          </button>
                          <button
                            onClick={() => handleCopy(template.messageContent)}
                            className="px-3 py-1 min-h-[32px] text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            コピー
                          </button>
                          <button
                            onClick={() => openEdit(template)}
                            className="px-3 py-1 min-h-[32px] text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(template)}
                            className="px-3 py-1 min-h-[32px] text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
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
        </div>
      )}
    </div>
  )
}
