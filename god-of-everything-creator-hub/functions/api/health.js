export async function onRequestGet({ env }) {
  if (!env.CREATOR_PAGES) return Response.json({ ok: false, error: 'KV binding CREATOR_PAGES is not configured.' }, { status: 503 });
  return Response.json({ ok: true, service: 'GOD OF EVERYTHING Creator Hub API' }, { headers: { 'Cache-Control': 'no-store' } });
}
