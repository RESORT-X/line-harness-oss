'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'

type ApiResponse<T> = {
  success: boolean
  data: T
  error?: string
}

interface TrafficPool {
  id: string
  slug: string
  name: string
  activeAccountId: string
  accountName: string
  liffId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface PoolAccount {
  id: string
  poolId: string
  lineAccountId: string
  accountName: string
  liffId: string | null
  isActive: boolean
  createdAt: string
}

interface CreateFormState {
  slug: string
  name: string
  activeAccountId: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function TrafficPoolsPage() {
  const { accounts, selectedAccountId, loading: accountLoading } = useAccount()
  const [pools, setPools] = useState<TrafficPool[]>([])
  const [poolAccounts, setPoolAccounts] = useState<Record<string, PoolAccount[]>>({})
  const [addAccountByPool, setAddAccountByPool] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateFormState>({
    slug: '',
    name: '',
    activeAccountId: '',
  })

  useEffect(() => {
    if (form.activeAccountId) return
    const fallbackAccountId = selectedAccountId || accounts[0]?.id || ''
    if (fallbackAccountId) {
      setForm((current) => ({ ...current, activeAccountId: fallbackAccountId }))
    }
  }, [accounts, form.activeAccountId, selectedAccountId])

  const loadPoolAccounts = useCallback(async (items: TrafficPool[]) => {
    const entries = await Promise.allSettled(
      items.map(async (pool) => {
        const res = await fetchApi<ApiResponse<PoolAccount[]>>(`/api/traffic-pools/${pool.id}/accounts`)
        return [pool.id, res.success ? res.data : []] as const
      }),
    )

    const next: Record<string, PoolAccount[]> = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        next[entry.value[0]] = entry.value[1]
      }
    }
    setPoolAccounts(next)
  }, [])

  const loadPools = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<ApiResponse<TrafficPool[]>>('/api/traffic-pools')
      if (res.success) {
        setPools(res.data)
        await loadPoolAccounts(res.data)
      } else {
        setError(res.error || 'トラフィックプールの取得に失敗しました')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'トラフィックプールの取得に失敗しました'))
    } finally {
      setLoading(false)
    }
  }, [loadPoolAccounts])

  useEffect(() => {
    loadPools()
  }, [loadPools])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.slug.trim() || !form.name.trim() || !form.activeAccountId) return

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<TrafficPool>>('/api/traffic-pools', {
        method: 'POST',
        body: JSON.stringify({
          slug: form.slug.trim(),
          name: form.name.trim(),
          activeAccountId: form.activeAccountId,
        }),
      })
      if (!res.success) {
        setError(res.error || '作成に失敗しました')
        return
      }
      setShowCreate(false)
      setForm({ slug: '', name: '', activeAccountId: selectedAccountId || accounts[0]?.id || '' })
      setNotice('トラフィックプールを作成しました')
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, '作成に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePool = async (poolId: string, updates: { name?: string; activeAccountId?: string; isActive?: boolean }) => {
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<TrafficPool>>(`/api/traffic-pools/${poolId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      if (!res.success) {
        setError(res.error || '更新に失敗しました')
        return
      }
      setNotice('トラフィックプールを更新しました')
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, '更新に失敗しました'))
    }
  }

  const handleDelete = async (poolId: string) => {
    if (!confirm('このトラフィックプールを削除しますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/traffic-pools/${poolId}`, { method: 'DELETE' })
      if (!res.success) {
        setError(res.error || '削除に失敗しました')
        return
      }
      setNotice('トラフィックプールを削除しました')
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, '削除に失敗しました'))
    }
  }

  const handleAddAccount = async (poolId: string) => {
    const lineAccountId = addAccountByPool[poolId]
    if (!lineAccountId) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<PoolAccount>>(`/api/traffic-pools/${poolId}/accounts`, {
        method: 'POST',
        body: JSON.stringify({ lineAccountId }),
      })
      if (!res.success) {
        setError(res.error || 'アカウント追加に失敗しました')
        return
      }
      setAddAccountByPool((current) => ({ ...current, [poolId]: '' }))
      setNotice('プールにLINEアカウントを追加しました')
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, 'アカウント追加に失敗しました'))
    }
  }

  const handleTogglePoolAccount = async (poolId: string, poolAccount: PoolAccount) => {
    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<PoolAccount>>(`/api/traffic-pools/${poolId}/accounts/${poolAccount.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !poolAccount.isActive }),
      })
      if (!res.success) {
        setError(res.error || 'アカウント状態の更新に失敗しました')
        return
      }
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, 'アカウント状態の更新に失敗しました'))
    }
  }

  const handleRemovePoolAccount = async (poolId: string, poolAccountId: string) => {
    if (!confirm('このLINEアカウントをプールから外しますか？')) return

    setError('')
    setNotice('')
    try {
      const res = await fetchApi<ApiResponse<null>>(`/api/traffic-pools/${poolId}/accounts/${poolAccountId}`, {
        method: 'DELETE',
      })
      if (!res.success) {
        setError(res.error || 'アカウント削除に失敗しました')
        return
      }
      setNotice('プールからLINEアカウントを外しました')
      loadPools()
    } catch (err) {
      setError(getErrorMessage(err, 'アカウント削除に失敗しました'))
    }
  }

  const canCreate = accounts.length > 0 && !accountLoading

  return (
    <div>
      <Header
        title="トラフィックプール"
        description="流入URLごとに誘導先のLINEアカウントを切り替える運用画面"
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
          <button onClick={loadPools} className="ml-3 font-medium underline">
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
          <h2 className="text-sm font-semibold text-gray-800 mb-4">新規トラフィックプール</h2>
          {!canCreate && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
              先にLINEアカウントを登録すると、プールの誘導先を選べます。
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">スラッグ</label>
              <input
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="spring-campaign"
                pattern="[a-zA-Z0-9_-]+"
                required
              />
              <p className="mt-1 text-xs text-gray-400">URLは /pool/スラッグ になります。</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">プール名</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="春キャンペーン"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">現在の誘導先</label>
              <select
                value={form.activeAccountId}
                onChange={(event) => setForm({ ...form, activeAccountId: event.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                disabled={!canCreate}
              >
                <option value="">選択してください</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName || account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving || !canCreate}
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
      ) : pools.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <p className="mb-2">トラフィックプールがありません</p>
          <p className="text-xs text-gray-400">新規作成から流入URLと誘導先アカウントを設定できます。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pools.map((pool) => {
            const accountsInPool = poolAccounts[pool.id] || []
            const addValue = addAccountByPool[pool.id] || ''
            return (
              <div key={pool.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-900">{pool.name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pool.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {pool.isActive ? '有効' : '無効'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 break-all">/pool/{pool.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleUpdatePool(pool.id, { isActive: !pool.isActive })}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      {pool.isActive ? '無効にする' : '有効にする'}
                    </button>
                    <button
                      onClick={() => handleDelete(pool.id)}
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      削除
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">現在の誘導先アカウント</label>
                    <select
                      value={pool.activeAccountId}
                      onChange={(event) => handleUpdatePool(pool.id, { activeAccountId: event.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.displayName || account.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-400">現在値: {pool.accountName}</p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">プール内アカウントを追加</label>
                    <div className="flex gap-2">
                      <select
                        value={addValue}
                        onChange={(event) => setAddAccountByPool((current) => ({ ...current, [pool.id]: event.target.value }))}
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">選択してください</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.displayName || account.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddAccount(pool.id)}
                        disabled={!addValue}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <h3 className="text-xs font-semibold text-gray-500 mb-3">プール内アカウント</h3>
                  {accountsInPool.length === 0 ? (
                    <p className="text-sm text-gray-400">追加済みアカウントはありません。</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {accountsInPool.map((poolAccount) => (
                        <div key={poolAccount.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{poolAccount.accountName}</p>
                            <p className="text-xs text-gray-400">LINE Account ID: {poolAccount.lineAccountId}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleTogglePoolAccount(pool.id, poolAccount)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${poolAccount.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                            >
                              {poolAccount.isActive ? '有効' : '無効'}
                            </button>
                            <button
                              onClick={() => handleRemovePoolAccount(pool.id, poolAccount.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              外す
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
