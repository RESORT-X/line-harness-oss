'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

type AdPlatformName = 'meta' | 'x' | 'google' | 'tiktok'

interface AdPlatform {
  id: string
  name: AdPlatformName
  displayName: string | null
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface AdConversionLog {
  id: string
  adPlatformId: string
  friendId: string
  eventName: string
  clickId: string | null
  clickIdType: string | null
  status: string
  errorMessage: string | null
  createdAt: string
}

interface AdPlatformFormState {
  name: AdPlatformName
  displayName: string
  pixelId: string
  accessToken: string
  testEventCode: string
  apiKey: string
  apiSecret: string
  customerId: string
  conversionActionId: string
  oauthToken: string
  developerToken: string
  pixelCode: string
}

const platformLabels: Record<AdPlatformName, string> = {
  meta: 'Meta広告',
  x: 'X広告',
  google: 'Google広告',
  tiktok: 'TikTok広告',
}

const initialForm: AdPlatformFormState = {
  name: 'meta',
  displayName: '',
  pixelId: '',
  accessToken: '',
  testEventCode: '',
  apiKey: '',
  apiSecret: '',
  customerId: '',
  conversionActionId: '',
  oauthToken: '',
  developerToken: '',
  pixelCode: '',
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed || undefined
}

function buildConfig(form: AdPlatformFormState): Record<string, string> {
  if (form.name === 'meta') {
    return {
      ...(nonEmpty(form.pixelId) ? { pixel_id: form.pixelId.trim() } : {}),
      ...(nonEmpty(form.accessToken) ? { access_token: form.accessToken.trim() } : {}),
      ...(nonEmpty(form.testEventCode) ? { test_event_code: form.testEventCode.trim() } : {}),
    }
  }
  if (form.name === 'x') {
    return {
      ...(nonEmpty(form.pixelId) ? { pixel_id: form.pixelId.trim() } : {}),
      ...(nonEmpty(form.apiKey) ? { api_key: form.apiKey.trim() } : {}),
      ...(nonEmpty(form.apiSecret) ? { api_secret: form.apiSecret.trim() } : {}),
    }
  }
  if (form.name === 'google') {
    return {
      ...(nonEmpty(form.customerId) ? { customer_id: form.customerId.trim() } : {}),
      ...(nonEmpty(form.conversionActionId) ? { conversion_action_id: form.conversionActionId.trim() } : {}),
      ...(nonEmpty(form.oauthToken) ? { oauth_token: form.oauthToken.trim() } : {}),
      ...(nonEmpty(form.developerToken) ? { developer_token: form.developerToken.trim() } : {}),
    }
  }
  return {
    ...(nonEmpty(form.pixelCode) ? { pixel_code: form.pixelCode.trim() } : {}),
    ...(nonEmpty(form.accessToken) ? { access_token: form.accessToken.trim() } : {}),
  }
}

function validateForm(form: AdPlatformFormState): string {
  const config = buildConfig(form)
  if (!form.displayName.trim()) return '表示名を入力してください'
  if (form.name === 'meta' && (!config.pixel_id || !config.access_token)) {
    return 'Meta広告はPixel IDとアクセストークンが必要です'
  }
  if (form.name === 'x' && (!config.pixel_id || !config.api_key || !config.api_secret)) {
    return 'X広告はPixel ID、API Key、API Secretが必要です'
  }
  if (form.name === 'google' && (!config.customer_id || !config.conversion_action_id || !config.oauth_token || !config.developer_token)) {
    return 'Google広告はCustomer ID、Conversion Action ID、OAuth Token、Developer Tokenが必要です'
  }
  if (form.name === 'tiktok' && (!config.pixel_code || !config.access_token)) {
    return 'TikTok広告はPixel Codeとアクセストークンが必要です'
  }
  return ''
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdPlatformsPage() {
  const [platforms, setPlatforms] = useState<AdPlatform[]>([])
  const [logs, setLogs] = useState<Record<string, AdConversionLog[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<AdPlatformFormState>(initialForm)

  const loadLogs = useCallback(async (items: AdPlatform[]) => {
    const entries = await Promise.allSettled(
      items.map(async (platform) => {
        const res = await fetchApi<ApiResponse<AdConversionLog[]>>(`/api/ad-platforms/${platform.id}/logs?limit=5`)
        return [platform.id, res.success ? res.data : []] as const
      }),
    )

    const next: Record<string, AdConversionLog[]> = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        next[entry.value[0]] = entry.value[1]
      }
    }
    setLogs(next)
  }, [])

  const loadPlatforms = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResponse<AdPlatform[]>>('/api/ad-platforms')
      if (res.success) {
        setPlatforms(res.data)
        await loadLogs(res.data)
      } else {
        setError(res.error || '広告プラットフォームの取得に失敗しました')
      }
    } catch (err) {
      setError(getErrorMessage(err, '広告プラットフォームの取得に失敗しました'))
    } finally {
      setLoading(false)
    }
  }, [loadLogs])

  useEffect(() => {
    loadPlatforms()
  }, [loadPlatforms])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationMessage = validateForm(form)
    if (validationMessage) {
      setFormError(validationMessage)
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    setFormError('')
    try {
      const res = await fetchApi<ApiResponse<AdPlatform>>('/api/ad-platforms', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          displayName: form.displayName.trim(),
          config: buildConfig(form),
        }),
      })
      if (!res.success) {
        setFormError(res.error || '広告プラットフォームの追加に失敗しました')
        return
      }
      setShowCreate(false)
      setForm(initialForm)
      setNotice('広告プラットフォームを追加しました')
      loadPlatforms()
    } catch (err) {
      setFormError(getErrorMessage(err, '広告プラットフォームの追加に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (platform: AdPlatform) => {
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<AdPlatform>>(`/api/ad-platforms/${platform.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !platform.isActive }),
      })
      if (!res.success) {
        setError(res.error || 'ステータス更新に失敗しました')
        return
      }
      setNotice('広告プラットフォームを更新しました')
      loadPlatforms()
    } catch (err) {
      setError(getErrorMessage(err, 'ステータス更新に失敗しました'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この広告プラットフォームを削除しますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/ad-platforms/${id}`, { method: 'DELETE' })
      if (!res.success) {
        setError(res.error || '削除に失敗しました')
        return
      }
      setNotice('広告プラットフォームを削除しました')
      loadPlatforms()
    } catch (err) {
      setError(getErrorMessage(err, '削除に失敗しました'))
    }
  }

  const configRows = useMemo(() => {
    if (form.name === 'meta') {
      return (
        <>
          <ConfigInput label="Pixel ID" value={form.pixelId} onChange={(value) => setForm({ ...form, pixelId: value })} />
          <ConfigInput label="Access Token" value={form.accessToken} onChange={(value) => setForm({ ...form, accessToken: value })} type="password" />
          <ConfigInput label="Test Event Code" value={form.testEventCode} onChange={(value) => setForm({ ...form, testEventCode: value })} required={false} />
        </>
      )
    }
    if (form.name === 'x') {
      return (
        <>
          <ConfigInput label="Pixel ID" value={form.pixelId} onChange={(value) => setForm({ ...form, pixelId: value })} />
          <ConfigInput label="API Key" value={form.apiKey} onChange={(value) => setForm({ ...form, apiKey: value })} type="password" />
          <ConfigInput label="API Secret" value={form.apiSecret} onChange={(value) => setForm({ ...form, apiSecret: value })} type="password" />
        </>
      )
    }
    if (form.name === 'google') {
      return (
        <>
          <ConfigInput label="Customer ID" value={form.customerId} onChange={(value) => setForm({ ...form, customerId: value })} />
          <ConfigInput label="Conversion Action ID" value={form.conversionActionId} onChange={(value) => setForm({ ...form, conversionActionId: value })} />
          <ConfigInput label="OAuth Token" value={form.oauthToken} onChange={(value) => setForm({ ...form, oauthToken: value })} type="password" />
          <ConfigInput label="Developer Token" value={form.developerToken} onChange={(value) => setForm({ ...form, developerToken: value })} type="password" />
        </>
      )
    }
    return (
      <>
        <ConfigInput label="Pixel Code" value={form.pixelCode} onChange={(value) => setForm({ ...form, pixelCode: value })} />
        <ConfigInput label="Access Token" value={form.accessToken} onChange={(value) => setForm({ ...form, accessToken: value })} type="password" />
      </>
    )
  }, [form])

  return (
    <div>
      <Header
        title="広告プラットフォーム"
        description="広告クリックIDに紐づくコンバージョン送信先を管理"
        action={
          <button
            onClick={() => setShowCreate((current) => !current)}
            className="px-4 py-2 min-h-[40px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            {showCreate ? '閉じる' : '+ 追加'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={loadPlatforms} className="ml-3 font-medium underline">
            再読み込み
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-700 hover:text-green-900">
            閉じる
          </button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">広告プラットフォーム追加</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">媒体</label>
              <select
                value={form.name}
                onChange={(event) => setForm({ ...initialForm, name: event.target.value as AdPlatformName })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(platformLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: Meta広告 本番"
                required
              />
            </div>
            {configRows}
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '追加中...' : '追加'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
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
      ) : platforms.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <p className="mb-2">広告プラットフォームがありません</p>
          <p className="text-xs text-gray-400">追加するとCV発火時に広告媒体へコンバージョンを送信できます。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {platforms.map((platform) => {
            const platformLogs = logs[platform.id] || []
            const sentCount = platformLogs.filter((log) => log.status === 'sent').length
            const failedCount = platformLogs.filter((log) => log.status === 'failed').length
            return (
              <div key={platform.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-gray-900 text-white text-xs font-semibold">
                        {platform.name.toUpperCase().slice(0, 2)}
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900">{platform.displayName || platformLabels[platform.name]}</h2>
                        <p className="text-xs text-gray-400">{platformLabels[platform.name]}</p>
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${platform.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {platform.isActive ? '有効' : '無効'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">直近送信</p>
                    <p className="mt-1 font-semibold text-gray-800">{sentCount}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">直近失敗</p>
                    <p className="mt-1 font-semibold text-gray-800">{failedCount}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">設定項目</p>
                    <p className="mt-1 font-semibold text-gray-800">{Object.keys(platform.config).length}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">設定</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(platform.config).length === 0 ? (
                      <span className="text-xs text-gray-400">設定項目なし</span>
                    ) : (
                      Object.keys(platform.config).map((key) => (
                        <span key={key} className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-600">
                          {key}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {platformLogs.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">直近ログ</p>
                    <div className="space-y-2">
                      {platformLogs.slice(0, 3).map((log) => (
                        <div key={log.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-gray-600">{log.eventName}</span>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full ${log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {log.status}
                          </span>
                          <span className="shrink-0 text-gray-400">{formatDateTime(log.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleToggle(platform)}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    {platform.isActive ? '無効にする' : '有効にする'}
                  </button>
                  <button
                    onClick={() => handleDelete(platform.id)}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    削除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ConfigInput({
  label,
  value,
  onChange,
  type = 'text',
  required = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password'
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        required={required}
      />
    </div>
  )
}
