import { jstNow } from '@line-crm/db';

export type LeadMetadataField = {
  key: string;
  label: string;
  value: string;
};

export type LeadMetadata = {
  source: string;
  submittedAt: string;
  fullName: string;
  fields: LeadMetadataField[];
};

const MAX_LEAD_PARAM_LENGTH = 12000;
const MAX_FIELD_COUNT = 40;
const MAX_LABEL_LENGTH = 80;
const MAX_VALUE_LENGTH = 1200;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function cleanString(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return truncate(value.map((item) => cleanString(item, max)).filter(Boolean).join('、'), max);
  }
  if (typeof value === 'object') {
    try {
      return truncate(JSON.stringify(value), max);
    } catch {
      return '';
    }
  }
  return truncate(String(value).trim(), max);
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function parseLeadJson(raw: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(raw));
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

export function parseLeadParam(rawLead: string | null | undefined): LeadMetadata | null {
  const raw = rawLead?.trim();
  if (!raw || raw.length > MAX_LEAD_PARAM_LENGTH) return null;

  const parsed = parseLeadJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const rawFields = Array.isArray(obj.fields) ? obj.fields : [];
  const fields = rawFields
    .slice(0, MAX_FIELD_COUNT)
    .map((field): LeadMetadataField | null => {
      if (!field || typeof field !== 'object') return null;
      const item = field as Record<string, unknown>;
      const key = cleanString(item.key, 80);
      const label = cleanString(item.label, MAX_LABEL_LENGTH) || key;
      const value = cleanString(item.value, MAX_VALUE_LENGTH);
      if (!key || !label || !value) return null;
      return { key, label, value };
    })
    .filter((field): field is LeadMetadataField => Boolean(field));

  if (fields.length === 0) return null;

  const fullNameFromPayload = cleanString(obj.fullName, 120);
  const lastName = fields.find((field) => field.key === 'lastName')?.value || '';
  const firstName = fields.find((field) => field.key === 'firstName')?.value || '';
  const fullName = fullNameFromPayload || `${lastName} ${firstName}`.trim();
  const submittedAt = cleanString(obj.submittedAt, 80) || jstNow();

  return {
    source: cleanString(obj.source, 120),
    submittedAt,
    fullName,
    fields,
  };
}

export function leadMetadataToText(lead: LeadMetadata): string {
  return lead.fields.map((field) => `・${field.label}: ${field.value}`).join('\n');
}

export async function saveLeadMetadata(
  db: D1Database,
  friendId: string,
  rawLead: string | null | undefined,
): Promise<LeadMetadata | null> {
  const lead = parseLeadParam(rawLead);
  if (!lead) return null;

  const existing = await db
    .prepare('SELECT metadata FROM friends WHERE id = ?')
    .bind(friendId)
    .first<{ metadata: string }>();
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(existing?.metadata || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  metadata.lp_form_submission = lead;
  metadata.lp_form_submission_text = leadMetadataToText(lead);
  if (lead.fullName) metadata.real_name = lead.fullName;

  await db
    .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(metadata), jstNow(), friendId)
    .run();

  return lead;
}
