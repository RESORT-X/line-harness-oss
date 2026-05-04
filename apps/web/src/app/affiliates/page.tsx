'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiResponse, Scenario, Tag } from '@line-crm/shared'
import Header from '@/components/layout/header'
import { api, fetchApi, type EntryRoute } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'

const WORKER_BASE = process.env.NEXT_PUBLIC_API_URL
if (!WORKER_BASE) {
  throw new Error('NEXT_PUBLIC_API_URL is not set. Build cannot proceed.')
}

const REF_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

interface FormOption {
  id: string
  name: string
  isActive: boolean
}

interface RefFriend {
  id: string
  displayName: string
  trackedAt: string | null
}

interface RefDetailData {
  refCode: string
  name: string
  friends: RefFriend[]
}

type Notice = { type: 'success' | 'error'; text: string } | null

const initialForm = {
  name: '',
  refCode: '',
  formId: '',
  tagId: '',
  scenarioId: '',
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function buildPreviewUrl(refCode: string, formId: string) {
  const ref = refCode.trim()
  if (!ref) return ''
  const query = new URLSearchParams({ ref })
  if (formId) query.set('form', formId)
  return `${WORKER_BASE}/auth/line?${query.toString()}`
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function AttributionPage() {
  const { selectedAccountId } = useAccount()
  const [routes, setRoutes] = useState<EntryRoute[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [scenarios, setScenarios] = useState<(Scenario & { stepCount?: number })[]>([])
  const [forms, setForms] = useState<FormOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(initialForm)
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [detail, setDetail] = useState<RefDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const activeRoutes = useMemo(() => routes.filter((route) => route.isActive).length, [routes])
  const totalFriends = useMemo(() => routes.reduce((total, route) => total + route.friendCount, 0), [routes])
  const totalClicks = useMemo(() => routes.reduce((total, route) => total + route.clickCount, 0), [routes])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [routesResult, tagsResult, scenariosResult, formsResult] = await Promise.allSettled([
        api.entryRoutes.list(selectedAccountId ? { lineAccountId: selectedAccountId } : undefined),
        api.tags.list(),
        api.scenarios.list(selectedAccountId ? { accountId: selectedAccountId } : undefined),
        fetchApi<ApiResponse<FormOption[]>>('/api/forms'),
      ])

      if (routesResult.status === 'fulfilled') {
        const res = routesResult.value
        if (res.success) {
          setRoutes(res.data)
        } else {
          setError(res.error)
        }
      } else {
        setError(getErrorMessage(routesResult.reason, '流入経路の読み込みに失敗しました。'))
      }

      if (tagsResult.status === 'fulfilled' && tagsResult.value.success) {
        setTags(tagsResult.value.data)
      }

      if (scenariosResult.status === 'fulfilled' && scenariosResult.value.success) {
        setScenarios(scenariosResult.value.data)
      }

      if (formsResult.status === 'fulfilled' && formsResult.value.success) {
        setForms(formsResult.value.data)
      }
    } catch (err) {
      setError(getErrorMessage(err, '流入経路の読み込みに失敗しました。'))
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')
    setNotice(null)

    const name = form.name.trim()
    const refCode = form.refCode.trim()
    if (!name || !refCode) {
      setFormError('経路名と ref コードを入力してください。')
      return
    }
    if (!REF_CODE_PATTERN.test(refCode)) {
      setFormError('ref コードは半角英数字、ハイフン、アンダースコアで64文字以内にしてください。')
      return
    }

    setSaving(true)
    try {
      const res = await api.entryRoutes.create({
        name,
        refCode,
        formId: form.formId || null,
        tagId: form.tagId || null,
        scenarioId: form.scenarioId || null,
      })

      if (res.success) {
        setRoutes((current) => [res.data, ...current])
        setForm(initialForm)
        setShowCreate(false)
        setNotice({ type: 'success', text: '流入経路を登録しました。' })
      } else {
        setFormError(res.error)
      }
    } catch (err) {
      setFormError(getErrorMessage(err, '登録に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateRoute = async (
    route: EntryRoute,
    updates: Partial<Pick<EntryRoute, 'formId' | 'tagId' | 'scenarioId' | 'isActive'>>,
  ) => {
    setNotice(null)
    try {
      const res = await api.entryRoutes.update(route.id, updates)
      if (res.success) {
        setRoutes((current) => current.map((item) => (item.id === route.id ? { ...item, ...res.data } : item)))
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '更新に失敗しました。') })
    }
  }

  const handleDelete = async (route: EntryRoute) => {
    if (!confirm(`${route.name} を削除しますか？`)) return

    setNotice(null)
    try {
      const res = await api.entryRoutes.delete(route.id)
      if (res.success) {
        setRoutes((current) => current.filter((item) => item.id !== route.id))
        if (selectedRef === route.refCode) {
          setSelectedRef(null)
          setDetail(null)
        }
        setNotice({ type: 'success', text: '流入経路を削除しました。' })
      } else {
        setNotice({ type: 'error', text: res.error })
      }
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, '削除に失敗しました。') })
    }
  }

  const handleCopy = async (route: EntryRoute) => {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(route.authUrl)
      setCopiedId(route.id)
      window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setNotice({ type: 'error', text: 'コピーに失敗しました。' })
    }
  }

  const handleRowClick = async (route: EntryRoute) => {
    if (selectedRef === route.refCode) {
      setSelectedRef(null)
      setDetail(null)
      return
    }

    setSelectedRef(route.refCode)
    setDetailLoading(true)
    try {
      const query = selectedAccountId ? `?lineAccountId=${selectedAccountId}` : ''
      const res = await fetchApi<ApiResponse<RefDetailData>>(`/api/analytics/ref/${encodeURIComponent(route.refCode)}${query}`)
      if (res.success) {
        setDetail(res.data)
      } else {
        setDetail(null)
      }
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const previewUrl = buildPreviewUrl(form.refCode, form.formId)

  return (
    <div>
      <Header
        title="流入経路登録"
        description="ref とフォームを指定して LINE 友だち追加リンクを発行"
        action={
          <button
            onClick={() => {
              setShowCreate((current) => !current)
              setFormError('')
            }}
            className="px-4 py-2 min-h-[44px] rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600"
          >
            {showCreate ? 'キャンセル' : '+ 新規経路'}
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
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規経路を登録</h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">経路名</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Instagram広告"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ref コード</label>
              <input
                value={form.refCode}
                onChange={(event) => setForm({ ...form, refCode: event.target.value.replace(/\s+/g, '') })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="instagram"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">送信フォーム</label>
              <select
                value={form.formId}
                onChange={(event) => setForm({ ...form, formId: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">フォームなし</option>
                {forms.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">追加時タグ</label>
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始シナリオ</label>
              <select
                value={form.scenarioId}
                onChange={(event) => setForm({ ...form, scenarioId: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">シナリオなし</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                ))}
              </select>
            </div>
          </div>

          {previewUrl && (
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <p className="text-xs text-gray-500">発行URL</p>
              <p className="mt-1 break-all font-mono text-sm text-gray-800">{previewUrl}</p>
            </div>
          )}

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 min-h-[44px] rounded-lg bg-green-500 text-white text-sm font-medium disabled:opacity-50 hover:bg-green-600"
            >
              {saving ? '登録中...' : '登録'}
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

      {!loading && !error && routes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard label="経路数" value={routes.length.toLocaleString('ja-JP')} />
          <MetricCard label="有効経路" value={activeRoutes.toLocaleString('ja-JP')} />
          <MetricCard label="登録友だち" value={totalFriends.toLocaleString('ja-JP')} />
          <MetricCard label="記録数" value={totalClicks.toLocaleString('ja-JP')} />
        </div>
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
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          流入経路がまだ登録されていません
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">経路</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">フォーム</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">タグ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">シナリオ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">友だち</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">記録</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {routes.map((route) => {
                const isExpanded = selectedRef === route.refCode
                return (
                  <Fragment key={route.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleRowClick(route)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{route.name}</div>
                        <div className="mt-1 font-mono text-xs text-blue-600">{route.refCode}</div>
                        <div className="mt-1 max-w-[260px] truncate font-mono text-xs text-gray-400">{route.authUrl}</div>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={route.formId ?? ''}
                          onChange={(event) => handleUpdateRoute(route, { formId: event.target.value || null })}
                          className="w-full min-w-[160px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">フォームなし</option>
                          {forms.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={route.tagId ?? ''}
                          onChange={(event) => handleUpdateRoute(route, { tagId: event.target.value || null })}
                          className="w-full min-w-[150px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">タグなし</option>
                          {tags.map((tag) => (
                            <option key={tag.id} value={tag.id}>{tag.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={route.scenarioId ?? ''}
                          onChange={(event) => handleUpdateRoute(route, { scenarioId: event.target.value || null })}
                          className="w-full min-w-[170px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">シナリオなし</option>
                          {scenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {route.friendCount.toLocaleString('ja-JP')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-sm font-semibold text-gray-900">{route.clickCount.toLocaleString('ja-JP')}</div>
                        <div className="text-xs text-gray-400">{formatDate(route.latestAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (route.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')
                          }
                        >
                          {route.isActive ? '有効' : '停止中'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(route)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            {copiedId === route.id ? 'コピー済' : 'コピー'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRoute(route, { isActive: !route.isActive })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            {route.isActive ? '停止' : '有効化'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(route)}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${route.id}-detail`}>
                        <td colSpan={8} className="px-6 py-4 bg-gray-50">
                          {detailLoading ? (
                            <p className="text-sm text-gray-400">読み込み中...</p>
                          ) : detail && detail.friends.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                                この経路から追加した友だち ({detail.friends.length}人)
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {detail.friends.map((friend) => (
                                  <div key={friend.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <span className="text-sm text-gray-800 font-medium truncate">{friend.displayName}</span>
                                    <span className="text-xs text-gray-400 ml-2 shrink-0">{formatDate(friend.trackedAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">この経路から追加した友だちはまだいません</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
