'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import type { ApiResponse, MessageType, Scenario, Tag } from '@line-crm/shared'
import Header from '@/components/layout/header'
import { api, fetchApi } from '@/lib/api'

type Notice = { type: 'success' | 'error'; text: string } | null
type FormFieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date'

interface FormField {
  name: string
  label: string
  type: FormFieldType
  required?: boolean
  options?: string[]
  placeholder?: string
  columns?: number
}

interface EditableField {
  id: string
  name: string
  label: string
  type: FormFieldType
  required: boolean
  placeholder: string
  optionsText: string
  columns: number
}

interface ManagedForm {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  onSubmitTagId: string | null
  onSubmitScenarioId: string | null
  onSubmitMessageType: MessageType | null
  onSubmitMessageContent: string | null
  onSubmitWebhookUrl: string | null
  onSubmitWebhookHeaders: string | null
  onSubmitWebhookFailMessage: string | null
  saveToMetadata: boolean
  isActive: boolean
  submitCount: number
  createdAt: string
  updatedAt: string
}

interface EditorState {
  name: string
  description: string
  isActive: boolean
  fields: EditableField[]
  onSubmitTagId: string
  onSubmitScenarioId: string
  onSubmitMessageType: MessageType
  onSubmitMessageContent: string
  onSubmitWebhookUrl: string
  onSubmitWebhookHeaders: string
  onSubmitWebhookFailMessage: string
  saveToMetadata: boolean
}

const PRIMARY_COLOR = '#06C755'

const fieldTypeOptions: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: '短文' },
  { value: 'textarea', label: '長文' },
  { value: 'radio', label: '単一選択' },
  { value: 'checkbox', label: '複数選択' },
  { value: 'select', label: 'プルダウン' },
  { value: 'email', label: 'メール' },
  { value: 'tel', label: '電話番号' },
  { value: 'number', label: '数値' },
  { value: 'date', label: '日付' },
]

const messageTypeOptions: { value: MessageType; label: string }[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'flex', label: 'Flex JSON' },
]

function newField(overrides: Partial<EditableField> = {}): EditableField {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: '',
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    optionsText: '',
    columns: 1,
    ...overrides,
  }
}

function defaultEditorState(): EditorState {
  return {
    name: '資料請求後アンケート',
    description: '資料請求後にLINEで回答してもらう簡単なアンケート',
    isActive: true,
    fields: [
      newField({
        id: 'default-interest-level',
        name: 'interest_level',
        label: 'ご検討状況',
        type: 'radio',
        required: true,
        optionsText: 'すぐに相談したい\n資料を見て検討したい\nまだ情報収集中',
      }),
      newField({
        id: 'default-preferred-contact-time',
        name: 'preferred_contact_time',
        label: 'ご希望の連絡時間帯',
        type: 'select',
        optionsText: '午前\n午後\n夕方以降\nいつでもよい',
      }),
      newField({
        id: 'default-questions',
        name: 'questions',
        label: 'ご相談内容',
        type: 'textarea',
        placeholder: '気になることがあればご記入ください',
      }),
    ],
    onSubmitTagId: '',
    onSubmitScenarioId: '',
    onSubmitMessageType: 'text',
    onSubmitMessageContent: 'ご回答ありがとうございます。担当者より順次ご案内します。',
    onSubmitWebhookUrl: '',
    onSubmitWebhookHeaders: '',
    onSubmitWebhookFailMessage: '',
    saveToMetadata: true,
  }
}

function editableFieldFromField(field: FormField): EditableField {
  return newField({
    name: field.name,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    placeholder: field.placeholder ?? '',
    optionsText: (field.options ?? []).join('\n'),
    columns: field.columns ?? 1,
  })
}

function editorStateFromForm(form: ManagedForm): EditorState {
  return {
    name: form.name,
    description: form.description ?? '',
    isActive: form.isActive,
    fields: form.fields.map(editableFieldFromField),
    onSubmitTagId: form.onSubmitTagId ?? '',
    onSubmitScenarioId: form.onSubmitScenarioId ?? '',
    onSubmitMessageType: form.onSubmitMessageType ?? 'text',
    onSubmitMessageContent: form.onSubmitMessageContent ?? '',
    onSubmitWebhookUrl: form.onSubmitWebhookUrl ?? '',
    onSubmitWebhookHeaders: form.onSubmitWebhookHeaders ?? '',
    onSubmitWebhookFailMessage: form.onSubmitWebhookFailMessage ?? '',
    saveToMetadata: form.saveToMetadata,
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getWorkerBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL || ''
  try {
    return new URL(raw).origin
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

function buildFriendAddUrl(formId: string, ref = 'lp-thanks') {
  const base = getWorkerBaseUrl()
  if (!base) return ''
  const url = new URL('/auth/line', base)
  url.searchParams.set('ref', ref)
  url.searchParams.set('form', formId)
  return url.toString()
}

function fieldNeedsOptions(type: FormFieldType) {
  return type === 'select' || type === 'radio' || type === 'checkbox'
}

function buildPayload(form: EditorState) {
  const fields = form.fields.map<FormField>((field) => {
    const options = field.optionsText
      .split('\n')
      .map((option) => option.trim())
      .filter(Boolean)

    return {
      name: field.name.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      placeholder: field.placeholder.trim() || undefined,
      columns: field.columns === 2 ? 2 : undefined,
      options: fieldNeedsOptions(field.type) ? options : undefined,
    }
  })

  const messageContent = form.onSubmitMessageContent.trim()

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    fields,
    onSubmitTagId: form.onSubmitTagId || null,
    onSubmitScenarioId: form.onSubmitScenarioId || null,
    onSubmitMessageType: messageContent ? form.onSubmitMessageType : null,
    onSubmitMessageContent: messageContent || null,
    onSubmitWebhookUrl: form.onSubmitWebhookUrl.trim() || null,
    onSubmitWebhookHeaders: form.onSubmitWebhookHeaders.trim() || null,
    onSubmitWebhookFailMessage: form.onSubmitWebhookFailMessage.trim() || null,
    saveToMetadata: form.saveToMetadata,
    isActive: form.isActive,
  }
}

function validateEditor(form: EditorState) {
  if (!form.name.trim()) return 'フォーム名を入力してください。'
  if (form.fields.length === 0) return '質問項目を1つ以上追加してください。'

  const names = new Set<string>()
  for (const [index, field] of form.fields.entries()) {
    const label = field.label.trim()
    const name = field.name.trim()
    const displayIndex = index + 1

    if (!label) return `${displayIndex}個目の質問ラベルを入力してください。`
    if (!name) return `${displayIndex}個目の項目キーを入力してください。`
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      return `${displayIndex}個目の項目キーは半角英字から始めて、英数字とアンダースコアだけで入力してください。`
    }
    if (names.has(name)) return `項目キー「${name}」が重複しています。`
    names.add(name)

    if (fieldNeedsOptions(field.type)) {
      const options = field.optionsText.split('\n').map((option) => option.trim()).filter(Boolean)
      if (options.length === 0) return `${displayIndex}個目の選択肢を1つ以上入力してください。`
    }
  }

  if (form.onSubmitMessageType === 'flex' && form.onSubmitMessageContent.trim()) {
    try {
      JSON.parse(form.onSubmitMessageContent)
    } catch {
      return '回答後メッセージをFlexにする場合はJSONで入力してください。'
    }
  }

  if (form.onSubmitWebhookHeaders.trim()) {
    try {
      JSON.parse(form.onSubmitWebhookHeaders)
    } catch {
      return 'WebhookヘッダーはJSONで入力してください。'
    }
  }

  return ''
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function FormsPage() {
  const [forms, setForms] = useState<ManagedForm[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [scenarios, setScenarios] = useState<(Scenario & { stepCount?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(defaultEditorState())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const scenarioById = useMemo(() => new Map(scenarios.map((scenario) => [scenario.id, scenario])), [scenarios])
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const activeCount = forms.filter((form) => form.isActive).length
  const totalSubmissions = forms.reduce((total, form) => total + (form.submitCount || 0), 0)
  const editingForm = editingId ? forms.find((form) => form.id === editingId) ?? null : null
  const editingFriendAddUrl = editingForm ? buildFriendAddUrl(editingForm.id) : ''

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [formsResult, tagsResult, scenariosResult] = await Promise.allSettled([
        fetchApi<ApiResponse<ManagedForm[]>>('/api/forms'),
        api.tags.list(),
        api.scenarios.list(),
      ])

      if (formsResult.status === 'fulfilled') {
        if (formsResult.value.success) {
          setForms(formsResult.value.data)
        } else {
          setError(formsResult.value.error)
        }
      } else {
        setError(getErrorMessage(formsResult.reason, 'フォームの読み込みに失敗しました。'))
      }

      if (tagsResult.status === 'fulfilled' && tagsResult.value.success) {
        setTags(tagsResult.value.data)
      }

      if (scenariosResult.status === 'fulfilled' && scenariosResult.value.success) {
        setScenarios(scenariosResult.value.data)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'フォームの読み込みに失敗しました。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const copyText = async (key: string, text: string) => {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1800)
    } catch {
      setNotice({ type: 'error', text: 'コピーに失敗しました。' })
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setEditor(defaultEditorState())
    setFormError('')
    setNotice(null)
    setShowEditor(true)
  }

  const openEdit = (form: ManagedForm) => {
    setEditingId(form.id)
    setEditor(editorStateFromForm(form))
    setFormError('')
    setNotice(null)
    setShowEditor(true)
  }

  const updateField = (index: number, patch: Partial<EditableField>) => {
    setEditor((current) => ({
      ...current,
      fields: current.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }))
  }

  const moveField = (index: number, direction: -1 | 1) => {
    setEditor((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current
      const fields = [...current.fields]
      const currentField = fields[index]
      fields[index] = fields[nextIndex]
      fields[nextIndex] = currentField
      return { ...current, fields }
    })
  }

  const removeField = (index: number) => {
    setEditor((current) => ({
      ...current,
      fields: current.fields.filter((_, i) => i !== index),
    }))
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setNotice(null)
    const validationError = validateEditor(editor)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const payload = buildPayload(editor)
      const res = editingId
        ? await fetchApi<ApiResponse<ManagedForm>>(`/api/forms/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await fetchApi<ApiResponse<ManagedForm>>('/api/forms', {
            method: 'POST',
            body: JSON.stringify(payload),
          })

      if (!res.success) {
        setFormError(res.error)
        return
      }

      setForms((current) => {
        if (editingId) return current.map((form) => (form.id === editingId ? res.data : form))
        return [res.data, ...current]
      })
      setEditingId(res.data.id)
      setEditor(editorStateFromForm(res.data))
      setShowEditor(true)
      setNotice({ type: 'success', text: editingId ? 'フォームを更新しました。' : 'フォームを作成しました。' })
    } catch (err) {
      setFormError(getErrorMessage(err, '保存に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (form: ManagedForm) => {
    setNotice(null)
    try {
      const res = await fetchApi<ApiResponse<ManagedForm>>(`/api/forms/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !form.isActive }),
      })
      if (res.success) {
        setForms((current) => current.map((item) => (item.id === form.id ? res.data : item)))
        if (editingId === form.id) setEditor(editorStateFromForm(res.data))
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '状態変更に失敗しました。') })
    }
  }

  const handleDelete = async (form: ManagedForm) => {
    if (!confirm(`「${form.name}」を削除しますか？回答データも削除対象になります。`)) return

    setNotice(null)
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/forms/${form.id}`, { method: 'DELETE' })
      if (res.success) {
        setForms((current) => current.filter((item) => item.id !== form.id))
        if (editingId === form.id) {
          setShowEditor(false)
          setEditingId(null)
        }
        setNotice({ type: 'success', text: 'フォームを削除しました。' })
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
        title="フォーム管理"
        description="LINE内アンケートの作成、回答後アクション、フォームIDを管理"
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/form-submissions"
              className="px-4 py-2 min-h-[44px] rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center"
            >
              回答を見る
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 min-h-[44px] rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: PRIMARY_COLOR }}
            >
              + 新規フォーム
            </button>
          </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="フォーム数" value={forms.length.toLocaleString('ja-JP')} />
        <MetricCard label="有効フォーム" value={activeCount.toLocaleString('ja-JP')} />
        <MetricCard label="総回答数" value={totalSubmissions.toLocaleString('ja-JP')} />
      </div>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold">LPやサンクスページに置くURLは、友だち追加URLに form=フォームID を付けたものです。</p>
        <p className="mt-1">
          例: <span className="font-mono">/auth/line?ref=lp-thanks&amp;form=フォームID</span>。
          フォーム送信後にタグ付け、シナリオ開始、回答内容のメタデータ保存を実行できます。
        </p>
      </div>

      {showEditor && (
        <form onSubmit={handleSave} className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{editingId ? 'フォームを編集' : '新規フォームを作成'}</h2>
              <p className="mt-1 text-xs text-gray-500">
                質問項目の順番が、そのままLINE内フォームの表示順になります。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowEditor(false)
                setEditingId(null)
                setFormError('')
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>

          {editingForm && (
            <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-lg bg-gray-50 border border-gray-200 p-4">
              <CopyBlock
                label="フォームID"
                value={editingForm.id}
                copied={copiedKey === `id:${editingForm.id}`}
                onCopy={() => copyText(`id:${editingForm.id}`, editingForm.id)}
              />
              <CopyBlock
                label="LP用 友だち追加URL"
                value={editingFriendAddUrl}
                copied={copiedKey === `url:${editingForm.id}`}
                onCopy={() => copyText(`url:${editingForm.id}`, editingFriendAddUrl)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                フォーム名 <span className="text-red-500">*</span>
              </label>
              <input
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 資料請求後アンケート"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">状態</label>
              <select
                value={editor.isActive ? 'active' : 'inactive'}
                onChange={(event) => setEditor({ ...editor, isActive: event.target.value === 'active' })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="active">受付中</option>
                <option value="inactive">停止中</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={2}
                placeholder="ユーザーに表示する説明文"
              />
            </div>
          </div>

          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">質問項目</h3>
              <button
                type="button"
                onClick={() => setEditor((current) => ({ ...current, fields: [...current.fields, newField()] }))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                + 質問を追加
              </button>
            </div>

            <div className="space-y-3">
              {editor.fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-500">質問 {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                      >
                        上へ
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === editor.fields.length - 1}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                      >
                        下へ
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">表示ラベル</label>
                      <input
                        value={field.label}
                        onChange={(event) => updateField(index, { label: event.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="例: ご検討状況"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">項目キー</label>
                      <input
                        value={field.name}
                        onChange={(event) => updateField(index, { name: event.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="例: interest_level"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">入力タイプ</label>
                      <select
                        value={field.type}
                        onChange={(event) => updateField(index, { type: event.target.value as FormFieldType })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {fieldTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">必須</label>
                      <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) => updateField(index, { required: event.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        必須にする
                      </label>
                    </div>
                    <div className={fieldNeedsOptions(field.type) ? 'md:col-span-1 xl:col-span-2' : 'md:col-span-2 xl:col-span-4'}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">プレースホルダー</label>
                      <input
                        value={field.placeholder}
                        onChange={(event) => updateField(index, { placeholder: event.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="入力例や補足"
                      />
                    </div>
                    {fieldNeedsOptions(field.type) && (
                      <>
                        <div className="md:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">表示列</label>
                          <select
                            value={String(field.columns)}
                            onChange={(event) => updateField(index, { columns: Number(event.target.value) })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <option value="1">1列</option>
                            <option value="2">2列</option>
                          </select>
                        </div>
                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="block text-xs font-medium text-gray-600 mb-1">選択肢</label>
                          <textarea
                            value={field.optionsText}
                            onChange={(event) => updateField(index, { optionsText: event.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                            rows={3}
                            placeholder={'1行に1つずつ入力\n例: すぐに相談したい'}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">回答後の処理</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editor.saveToMetadata}
                  onChange={(event) => setEditor({ ...editor, saveToMetadata: event.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                回答内容を友だちのメタデータに保存する
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">回答後に付けるタグ</label>
                <select
                  value={editor.onSubmitTagId}
                  onChange={(event) => setEditor({ ...editor, onSubmitTagId: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">タグなし</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">回答後に開始するシナリオ</label>
                <select
                  value={editor.onSubmitScenarioId}
                  onChange={(event) => setEditor({ ...editor, onSubmitScenarioId: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">シナリオなし</option>
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}{scenario.stepCount !== undefined ? ` (${scenario.stepCount}ステップ)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">回答後メッセージタイプ</label>
                <select
                  value={editor.onSubmitMessageType}
                  onChange={(event) => setEditor({ ...editor, onSubmitMessageType: event.target.value as MessageType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {messageTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">回答後メッセージ</label>
                <textarea
                  value={editor.onSubmitMessageContent}
                  onChange={(event) => setEditor({ ...editor, onSubmitMessageContent: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder="未入力の場合はデフォルトの回答確認メッセージが送られます"
                />
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">外部Webhook連携</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Webhook URL</label>
                <input
                  type="url"
                  value={editor.onSubmitWebhookUrl}
                  onChange={(event) => setEditor({ ...editor, onSubmitWebhookUrl: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="https://example.com/webhook"
                />
                <p className="mt-1 text-xs text-gray-400">
                  回答データを外部サービスに送る場合だけ入力します。未入力なら何もしません。
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WebhookヘッダーJSON</label>
                <textarea
                  value={editor.onSubmitWebhookHeaders}
                  onChange={(event) => setEditor({ ...editor, onSubmitWebhookHeaders: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder={'{"Authorization":"Bearer xxx"}'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Webhook失敗時メッセージ</label>
                <textarea
                  value={editor.onSubmitWebhookFailMessage}
                  onChange={(event) => setEditor({ ...editor, onSubmitWebhookFailMessage: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={3}
                  placeholder="条件を満たしていない場合などに送るメッセージ"
                />
              </div>
            </div>
          </section>

          {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 min-h-[44px] rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_COLOR }}
            >
              {saving ? '保存中...' : editingId ? '更新' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowEditor(false)
                setEditingId(null)
                setFormError('')
              }}
              className="px-4 py-2 min-h-[44px] rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>
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
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">フォームがまだありません。</p>
          <button type="button" onClick={openCreate} className="mt-3 text-sm text-green-700 underline">
            最初のフォームを作成
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">フォーム</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">フォームID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">回答後処理</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">回答</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">更新日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {forms.map((form) => {
                const scenario = form.onSubmitScenarioId ? scenarioById.get(form.onSubmitScenarioId) : null
                const tag = form.onSubmitTagId ? tagById.get(form.onSubmitTagId) : null
                const friendAddUrl = buildFriendAddUrl(form.id)
                return (
                  <tr key={form.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{form.name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {form.fields.length}項目{form.description ? ` ・ ${form.description}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="block max-w-[180px] truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                        {form.id}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>タグ: {tag?.name ?? 'なし'}</p>
                        <p>シナリオ: {scenario?.name ?? 'なし'}</p>
                        <p>メタデータ保存: {form.saveToMetadata ? 'あり' : 'なし'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {form.submitCount.toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
                          (form.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {form.isActive ? '受付中' : '停止中'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(form.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(`row-id:${form.id}`, form.id)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {copiedKey === `row-id:${form.id}` ? 'コピー済' : 'ID'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(`row-url:${form.id}`, friendAddUrl)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {copiedKey === `row-url:${form.id}` ? 'コピー済' : 'URL'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(form)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(form)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {form.isActive ? '停止' : '受付'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(form)}
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

function CopyBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'コピー済' : 'コピー'}
        </button>
      </div>
      <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700">
        {value}
      </code>
    </div>
  )
}
