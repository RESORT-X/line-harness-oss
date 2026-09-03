'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'

interface Chat {
  id: string
  friendId: string
  friendName: string
  friendPictureUrl: string | null
  operatorId: string | null
  status: 'unread' | 'in_progress' | 'resolved'
  notes: string | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface ChatDetail extends Chat {
  friendName: string
  friendPictureUrl: string | null
  messages?: ChatMessage[]
}

type StatusFilter = 'all' | 'unread' | 'in_progress' | 'resolved'
type ComposeMessageType = 'text' | 'flex'

interface MessageTemplateItem {
  id: string
  name: string
  messageContent: string
  messageType: ComposeMessageType
}

function getFlexJsonError(content: string): string {
  if (!content.trim()) return 'Flex JSONを入力してください。'

  try {
    const parsed = JSON.parse(content) as { type?: unknown }
    if (!parsed || typeof parsed !== 'object' || (parsed.type !== 'bubble' && parsed.type !== 'carousel')) {
      return 'Flex JSONのtypeは「bubble」または「carousel」にしてください。'
    }
    return ''
  } catch {
    return 'Flex JSONの形式が正しくありません。'
  }
}

function MessageTypeSelector({ value, onChange }: {
  value: ComposeMessageType
  onChange: (value: ComposeMessageType) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {(['text', 'flex'] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            value === type
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
          }`}
        >
          {type === 'text' ? 'テキスト' : 'Flex JSON'}
        </button>
      ))}
    </div>
  )
}

const statusConfig: Record<Chat['status'], { label: string; className: string }> = {
  unread: { label: '未読', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'unread', label: '未読' },
  { key: 'in_progress', label: '対応中' },
  { key: 'resolved', label: '解決済' },
]

const SHOW_LOADING_PREF_KEY = 'lh_chat_show_loading_indicator'
const LOADING_SECONDS_PREF_KEY = 'lh_chat_loading_seconds'
const LOADING_REFRESH_INTERVAL_MS = 4000

function formatDatetime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ccPrompts = [
  {
    title: 'チャット対応テンプレート',
    prompt: `チャット対応で使えるテンプレートメッセージを作成してください。
1. よくある質問への回答テンプレート（挨拶、FAQ、サポート）
2. クレーム対応用の丁寧な返信テンプレート
3. フォローアップメッセージのテンプレート
手順を示してください。`,
  },
  {
    title: '未対応チャット確認',
    prompt: `未対応のチャットを確認し、対応優先度を整理してください。
1. 未読・対応中のチャット数を集計
2. 最終メッセージからの経過時間で優先度を判定
3. 長時間未対応のチャットへの対応アクションを提案
結果をレポートしてください。`,
  },
]

interface FriendItem {
  id: string
  displayName: string
  pictureUrl: string | null
  isFollowing: boolean
}

interface MessageLog {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

function DirectMessagePanel({ friendId, friend, templates, onBack }: {
  friendId: string
  friend: FriendItem | null
  templates: MessageTemplateItem[]
  onBack: () => void
}) {
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<ComposeMessageType>('text')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)
  const isComposingRef = useRef(false)
  const sendLockRef = useRef(false)

  useEffect(() => {
    const loadMessages = async () => {
      setLoadingMessages(true)
      try {
        const res = await fetchApi<{ success: boolean; data: MessageLog[] }>(
          `/api/friends/${friendId}/messages`
        )
        if (res.success) setMessages(res.data)
      } catch { /* silent */ }
      setLoadingMessages(false)
    }
    loadMessages()
  }, [friendId])

  const handleSend = async () => {
    if (!message.trim() || sending || sendLockRef.current) return
    if (messageType === 'flex') {
      const validationError = getFlexJsonError(message)
      if (validationError) {
        setSendError(validationError)
        return
      }
    }

    sendLockRef.current = true
    setSending(true)
    setSendError('')
    const content = message.trim()
    const sendingMessageType = messageType
    try {
      await fetchApi(`/api/friends/${friendId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, messageType: sendingMessageType }),
      })
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        direction: 'outgoing',
        messageType: sendingMessageType,
        content,
        createdAt: new Date().toISOString(),
      }])
      setMessage('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
      sendLockRef.current = false
    }
  }

  const liveFlexError = messageType === 'flex' && message ? getFlexJsonError(message) : ''

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center gap-3">
        <button onClick={onBack} className="lg:hidden text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {friend?.pictureUrl ? (
          <img src={friend.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-500 text-xs">{(friend?.displayName || '?').charAt(0)}</span>
          </div>
        )}
        <div>
          <p className="text-sm font-bold text-gray-900">{friend?.displayName || '不明'}</p>
          <p className="text-xs text-gray-400">メッセージ履歴</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages ? (
          <p className="text-center text-gray-400 text-sm">読み込み中...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-400 text-sm">メッセージ履歴がありません</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
              <div className={msg.messageType === 'flex'
                ? 'max-w-[300px]'
                : `max-w-[75%] rounded-2xl px-4 py-2 ${msg.direction === 'outgoing' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-900'}`
              }>
                {msg.messageType === 'flex'
                  ? <FlexPreviewComponent content={msg.content} maxWidth={280} />
                  : <p className="text-sm whitespace-pre-wrap break-words">{msg.messageType === 'text' ? msg.content : `[${msg.messageType}]`}</p>
                }
                <p className={`text-xs mt-1 ${msg.messageType === 'flex' ? 'text-gray-400' : msg.direction === 'outgoing' ? 'text-green-200' : 'text-gray-400'}`}>
                  {new Date(msg.createdAt).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <MessageTypeSelector
            value={messageType}
            onChange={(type) => {
              setMessageType(type)
              setSendError('')
            }}
          />
          {templates.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const template = templates.find((item) => item.id === e.target.value)
                if (!template) return
                setMessageType(template.messageType)
                setMessage(template.messageContent)
                setSendError('')
              }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white text-gray-600"
            >
              <option value="">テンプレートから選択...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  [{template.messageType === 'flex' ? 'Flex' : 'テキスト'}] {template.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {messageType === 'flex' && message && !liveFlexError && (
          <div className="mb-3 rounded-lg bg-gray-50 p-3 overflow-x-auto">
            <p className="text-xs font-medium text-gray-500 mb-2">送信プレビュー</p>
            <FlexPreviewComponent content={message} maxWidth={280} />
          </div>
        )}
        {(sendError || liveFlexError) && (
          <p className="mb-2 text-xs text-red-600">{sendError || liveFlexError}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={messageType === 'flex' ? 6 : 2}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setSendError('')
            }}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            onKeyDown={(e) => {
              if (messageType === 'flex') return
              // IME変換確定のEnterでは送信しない
              if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={messageType === 'flex' ? '{"type":"bubble","body":{...}}' : 'メッセージを入力...'}
            className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y ${messageType === 'flex' ? 'font-mono' : ''}`}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending || Boolean(liveFlexError)}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {sending ? '...' : '送信'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatsPage() {
  const { selectedAccountId } = useAccount()
  const [chats, setChats] = useState<Chat[]>([])
  const [allFriends, setAllFriends] = useState<FriendItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const statusFilterRef = useRef<StatusFilter>('all')
  // Send mode: 'enter' = Enter sends, Shift+Enter = newline; 'shift-enter' = reverse
  const [sendMode, setSendMode] = useState<'enter' | 'shift-enter'>('enter')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [messageType, setMessageType] = useState<ComposeMessageType>('text')
  const [messageError, setMessageError] = useState('')
  const [sending, setSending] = useState(false)
  const sendLockRef = useRef(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplateItem[]>([])
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false)
  const [loadingSeconds, setLoadingSeconds] = useState(5)
  const lastLoadingTriggerAtRef = useRef<Record<string, number>>({})
  const [isMessageInputFocused, setIsMessageInputFocused] = useState(false)
  const isComposingRef = useRef(false)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const rawEnabled = localStorage.getItem(SHOW_LOADING_PREF_KEY)
      const rawSeconds = localStorage.getItem(LOADING_SECONDS_PREF_KEY)
      if (rawEnabled !== null) setShowLoadingIndicator(rawEnabled === '1')
      if (rawSeconds) {
        const n = Number.parseInt(rawSeconds, 10)
        if (Number.isFinite(n) && n >= 5 && n <= 60) setLoadingSeconds(n)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_LOADING_PREF_KEY, showLoadingIndicator ? '1' : '0')
      localStorage.setItem(LOADING_SECONDS_PREF_KEY, String(loadingSeconds))
    } catch {
      // localStorage unavailable
    }
  }, [showLoadingIndicator, loadingSeconds])

  const loadChats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: { status?: string; accountId?: string } = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (selectedAccountId) params.accountId = selectedAccountId
      const chatRes = await api.chats.list(params)
      if (chatRes.success) {
        setChats(chatRes.data as unknown as Chat[])
      }
    } catch {
      setError('チャットの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, selectedAccountId])

  // Friends list (for the "new direct message" modal) — loaded lazily in the background
  // Previously fetched 800 friends in parallel with chats, which blocked the initial render.
  const loadAllFriends = useCallback(async () => {
    try {
      const friendRes = await api.friends.list({ accountId: selectedAccountId || undefined, limit: '800' })
      if (friendRes.success) {
        setAllFriends((friendRes.data as unknown as { items: FriendItem[] }).items)
      }
    } catch { /* silent */ }
  }, [selectedAccountId])

  useEffect(() => { void loadAllFriends() }, [loadAllFriends])

  // Keep ref in sync so setChats updater can read the latest filter without stale closure
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])

  // Load/save sendMode preference (guarded — privacy-restricted browsers throw)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat.sendMode')
      if (saved === 'enter' || saved === 'shift-enter') setSendMode(saved)
    } catch { /* localStorage unavailable */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('chat.sendMode', sendMode) } catch { /* ignore */ }
  }, [sendMode])

  const loadChatDetail = useCallback(async (chatId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.chats.get(chatId)
      if (res.success) {
        setChatDetail(res.data as unknown as ChatDetail)
        setNotes((res.data as unknown as ChatDetail).notes || '')
      }
    } catch {
      setError('チャット詳細の読み込みに失敗しました。')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    const loadTemplates = async () => {
      const [libraryResult, deliveryResult] = await Promise.allSettled([
        api.templates.list(),
        fetchApi<{ success: boolean; data: { messageType: string; id: string; name: string; messageContent: string }[] }>('/api/message-templates'),
      ])

      const libraryTemplates = libraryResult.status === 'fulfilled' && libraryResult.value.success
        ? (libraryResult.value.data as unknown as { messageType: string; id: string; name: string; messageContent: string }[])
            .filter((template): template is MessageTemplateItem => template.messageType === 'text' || template.messageType === 'flex')
            .map((template) => ({ ...template, id: `library:${template.id}`, name: `テンプレート｜${template.name}` }))
        : []
      const deliveryTemplates = deliveryResult.status === 'fulfilled' && deliveryResult.value.success
        ? deliveryResult.value.data
            .filter((template): template is MessageTemplateItem => template.messageType === 'text' || template.messageType === 'flex')
            .map((template) => ({ ...template, id: `delivery:${template.id}`, name: `配信テンプレート｜${template.name}` }))
        : []

      setTemplates([...libraryTemplates, ...deliveryTemplates])
    }

    void loadTemplates()
  }, [])

  useEffect(() => {
    if (selectedChatId) {
      loadChatDetail(selectedChatId)
    } else {
      setChatDetail(null)
    }
  }, [selectedChatId, loadChatDetail])

  // 詳細が新しくロードされたら最下部（＝最新メッセージ）までスクロールする。
  // そこから上にスクロールすれば過去のメッセージを辿れる（LINE受信画面と同じUX）。
  // ユーザーが手動でスクロールしたら delayed auto-scroll は発動させない。
  useEffect(() => {
    if (!chatDetail?.messages || chatDetail.messages.length === 0) return
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    let userScrolled = false
    const onScroll = () => {
      if (!messagesScrollRef.current) return
      const current = messagesScrollRef.current
      // 下端から一定以上離れたらユーザー操作とみなす
      if (current.scrollHeight - current.scrollTop - current.clientHeight > 20) {
        userScrolled = true
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // 画像/Flex の表示後に高さが増える場合に追従するフォロワー（ユーザーがスクロール済みなら発動させない）
    const id = window.setTimeout(() => {
      if (userScrolled || !messagesScrollRef.current) return
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight
    }, 150)
    return () => {
      window.clearTimeout(id)
      el.removeEventListener('scroll', onScroll)
    }
  }, [chatDetail?.id, chatDetail?.messages?.length])

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId)
    setMessageContent('')
    setMessageType('text')
    setMessageError('')
    setShowTemplateMenu(false)
  }

  const triggerLoadingAnimation = useCallback(async (chatId: string) => {
    if (!showLoadingIndicator) return

    const now = Date.now()
    const last = lastLoadingTriggerAtRef.current[chatId] ?? 0
    if (now - last < LOADING_REFRESH_INTERVAL_MS) return
    lastLoadingTriggerAtRef.current[chatId] = now

    try {
      await fetchApi<{ success: boolean }>(`/api/chats/${chatId}/loading`, {
        method: 'POST',
        body: JSON.stringify({ loadingSeconds }),
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown'
      setError(`ローディング表示の開始に失敗しました: ${detail}`)
    }
  }, [showLoadingIndicator, loadingSeconds])

  const handleSendMessage = async () => {
    if (!selectedChatId || !messageContent.trim() || sending || sendLockRef.current) return
    if (messageType === 'flex') {
      const validationError = getFlexJsonError(messageContent)
      if (validationError) {
        setMessageError(validationError)
        return
      }
    }

    const content = messageContent.trim()
    const sendingMessageType = messageType
    const sendingChatId = selectedChatId  // capture the chat id for this send
    sendLockRef.current = true
    setSending(true)
    setMessageError('')
    try {
      await api.chats.send(sendingChatId, { content, messageType: sendingMessageType })
      setMessageContent('')
      // Optimistic update: append message locally instead of refetching (prevents scroll jump / full reload feel)
      const now = new Date().toISOString()
      // Only mutate chatDetail if it still corresponds to the chat we just sent to
      setChatDetail((prev) => (prev && prev.id === sendingChatId) ? {
        ...prev,
        lastMessageAt: now,
        status: 'in_progress',
        messages: [
          ...(prev.messages ?? []),
          {
            id: crypto.randomUUID(),
            direction: 'outgoing',
            messageType: sendingMessageType,
            content,
            createdAt: now,
          },
        ],
      } : prev)
      setChats((prev) => {
        // Skip reconciliation if the list no longer contains this chat (e.g. tab changed mid-send)
        const exists = prev.some((c) => c.id === sendingChatId)
        if (!exists) return prev
        const currentFilter = statusFilterRef.current
        const updated = prev.map((c) => c.id === sendingChatId ? {
          ...c,
          lastMessageAt: now,
          status: 'in_progress' as const,
        } : c)
        // Drop rows that no longer match the current tab (e.g. replying from 未読 moves chat to in_progress)
        const filtered = currentFilter === 'all' ? updated : updated.filter((c) => c.status === currentFilter)
        return [...filtered].sort((a, b) => {
          const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
          const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
          return bt - at
        })
      })
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'メッセージの送信に失敗しました。')
    } finally {
      setSending(false)
      sendLockRef.current = false
    }
  }

  const handleStatusUpdate = async (newStatus: Chat['status']) => {
    if (!selectedChatId) return
    try {
      await api.chats.update(selectedChatId, { status: newStatus })
      loadChatDetail(selectedChatId)
      loadChats()
    } catch {
      setError('ステータスの更新に失敗しました。')
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedChatId) return
    setSavingNotes(true)
    try {
      await api.chats.update(selectedChatId, { notes })
      loadChatDetail(selectedChatId)
    } catch {
      setError('メモの保存に失敗しました。')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Flex JSONは複数行編集するため、Enterキーでは送信しない
    if (messageType === 'flex') return
    // IME変換確定のEnterでは送信しない
    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return
    if (e.key !== 'Enter') return
    // sendMode 'enter': Enter単体で送信、Shift+Enterは改行
    // sendMode 'shift-enter': Shift+Enterで送信、Enter単体は改行
    const shouldSend = sendMode === 'enter' ? !e.shiftKey : e.shiftKey
    if (shouldSend) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const liveFlexError = messageType === 'flex' && messageContent ? getFlexJsonError(messageContent) : ''

  return (
    <div>
      <Header title="オペレーターチャット" />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-120px)] lg:h-[calc(100vh-180px)]">
        {/* Left Panel: Chat List */}
        <div className={`w-full lg:w-96 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Status Filter Tabs */}
          <div className="flex border-b border-gray-200">
            {statusFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => { setStatusFilter(filter.key); setSelectedChatId(null) }}
                className={`flex-1 px-3 py-2.5 min-h-[44px] text-xs font-medium transition-colors ${
                  statusFilter === filter.key
                    ? 'text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={statusFilter === filter.key ? { backgroundColor: '#06C755' } : undefined}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-100 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-32" />
                        <div className="h-2 bg-gray-100 rounded w-20" />
                      </div>
                      <div className="h-5 bg-gray-100 rounded-full w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {chats.map((chat) => {
                  const statusInfo = statusConfig[chat.status]
                  const isSelected = selectedChatId === chat.id
                  return (
                    <button
                      key={chat.id}
                      onClick={() => { setSelectedFriendId(null); handleSelectChat(chat.id); }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                        isSelected && !selectedFriendId ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {chat.friendPictureUrl ? (
                          <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDatetime(chat.lastMessageAt)}</p>
                        </div>
                        <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail */}
        <div className={`flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId || selectedFriendId ? 'flex' : 'hidden lg:flex'}`}>
          {selectedFriendId && !selectedChatId ? (
            /* Direct message to friend without existing chat */
            <DirectMessagePanel
              friendId={selectedFriendId}
              friend={allFriends.find((f) => f.id === selectedFriendId) || null}
              templates={templates}
              onBack={() => setSelectedFriendId(null)}
            />
          ) : !selectedChatId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">チャットを選択してください</p>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 text-sm">読み込み中...</p>
            </div>
          ) : chatDetail ? (
            <>
              {/* Chat Header */}
              <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSelectedChatId(null)}
                    className="lg:hidden flex-shrink-0 p-1 -ml-1 text-gray-500 hover:text-gray-700"
                    aria-label="戻る"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {chatDetail.friendPictureUrl && (
                    <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {chatDetail.friendName}
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${statusConfig[chatDetail.status].className}`}
                    >
                      {statusConfig[chatDetail.status].label}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {chatDetail.status !== 'unread' && (
                    <button
                      onClick={() => handleStatusUpdate('unread')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    >
                      未読に戻す
                    </button>
                  )}
                  {chatDetail.status !== 'in_progress' && (
                    <button
                      onClick={() => handleStatusUpdate('in_progress')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md transition-colors"
                    >
                      対応中にする
                    </button>
                  )}
                  {chatDetail.status !== 'resolved' && (
                    <button
                      onClick={() => handleStatusUpdate('resolved')}
                      className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                    >
                      解決済にする
                    </button>
                  )}
                </div>
              </div>

              {/* Messages — LINE-style chat bubbles */}
              <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#7494C0' }}>
                {(!chatDetail.messages || chatDetail.messages.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-white/60 text-sm">メッセージはまだありません。</p>
                  </div>
                ) : (
                  (chatDetail.messages ?? []).map((msg) => {
                    const isOutgoing = msg.direction === 'outgoing'

                    // メッセージ表示の分岐
                    let bubbleContent: React.ReactNode
                    if (msg.messageType === 'flex') {
                      bubbleContent = (
                        <div className="max-w-[300px]">
                          <FlexPreviewComponent content={msg.content} maxWidth={280} />
                        </div>
                      )
                    } else if (msg.messageType === 'image') {
                      try {
                        const parsed = JSON.parse(msg.content)
                        bubbleContent = (
                          <img src={parsed.originalContentUrl || parsed.previewImageUrl} alt="" className="max-w-[200px] rounded" />
                        )
                      } catch {
                        bubbleContent = <span>🖼️ [画像]</span>
                      }
                    } else {
                      bubbleContent = <span>{msg.content}</span>
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                      >
                        {/* 相手のアイコン（incoming のみ） */}
                        {!isOutgoing && (
                          chatDetail.friendPictureUrl ? (
                            <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />
                          )
                        )}

                        <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                          {/* メッセージバブル */}
                          <div
                            className={`max-w-[320px] px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                              isOutgoing
                                ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl text-white'
                                : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl bg-white text-gray-900'
                            }`}
                            style={isOutgoing ? { backgroundColor: '#06C755' } : undefined}
                          >
                            {bubbleContent}
                          </div>
                          {/* 時刻 */}
                          <span className="text-xs text-white/50 mt-0.5 px-1">
                            {new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Notes */}
              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="メモを入力..."
                    className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? '保存中...' : 'メモ保存'}
                  </button>
                </div>
              </div>

              {/* Send Message Form */}
              <div className="px-4 py-3 border-t border-gray-200">
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600">
                  <MessageTypeSelector
                    value={messageType}
                    onChange={(type) => {
                      setMessageType(type)
                      setMessageError('')
                    }}
                  />
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showLoadingIndicator}
                      onChange={(e) => setShowLoadingIndicator(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    入力中ローディングを表示
                  </label>
                  <select
                    value={loadingSeconds}
                    onChange={(e) => setLoadingSeconds(Number.parseInt(e.target.value, 10))}
                    disabled={!showLoadingIndicator}
                    className="border border-gray-300 rounded-md px-2 py-1 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {[5, 10, 15, 20, 30, 45, 60].map((sec) => (
                      <option key={sec} value={sec}>{sec}秒</option>
                    ))}
                  </select>
                  {messageType === 'text' && (
                    <>
                      <span className="text-gray-500">送信キー:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          checked={sendMode === 'enter'}
                          onChange={() => setSendMode('enter')}
                          className="accent-green-600"
                        />
                        <span>Enter</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          checked={sendMode === 'shift-enter'}
                          onChange={() => setSendMode('shift-enter')}
                          className="accent-green-600"
                        />
                        <span>Shift+Enter</span>
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTemplateMenu((current) => !current)}
                    className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
                  >
                    📋 テンプレート
                  </button>
                </div>
                {showTemplateMenu && (
                  <div className="mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">テンプレート</span>
                      <button type="button" onClick={() => setShowTemplateMenu(false)} className="text-xs text-gray-400 hover:text-gray-600">
                        閉じる
                      </button>
                    </div>
                    {templates.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400">利用できるテンプレートがありません。</p>
                    ) : templates.map((template) => (
                      <button
                        type="button"
                        key={template.id}
                        onClick={() => {
                          setMessageType(template.messageType)
                          setMessageContent(template.messageContent)
                          setMessageError('')
                          setShowTemplateMenu(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0 truncate"
                      >
                        <span className="mr-2 text-xs text-gray-400">[{template.messageType === 'flex' ? 'Flex' : 'テキスト'}]</span>
                        {template.name}
                      </button>
                    ))}
                  </div>
                )}
                {messageType === 'flex' && messageContent && !liveFlexError && (
                  <div className="mb-3 rounded-lg bg-gray-50 p-3 overflow-x-auto">
                    <p className="text-xs font-medium text-gray-500 mb-2">送信プレビュー</p>
                    <FlexPreviewComponent content={messageContent} maxWidth={300} />
                  </div>
                )}
                {(messageError || liveFlexError) && (
                  <p className="mb-2 text-xs text-red-600">{messageError || liveFlexError}</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={messageType === 'flex' ? 7 : 2}
                    value={messageContent}
                    onChange={(e) => {
                      const value = e.target.value
                      setMessageContent(value)
                      setMessageError('')
                      if (messageType === 'text' && selectedChatId && isMessageInputFocused && value.trim()) {
                        void triggerLoadingAnimation(selectedChatId)
                      }
                    }}
                    onCompositionStart={() => { isComposingRef.current = true }}
                    onCompositionEnd={() => { isComposingRef.current = false }}
                    onFocus={() => {
                      setIsMessageInputFocused(true)
                      if (messageType === 'text' && selectedChatId) {
                        void triggerLoadingAnimation(selectedChatId)
                      }
                    }}
                    onBlur={() => setIsMessageInputFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={messageType === 'flex' ? '{"type":"bubble","body":{...}}' : 'メッセージを入力...'}
                    className={`flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-y ${messageType === 'flex' ? 'font-mono' : ''}`}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !messageContent.trim() || Boolean(liveFlexError)}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {sending ? '送信中...' : '送信'}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
