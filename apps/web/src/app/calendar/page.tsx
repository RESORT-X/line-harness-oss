'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

interface CalendarConnection {
  id: string
  calendarId: string
  authType: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface CalendarBooking {
  id: string
  connectionId: string
  friendId: string | null
  eventId: string | null
  title: string
  startAt: string
  endAt: string
  status: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface ConnectFormState {
  calendarId: string
  authType: 'api_key' | 'oauth'
  apiKey: string
  accessToken: string
  refreshToken: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '保留中', className: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '確定', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'キャンセル', className: 'bg-red-100 text-red-700' },
  completed: { label: '完了', className: 'bg-gray-100 text-gray-600' },
}

const initialForm: ConnectFormState = {
  calendarId: '',
  authType: 'api_key',
  apiKey: '',
  accessToken: '',
  refreshToken: '',
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
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

export default function CalendarPage() {
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [bookings, setBookings] = useState<CalendarBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showConnect, setShowConnect] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<ConnectFormState>(initialForm)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [connectionsRes, bookingsRes] = await Promise.all([
        fetchApi<ApiResponse<CalendarConnection[]>>('/api/integrations/google-calendar'),
        fetchApi<ApiResponse<CalendarBooking[]>>('/api/integrations/google-calendar/bookings'),
      ])
      if (connectionsRes.success) {
        setConnections(connectionsRes.data)
      } else {
        setError(connectionsRes.error || 'カレンダー連携の取得に失敗しました')
      }
      if (bookingsRes.success) {
        setBookings(bookingsRes.data)
      } else if (!connectionsRes.error) {
        setError(bookingsRes.error || '予約一覧の取得に失敗しました')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'カレンダー情報の取得に失敗しました'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.calendarId.trim()) {
      setFormError('カレンダーIDを入力してください')
      return
    }

    setConnecting(true)
    setError('')
    setNotice('')
    setFormError('')
    try {
      const body: Record<string, string> = {
        calendarId: form.calendarId.trim(),
        authType: form.authType,
      }
      if (form.authType === 'api_key') {
        if (form.apiKey.trim()) body.apiKey = form.apiKey.trim()
      } else {
        if (form.accessToken.trim()) body.accessToken = form.accessToken.trim()
        if (form.refreshToken.trim()) body.refreshToken = form.refreshToken.trim()
      }

      const res = await fetchApi<ApiResponse<CalendarConnection>>('/api/integrations/google-calendar/connect', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.success) {
        setFormError(res.error || '接続に失敗しました')
        return
      }
      setShowConnect(false)
      setForm(initialForm)
      setNotice('Googleカレンダーを接続しました')
      load()
    } catch (err) {
      setFormError(getErrorMessage(err, '接続に失敗しました'))
    } finally {
      setConnecting(false)
    }
  }

  const handleDeleteConnection = async (id: string) => {
    if (!confirm('このカレンダー連携を削除しますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/integrations/google-calendar/${id}`, { method: 'DELETE' })
      if (!res.success) {
        setError(res.error || 'カレンダー連携の削除に失敗しました')
        return
      }
      setNotice('カレンダー連携を削除しました')
      load()
    } catch (err) {
      setError(getErrorMessage(err, 'カレンダー連携の削除に失敗しました'))
    }
  }

  const handleCancelBooking = async (id: string) => {
    if (!confirm('この予約をキャンセルしますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/integrations/google-calendar/bookings/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.success) {
        setError(res.error || '予約のキャンセルに失敗しました')
        return
      }
      setNotice('予約をキャンセルしました')
      load()
    } catch (err) {
      setError(getErrorMessage(err, '予約のキャンセルに失敗しました'))
    }
  }

  const pendingCount = bookings.filter((booking) => booking.status === 'pending').length
  const confirmedCount = bookings.filter((booking) => booking.status === 'confirmed').length
  const activeConnectionCount = connections.filter((connection) => connection.isActive).length

  return (
    <div>
      <Header
        title="Googleカレンダー"
        description="予約用カレンダーの接続状況と予約一覧を管理"
        action={
          <button
            onClick={() => setShowConnect((current) => !current)}
            className="px-4 py-2 min-h-[40px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            {showConnect ? '閉じる' : '+ 接続'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={load} className="ml-3 font-medium underline">
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

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">接続数</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{connections.length}</p>
            <p className="mt-1 text-xs text-gray-400">有効 {activeConnectionCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">保留中</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="mt-1 text-xs text-gray-400">確認待ちの予約</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">確定済み</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#06C755' }}>{confirmedCount}</p>
            <p className="mt-1 text-xs text-gray-400">キャンセル前の予約</p>
          </div>
        </div>
      )}

      {showConnect && (
        <form onSubmit={handleConnect} className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Googleカレンダーを接続</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">カレンダーID</label>
              <input
                value={form.calendarId}
                onChange={(event) => setForm({ ...form, calendarId: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="your-calendar@group.calendar.google.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">認証方式</label>
              <select
                value={form.authType}
                onChange={(event) => setForm({ ...form, authType: event.target.value as ConnectFormState['authType'] })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="api_key">APIキー</option>
                <option value="oauth">OAuth</option>
              </select>
            </div>
            {form.authType === 'api_key' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google APIキー</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="AIza..."
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">アクセストークン</label>
                  <input
                    type="password"
                    value={form.accessToken}
                    onChange={(event) => setForm({ ...form, accessToken: event.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="ya29..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">リフレッシュトークン</label>
                  <input
                    type="password"
                    value={form.refreshToken}
                    onChange={(event) => setForm({ ...form, refreshToken: event.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="1//..."
                  />
                </div>
              </>
            )}
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={connecting}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {connecting ? '接続中...' : '接続'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConnect(false)
                setFormError('')
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">接続中のカレンダー</h2>
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
            読み込み中...
          </div>
        ) : connections.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            <p className="mb-2">Googleカレンダーが未接続です</p>
            <p className="text-xs text-gray-400">接続すると予約フォームの空き枠確認に利用できます。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {connections.map((connection) => (
              <div key={connection.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{connection.calendarId}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{connection.authType}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${connection.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {connection.isActive ? '有効' : '無効'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">登録日: {formatDateTime(connection.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteConnection(connection.id)}
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">予約一覧</h2>
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
            読み込み中...
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            予約はまだありません。
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">タイトル</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">開始</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">終了</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ステータス</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bookings.map((booking) => {
                    const status = statusConfig[booking.status] || { label: booking.status, className: 'bg-gray-100 text-gray-600' }
                    const canCancel = booking.status !== 'cancelled' && booking.status !== 'completed'
                    return (
                      <tr key={booking.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{booking.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(booking.startAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(booking.endAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canCancel ? (
                            <button
                              onClick={() => handleCancelBooking(booking.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              キャンセル
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
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
    </div>
  )
}
