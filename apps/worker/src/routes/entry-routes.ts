import { Hono } from 'hono';
import {
  createEntryRoute,
  deleteEntryRoute,
  getEntryRouteById,
  updateEntryRoute,
} from '@line-crm/db';
import type { EntryRoute } from '@line-crm/db';
import type { Env } from '../index.js';

const entryRoutes = new Hono<Env>();

type EntryRouteListRow = EntryRoute & {
  tag_name: string | null;
  tag_color: string | null;
  scenario_name: string | null;
  form_name: string | null;
  friend_count: number;
  click_count: number;
  latest_at: string | null;
};

type EntryRouteBody = {
  name?: string;
  refCode?: string;
  tagId?: string | null;
  scenarioId?: string | null;
  formId?: string | null;
  isActive?: boolean;
};

const REF_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function optionalId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildLineUrls(row: Pick<EntryRoute, 'ref_code' | 'form_id'>, baseUrl: string) {
  const query = new URLSearchParams();
  if (row.form_id) query.set('form', row.form_id);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const ref = encodeURIComponent(row.ref_code);

  const authQuery = new URLSearchParams({ ref: row.ref_code });
  if (row.form_id) authQuery.set('form', row.form_id);

  return {
    lineUrl: `${baseUrl}/r/${ref}${suffix}`,
    authUrl: `${baseUrl}/auth/line?${authQuery.toString()}`,
  };
}

function serializeEntryRoute(row: EntryRouteListRow | EntryRoute, baseUrl: string) {
  return {
    id: row.id,
    refCode: row.ref_code,
    name: row.name,
    tagId: row.tag_id,
    tagName: 'tag_name' in row ? row.tag_name : null,
    tagColor: 'tag_color' in row ? row.tag_color : null,
    scenarioId: row.scenario_id,
    scenarioName: 'scenario_name' in row ? row.scenario_name : null,
    formId: row.form_id,
    formName: 'form_name' in row ? row.form_name : null,
    isActive: Boolean(row.is_active),
    friendCount: 'friend_count' in row ? Number(row.friend_count ?? 0) : 0,
    clickCount: 'click_count' in row ? Number(row.click_count ?? 0) : 0,
    latestAt: 'latest_at' in row ? row.latest_at : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...buildLineUrls(row, baseUrl),
  };
}

function validateCreateBody(body: EntryRouteBody): {
  name: string;
  refCode: string;
  tagId: string | null;
  scenarioId: string | null;
  formId: string | null;
  isActive: boolean | undefined;
} | { error: string } {
  const name = body.name?.trim() ?? '';
  const refCode = body.refCode?.trim() ?? '';

  if (!name || !refCode) {
    return { error: 'name and refCode are required' };
  }
  if (!REF_CODE_PATTERN.test(refCode)) {
    return { error: 'refCode must be 1-64 chars: letters, numbers, hyphen, or underscore' };
  }

  return {
    name,
    refCode,
    tagId: optionalId(body.tagId),
    scenarioId: optionalId(body.scenarioId),
    formId: optionalId(body.formId),
    isActive: body.isActive,
  };
}

function validateUpdateBody(body: EntryRouteBody): Partial<{
  name: string;
  refCode: string;
  tagId: string | null;
  scenarioId: string | null;
  formId: string | null;
  isActive: boolean;
}> | { error: string } {
  const updates: Partial<{
    name: string;
    refCode: string;
    tagId: string | null;
    scenarioId: string | null;
    formId: string | null;
    isActive: boolean;
  }> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return { error: 'name cannot be empty' };
    updates.name = name;
  }

  if (body.refCode !== undefined) {
    const refCode = body.refCode.trim();
    if (!REF_CODE_PATTERN.test(refCode)) {
      return { error: 'refCode must be 1-64 chars: letters, numbers, hyphen, or underscore' };
    }
    updates.refCode = refCode;
  }

  if (body.tagId !== undefined) updates.tagId = optionalId(body.tagId);
  if (body.scenarioId !== undefined) updates.scenarioId = optionalId(body.scenarioId);
  if (body.formId !== undefined) updates.formId = optionalId(body.formId);
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  return updates;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('unique');
}

entryRoutes.get('/api/entry-routes', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId') || '';
    const withAccount = Boolean(lineAccountId);
    const friendCount = withAccount
      ? `(SELECT COUNT(*) FROM friends f WHERE f.ref_code = er.ref_code AND f.line_account_id = ?)`
      : `(SELECT COUNT(*) FROM friends f WHERE f.ref_code = er.ref_code)`;
    const clickCount = withAccount
      ? `(SELECT COUNT(*) FROM ref_tracking rt INNER JOIN friends rf ON rf.id = rt.friend_id WHERE rt.ref_code = er.ref_code AND rf.line_account_id = ?)`
      : `(SELECT COUNT(*) FROM ref_tracking rt WHERE rt.ref_code = er.ref_code)`;
    const latestAt = withAccount
      ? `(SELECT MAX(rt.created_at) FROM ref_tracking rt INNER JOIN friends lf ON lf.id = rt.friend_id WHERE rt.ref_code = er.ref_code AND lf.line_account_id = ?)`
      : `(SELECT MAX(rt.created_at) FROM ref_tracking rt WHERE rt.ref_code = er.ref_code)`;

    const statement = c.env.DB.prepare(
      `SELECT
        er.*,
        t.name as tag_name,
        t.color as tag_color,
        s.name as scenario_name,
        f.name as form_name,
        ${friendCount} as friend_count,
        ${clickCount} as click_count,
        ${latestAt} as latest_at
      FROM entry_routes er
      LEFT JOIN tags t ON t.id = er.tag_id
      LEFT JOIN scenarios s ON s.id = er.scenario_id
      LEFT JOIN forms f ON f.id = er.form_id
      ORDER BY er.created_at DESC`,
    );
    const rows = withAccount
      ? await statement.bind(lineAccountId, lineAccountId, lineAccountId).all<EntryRouteListRow>()
      : await statement.all<EntryRouteListRow>();

    const baseUrl = getBaseUrl(c);
    return c.json({
      success: true,
      data: (rows.results ?? []).map((row) => serializeEntryRoute(row, baseUrl)),
    });
  } catch (err) {
    console.error('GET /api/entry-routes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

entryRoutes.post('/api/entry-routes', async (c) => {
  try {
    const body = await c.req.json<EntryRouteBody>();
    const parsed = validateCreateBody(body);
    if ('error' in parsed) {
      return c.json({ success: false, error: parsed.error }, 400);
    }

    const route = await createEntryRoute(c.env.DB, parsed);
    const baseUrl = getBaseUrl(c);
    return c.json({ success: true, data: serializeEntryRoute(route, baseUrl) }, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ success: false, error: 'refCode already exists' }, 409);
    }
    console.error('POST /api/entry-routes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

entryRoutes.patch('/api/entry-routes/:id', async (c) => {
  try {
    const body = await c.req.json<EntryRouteBody>();
    const parsed = validateUpdateBody(body);
    if ('error' in parsed) {
      return c.json({ success: false, error: parsed.error }, 400);
    }

    const route = await updateEntryRoute(c.env.DB, c.req.param('id'), parsed);
    if (!route) {
      return c.json({ success: false, error: 'Entry route not found' }, 404);
    }

    const baseUrl = getBaseUrl(c);
    return c.json({ success: true, data: serializeEntryRoute(route, baseUrl) });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ success: false, error: 'refCode already exists' }, 409);
    }
    console.error('PATCH /api/entry-routes/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

entryRoutes.delete('/api/entry-routes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getEntryRouteById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Entry route not found' }, 404);
    }

    await deleteEntryRoute(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/entry-routes/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { entryRoutes };
