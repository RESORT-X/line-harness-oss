import type { Friend } from '@line-crm/db';

type HubSpotEnv = {
  HUBSPOT_PRIVATE_APP_TOKEN?: string;
  HUBSPOT_CONTACT_UNIQUE_PROPERTY?: string;
};

type SyncFriendOptions = {
  ref?: string | null;
  lineAccountId?: string | null;
};

type SyncFormSubmissionOptions = SyncFriendOptions & {
  formId: string;
  data: Record<string, unknown>;
  submittedAt: string;
};

const HUBSPOT_CONTACTS_BATCH_UPSERT_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert';
const DEFAULT_UNIQUE_PROPERTY = 'line_harness_friend_id';

const DEFAULT_FORM_FIELD_PROPERTY_MAP: Record<string, string> = {
  preferred_contact_time: 'preferred_contact_time',
  interest_level: 'interest_level',
  questions: 'questions',
  phone: 'phone',
  email: 'email',
};

function getToken(env: HubSpotEnv): string {
  return env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? '';
}

function getUniqueProperty(env: HubSpotEnv): string {
  return env.HUBSPOT_CONTACT_UNIQUE_PROPERTY?.trim() || DEFAULT_UNIQUE_PROPERTY;
}

function getFriendAny(friend: Friend): Record<string, unknown> {
  return friend as unknown as Record<string, unknown>;
}

function parseMetadata(friend: Friend): Record<string, unknown> {
  try {
    return JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asHubSpotValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).join(', ');
  return JSON.stringify(value);
}

function setIfPresent(
  properties: Record<string, string>,
  key: string,
  value: unknown,
): void {
  const hubspotValue = asHubSpotValue(value);
  if (hubspotValue !== undefined) properties[key] = hubspotValue;
}

function getRef(friend: Friend, explicitRef?: string | null): string | undefined {
  if (explicitRef) return explicitRef;
  const anyFriend = getFriendAny(friend);
  const metadata = parseMetadata(friend);
  return asHubSpotValue(anyFriend.ref_code ?? metadata.ref_code ?? metadata.ref);
}

function buildBaseContactProperties(
  friend: Friend,
  options: SyncFriendOptions = {},
): Record<string, string> {
  const anyFriend = getFriendAny(friend);
  const metadata = parseMetadata(friend);
  const properties: Record<string, string> = {};

  setIfPresent(properties, 'line_harness_friend_id', friend.id);
  setIfPresent(properties, 'line_user_id', friend.line_user_id);
  setIfPresent(properties, 'line_display_name', friend.display_name);
  setIfPresent(properties, 'line_picture_url', friend.picture_url);
  setIfPresent(properties, 'line_account_id', options.lineAccountId ?? friend.line_account_id);
  setIfPresent(properties, 'line_ref', getRef(friend, options.ref));
  setIfPresent(properties, 'line_friend_added_at', friend.created_at);
  setIfPresent(properties, 'firstname', friend.display_name);
  setIfPresent(properties, 'email', metadata.email);
  setIfPresent(properties, 'phone', metadata.phone);
  setIfPresent(properties, 'preferred_contact_time', metadata.preferred_contact_time);
  setIfPresent(properties, 'interest_level', metadata.interest_level);
  setIfPresent(properties, 'questions', metadata.questions);

  // Keep this compatible with older rows where ref_code exists in D1 but not in
  // the generated TypeScript interface.
  setIfPresent(properties, 'line_ref', properties.line_ref ?? anyFriend.ref_code);

  return properties;
}

function buildFormContactProperties(
  friend: Friend,
  options: SyncFormSubmissionOptions,
): Record<string, string> {
  const properties = buildBaseContactProperties(friend, options);

  setIfPresent(properties, 'line_latest_form_id', options.formId);
  setIfPresent(properties, 'line_latest_form_submitted_at', options.submittedAt);
  setIfPresent(properties, 'line_latest_form_answers_json', options.data);

  for (const [formField, hubspotProperty] of Object.entries(DEFAULT_FORM_FIELD_PROPERTY_MAP)) {
    setIfPresent(properties, hubspotProperty, options.data[formField]);
  }

  return properties;
}

async function upsertHubSpotContact(
  env: HubSpotEnv,
  friend: Friend,
  properties: Record<string, string>,
): Promise<void> {
  const token = getToken(env);
  if (!token) return;

  const uniqueProperty = getUniqueProperty(env);
  const uniqueValue = properties[uniqueProperty] ?? friend.id;
  if (!uniqueValue) return;
  properties[uniqueProperty] = uniqueValue;

  const res = await fetch(HUBSPOT_CONTACTS_BATCH_UPSERT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [
        {
          id: uniqueValue,
          idProperty: uniqueProperty,
          properties,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HubSpot contact upsert failed: ${res.status} ${text}`);
  }
}

export async function syncHubSpotFriend(
  env: HubSpotEnv,
  friend: Friend,
  options: SyncFriendOptions = {},
): Promise<void> {
  try {
    await upsertHubSpotContact(env, friend, buildBaseContactProperties(friend, options));
  } catch (err) {
    console.error('HubSpot friend sync error:', err);
  }
}

export async function syncHubSpotFormSubmission(
  env: HubSpotEnv,
  friend: Friend,
  options: SyncFormSubmissionOptions,
): Promise<void> {
  try {
    await upsertHubSpotContact(env, friend, buildFormContactProperties(friend, options));
  } catch (err) {
    console.error('HubSpot form submission sync error:', err);
  }
}
