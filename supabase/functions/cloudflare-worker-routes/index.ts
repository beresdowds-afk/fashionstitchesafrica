import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CF_TOKEN = (Deno.env.get('CLOUDFLARE_API_TOKEN') ?? '').replace(/[^\x21-\x7E]/g, '');
const CF_ACCOUNT_ID = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? '').replace(/[^\x21-\x7E]/g, '');
const CF_API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = Deno.env.get('CLOUDFLARE_TENANT_WORKER_NAME') ?? 'fysora-tenant-rewriter';
const KV_NAMESPACE_ID = (Deno.env.get('CLOUDFLARE_TENANT_KV_NAMESPACE_ID') ?? '').replace(/[^\x21-\x7E]/g, '');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function cf(path: string, init: RequestInit = {}) {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// Raw KV write needs text/plain body (not JSON-wrapped).
async function kvPut(key: string, value: string) {
  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'text/plain' },
      body: value,
    },
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
async function kvDelete(key: string) {
  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } },
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
async function kvList() {
  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/keys`,
    { headers: { Authorization: `Bearer ${CF_TOKEN}` } },
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// Walk apex labels to find which zone (in this CF account) owns the hostname.
async function findZoneForHostname(hostname: string): Promise<string | null> {
  const parts = hostname.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const { ok, body } = await cf(`/zones?name=${encodeURIComponent(candidate)}`);
    if (ok && (body as any).result?.length) return (body as any).result[0].id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!CF_TOKEN || !CF_ACCOUNT_ID) {
    return json(500, { error: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not configured' });
  }

  // Authn: require a signed-in super admin (uses caller JWT).
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes?.user) return json(401, { error: 'unauthorized' });
  const { data: isSuper } = await userClient.rpc('has_role', {
    _user_id: userRes.user.id,
    _role: 'super_admin',
  });
  if (!isSuper) return json(403, { error: 'super_admin required' });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const { action, hostname, slug } = payload || {};

  // ---- action: provision_route ----
  // Binds `<hostname>/*` to the tenant rewriter Worker on the matching zone.
  if (action === 'provision_route') {
    if (!hostname) return json(400, { error: 'hostname required' });
    const zoneId = await findZoneForHostname(hostname);
    if (!zoneId) return json(404, { error: `no Cloudflare zone found for ${hostname}` });

    const pattern = `${hostname}/*`;
    const created = await cf(`/zones/${zoneId}/workers/routes`, {
      method: 'POST',
      body: JSON.stringify({ pattern, script: WORKER_NAME }),
    });

    // 10020 = "Route already exists" → treat as success.
    const dup = (created.body as any)?.errors?.some((e: any) => e.code === 10020);
    if (!created.ok && !dup) return json(created.status, { error: created.body });

    // If caller provided a slug, also persist host→slug + www variant in KV
    // so the rewriter can resolve this tenant immediately without a redeploy.
    let kvWritten: string[] = [];
    if (slug && KV_NAMESPACE_ID) {
      const hosts = [hostname.toLowerCase(), `www.${hostname.toLowerCase()}`.replace(/^www\.www\./, 'www.')];
      for (const h of hosts) {
        const r = await kvPut(h, String(slug));
        if (r.ok) kvWritten.push(h);
      }
    }

    await admin.from('audit_logs').insert({
      action: 'cloudflare_worker_route_provisioned',
      details: { hostname, slug: slug ?? null, zone_id: zoneId, pattern, worker: WORKER_NAME, duplicate: !!dup, kv_written: kvWritten },
      user_id: userRes.user.id,
    });

    return json(200, { ok: true, zone_id: zoneId, pattern, worker: WORKER_NAME, duplicate: !!dup, kv_written: kvWritten });
  }

  // ---- action: list_routes ----
  if (action === 'list_routes') {
    if (!hostname) return json(400, { error: 'hostname required' });
    const zoneId = await findZoneForHostname(hostname);
    if (!zoneId) return json(404, { error: 'zone not found' });
    const { body } = await cf(`/zones/${zoneId}/workers/routes`);
    return json(200, { ok: true, routes: (body as any).result ?? [] });
  }

  // ---- action: delete_route ----
  if (action === 'delete_route') {
    const { route_id, zone_id } = payload;
    if (!route_id || !zone_id) return json(400, { error: 'route_id and zone_id required' });
    const { ok, status, body } = await cf(`/zones/${zone_id}/workers/routes/${route_id}`, {
      method: 'DELETE',
    });
    if (!ok) return json(status, { error: body });
    await admin.from('audit_logs').insert({
      action: 'cloudflare_worker_route_deleted',
      details: { zone_id, route_id },
      user_id: userRes.user.id,
    });
    return json(200, { ok: true });
  }

  // ---- action: set_tenant_mapping ----
  // Upsert a host → slug entry in the Workers KV namespace bound as TENANT_MAP.
  if (action === 'set_tenant_mapping') {
    if (!hostname || !slug) return json(400, { error: 'hostname and slug required' });
    if (!KV_NAMESPACE_ID) return json(500, { error: 'CLOUDFLARE_TENANT_KV_NAMESPACE_ID not configured' });
    const host = String(hostname).toLowerCase();
    const hosts = host.startsWith('www.') ? [host, host.replace(/^www\./, '')] : [host, `www.${host}`];
    const results: Record<string, boolean> = {};
    for (const h of hosts) {
      const r = await kvPut(h, String(slug));
      results[h] = r.ok;
    }
    await admin.from('audit_logs').insert({
      action: 'cloudflare_worker_kv_mapping_set',
      details: { hostname: host, slug, results },
      user_id: userRes.user.id,
    });
    return json(200, { ok: true, results });
  }

  // ---- action: delete_tenant_mapping ----
  if (action === 'delete_tenant_mapping') {
    if (!hostname) return json(400, { error: 'hostname required' });
    if (!KV_NAMESPACE_ID) return json(500, { error: 'CLOUDFLARE_TENANT_KV_NAMESPACE_ID not configured' });
    const host = String(hostname).toLowerCase();
    const hosts = host.startsWith('www.') ? [host, host.replace(/^www\./, '')] : [host, `www.${host}`];
    const results: Record<string, boolean> = {};
    for (const h of hosts) {
      const r = await kvDelete(h);
      results[h] = r.ok;
    }
    await admin.from('audit_logs').insert({
      action: 'cloudflare_worker_kv_mapping_deleted',
      details: { hostname: host, results },
      user_id: userRes.user.id,
    });
    return json(200, { ok: true, results });
  }

  // ---- action: list_tenant_mappings ----
  if (action === 'list_tenant_mappings') {
    if (!KV_NAMESPACE_ID) return json(500, { error: 'CLOUDFLARE_TENANT_KV_NAMESPACE_ID not configured' });
    const { ok, status, body } = await kvList();
    if (!ok) return json(status, { error: body });
    return json(200, { ok: true, keys: (body as any).result ?? [] });
  }

  return json(400, { error: 'unknown action' });
});