'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'

type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

interface RichMenuArea {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  action: {
    type: string
    text?: string
    uri?: string
  }
}

interface RichMenu {
  id?: string
  richMenuId?: string
  name: string
  size?: {
    width: number
    height: number
  }
  selected: boolean
  areas?: RichMenuArea[]
  chatBarText: string
}

interface RichMenuFormState {
  name: string
  chatBarText: string
  selected: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function getMenuId(menu: RichMenu): string {
  return menu.richMenuId || menu.id || ''
}

export default function RichMenusPage() {
  const { selectedAccountId, selectedAccount, loading: accountLoading } = useAccount()
  const [menus, setMenus] = useState<RichMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<RichMenuFormState>({
    name: '',
    chatBarText: 'メニュー',
    selected: true,
  })

  const accountQuery = useMemo(() => {
    return selectedAccountId ? `?accountId=${encodeURIComponent(selectedAccountId)}` : ''
  }, [selectedAccountId])

  const loadMenus = useCallback(async () => {
    if (accountLoading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResponse<RichMenu[]>>(`/api/rich-menus${accountQuery}`)
      if (res.success) {
        setMenus(res.data)
      } else {
        setError(res.error || 'リッチメニューの取得に失敗しました')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'リッチメニューの取得に失敗しました'))
    } finally {
      setLoading(false)
    }
  }, [accountLoading, accountQuery])

  useEffect(() => {
    loadMenus()
  }, [loadMenus])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<{ richMenuId: string }>>(`/api/rich-menus${accountQuery}`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          chatBarText: form.chatBarText.trim() || 'メニュー',
          selected: form.selected,
          size: { width: 2500, height: 843 },
          areas: [],
        }),
      })
      if (!res.success) {
        setError(res.error || 'リッチメニューの作成に失敗しました')
        return
      }
      setShowCreate(false)
      setForm({ name: '', chatBarText: 'メニュー', selected: true })
      setNotice('リッチメニューを作成しました。画像とタップ領域はLINE管理画面またはAPIから追加してください。')
      loadMenus()
    } catch (err) {
      setError(getErrorMessage(err, 'リッチメニューの作成に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async (richMenuId: string) => {
    if (!richMenuId) return
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/rich-menus/${encodeURIComponent(richMenuId)}/default${accountQuery}`, {
        method: 'POST',
      })
      if (!res.success) {
        setError(res.error || 'デフォルト設定に失敗しました')
        return
      }
      setNotice('デフォルトリッチメニューに設定しました')
      loadMenus()
    } catch (err) {
      setError(getErrorMessage(err, 'デフォルト設定に失敗しました'))
    }
  }

  const handleDelete = async (richMenuId: string) => {
    if (!richMenuId) return
    if (!confirm('このリッチメニューを削除しますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/rich-menus/${encodeURIComponent(richMenuId)}${accountQuery}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        setError(res.error || '削除に失敗しました')
        return
      }
      setNotice('リッチメニューを削除しました')
      loadMenus()
    } catch (err) {
      setError(getErrorMessage(err, '削除に失敗しました'))
    }
  }

  return (
    <div>
      <Header
        title="リッチメニュー管理"
        description={selectedAccount ? `${selectedAccount.name} のLINEリッチメニューを管理` : 'LINEリッチメニューを管理'}
        action={
          <button
            onClick={() => setShowCreate((current) => !current)}
            className="px-4 py-2 min-h-[40px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            {showCreate ? '閉じる' : '+ 新規作成'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={loadMenus} className="ml-3 font-medium underline">
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
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規リッチメニュー</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メニュー名</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: メインメニュー"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">チャットバーテキスト</label>
              <input
                value={form.chatBarText}
                onChange={(event) => setForm({ ...form, chatBarText: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="メニュー"
              />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.selected}
              onChange={(event) => setForm({ ...form, selected: event.target.checked })}
              className="rounded border-gray-300"
            />
            チャットを開いた時に表示する
          </label>
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '作成中...' : '作成'}
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
      ) : menus.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <p className="mb-2">リッチメニューがありません</p>
          <p className="text-xs text-gray-400">新規作成からLINEのメニュー枠を作成できます。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {menus.map((menu) => {
            const richMenuId = getMenuId(menu)
            return (
              <div key={richMenuId || menu.name} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">{menu.name}</h2>
                    <p className="mt-1 text-xs text-gray-500 truncate">{menu.chatBarText}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${menu.selected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {menu.selected ? '表示' : '非表示'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">幅</p>
                    <p className="mt-1 font-semibold text-gray-800">{menu.size?.width ?? '-'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">高さ</p>
                    <p className="mt-1 font-semibold text-gray-800">{menu.size?.height ?? '-'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-gray-400">領域</p>
                    <p className="mt-1 font-semibold text-gray-800">{menu.areas?.length ?? 0}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleSetDefault(richMenuId)}
                    disabled={!richMenuId}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    デフォルトに設定
                  </button>
                  <button
                    onClick={() => handleDelete(richMenuId)}
                    disabled={!richMenuId}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
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
