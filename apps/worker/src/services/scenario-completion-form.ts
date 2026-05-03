import { getFormById, getFriendById, getLineAccountById, jstNow } from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';

type CompletionFormEnv = {
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LIFF_URL: string;
  WORKER_URL?: string;
};

type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: unknown };

function getLiffFormUrl(params: {
  liffId: string | null;
  workerUrl?: string;
  formId: string;
  refCode?: string | null;
}): string {
  const query = new URLSearchParams({ page: 'form', id: params.formId });
  if (params.refCode) query.set('ref', params.refCode);

  if (params.liffId) {
    return `https://liff.line.me/${params.liffId}?${query.toString()}`;
  }

  const base = params.workerUrl?.replace(/\/+$/, '') || '';
  return base ? `${base}?${query.toString()}` : `/?${query.toString()}`;
}

function buildFormRequestMessage(formName: string, formUrl: string): LineMessage {
  return {
    type: 'flex',
    altText: `${formName}のご入力`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'ご希望をお聞かせください',
            weight: 'bold',
            size: 'lg',
            color: '#111827',
            wrap: true,
          },
          {
            type: 'text',
            text: '今後のご案内をスムーズにするため、かんたんな質問にご回答ください。',
            size: 'sm',
            color: '#6b7280',
            margin: 'md',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '回答する', uri: formUrl },
            style: 'primary',
            color: '#06C755',
          },
        ],
      },
    },
  };
}

function logPayload(message: LineMessage): { messageType: string; content: string } {
  if (message.type === 'text') return { messageType: 'text', content: message.text };
  return { messageType: 'flex', content: JSON.stringify(message.contents) };
}

export async function sendScenarioCompletionForm(
  db: D1Database,
  env: CompletionFormEnv,
  friendId: string,
  scenarioId: string,
): Promise<void> {
  try {
  const scenario = await db
    .prepare('SELECT on_completion_form_id FROM scenarios WHERE id = ?')
    .bind(scenarioId)
    .first<{ on_completion_form_id: string | null }>();
  const formId = scenario?.on_completion_form_id;
  if (!formId) return;

  const [friend, form] = await Promise.all([
    getFriendById(db, friendId),
    getFormById(db, formId),
  ]);

  if (!friend?.line_user_id || !friend.is_following || !form?.is_active) return;

  let accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  let liffId: string | null = null;
  const friendAccountId = (friend as unknown as Record<string, string | null>).line_account_id;
  if (friendAccountId) {
    const account = await getLineAccountById(db, friendAccountId);
    if (account?.channel_access_token) accessToken = account.channel_access_token;
    if (account?.liff_id) liffId = account.liff_id;
  }

  if (!liffId) {
    const match = env.LIFF_URL.match(/liff\.line\.me\/([0-9]+-[A-Za-z0-9]+)/);
    liffId = match?.[1] ?? null;
  }

  const formUrl = getLiffFormUrl({
    liffId,
    workerUrl: env.WORKER_URL,
    formId,
    refCode: (friend as unknown as Record<string, string | null>).ref_code,
  });
  const message = buildFormRequestMessage(form.name, formUrl);
  const lineClient = new LineClient(accessToken);
  await lineClient.pushMessage(friend.line_user_id, [message as never]);

  const payload = logPayload(message);
  await db
    .prepare(
      `INSERT INTO messages_log
         (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, source, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'push', 'scenario', ?)`,
    )
    .bind(crypto.randomUUID(), friend.id, payload.messageType, payload.content, jstNow())
    .run();
  } catch (err) {
    console.error('Scenario completion form push error:', err);
  }
}
