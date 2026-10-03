import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const html = await readFile(join(__dirname, 'public', 'index.html'));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dhwkaulzhrcebtrcchyl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_PcVeysFLsXPxulL1OqDLmA_SWWGDNdG';

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeLimit(value) {
  const n = Number(value ?? 200);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.floor(n), 500)) : 200;
}

async function institutionalFeed(req, res, format) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': 'https://vs.metatility.io',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      'cache-control': 'no-store',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Authenticated bearer token required' });
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const query = new URLSearchParams();
  query.set(
    'select',
    'id,schema_version,source_system,event_type,entity_type,entity_id,concept_id,occurred_at,payload'
  );
  query.set('order', 'occurred_at.asc,id.asc');
  query.set('limit', String(normalizeLimit(requestUrl.searchParams.get('limit'))));

  const since = requestUrl.searchParams.get('since');
  if (since) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.valueOf())) {
      sendJson(res, 400, { error: 'Invalid since timestamp' });
      return;
    }
    query.set('occurred_at', 'gt.' + parsed.toISOString());
  }

  const conceptId = requestUrl.searchParams.get('concept_id');
  if (conceptId) query.set('concept_id', 'eq.' + conceptId);

  const eventType = requestUrl.searchParams.get('event_type');
  if (eventType) query.set('event_type', 'eq.' + eventType);

  const upstream = await fetch(
    SUPABASE_URL + '/rest/v1/vs_institutional_events?' + query.toString(),
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization,
        accept: 'application/json',
      },
    }
  );

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('VS IS feed upstream error', upstream.status, detail.slice(0, 300));
    sendJson(res, upstream.status === 401 ? 401 : 502, {
      error: upstream.status === 401 ? 'Session is not authorized' : 'Institutional event query failed',
    });
    return;
  }

  const rows = await upstream.json();
  const events = (Array.isArray(rows) ? rows : [])
    .filter(
      (event) =>
        event?.entity_type !== 'simulation' &&
        !String(event?.event_type ?? '').startsWith('simulation.')
    )
    .map((event) => ({
      event_id: event.id,
      schema_version: event.schema_version || '1.1',
      source_system: event.source_system || 'metatility-vs',
      target_system: 'metatility-is',
      event_type: event.event_type,
      entity: {
        type: event.entity_type,
        id: event.entity_id,
        concept_id: event.concept_id,
      },
      occurred_at: event.occurred_at,
      payload: event.payload || {},
    }));

  const generatedAt = new Date().toISOString();
  const body =
    format === 'ndjson'
      ? events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '')
      : JSON.stringify({
          contract: 'metatility.vs-is-feed',
          schema_version: '1.1',
          source_system: 'metatility-vs',
          target_system: 'metatility-is',
          generated_at: generatedAt,
          event_count: events.length,
          simulation_events_included: false,
          events,
        });

  const digest = sha256(body);
  res.writeHead(200, {
    'content-type':
      format === 'ndjson'
        ? 'application/x-ndjson; charset=utf-8'
        : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'https://vs.metatility.io',
    'x-metatility-contract': 'vs-is-feed',
    'x-metatility-schema-version': '1.1',
    'x-metatility-event-count': String(events.length),
    'x-metatility-feed-sha256': digest,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    if (pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        system: 'metatility-vs',
        version: '0.5.0',
        persistence: 'supabase',
        exchange: 'vs-is-feed',
      });
      return;
    }

    if (pathname === '/api/is-feed') {
      await institutionalFeed(req, res, 'json');
      return;
    }

    if (pathname === '/api/is-feed.ndjson') {
      await institutionalFeed(req, res, 'ndjson');
      return;
    }

    if (pathname === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    console.error('Unhandled request error', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () =>
  console.log(`Metatility VS v0.5 listening on ${PORT}`)
);
