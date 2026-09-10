import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { safeFetch, UnsafeUrlError } from 'ssrf-guard/node';
import {
    ALLOWED_METHODS,
    describeFetchFailure,
    type ProxyTarget,
    parseTarget,
    TargetError
} from './target.js';

const PORT = Number(process.env.PORT ?? 8080);
const UPSTREAM_TIMEPUT_MS = Number(process.env.UPSTREAM_TIMEPUT_MS ?? 10_000);
const MAX_BODY_BYTES = 256 * 1024;
const FORWARD_HEADERS = ['authorization', 'content-type', 'if-match'] as const;
const RATE = { capacity: 30, refillPerSecond: 1 };

const app = new Hono();
const buckets = new Map<string, { tokens: number; updated: number }>();

function corsHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
        'Access-Control-Max-Age': '86400'
    };
}

function problem(status: number, code: string, message: string): Response {
    return new Response(JSON.stringify({ error: { code, message } }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...corsHeaders()
        }
    });
}

function takeToken(key: string): boolean {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: RATE.capacity, updated: now };
    const elapsed = (now - bucket.updated) / 1000;

    bucket.tokens = Math.min(RATE.capacity, bucket.tokens + elapsed * RATE.refillPerSecond);
    bucket.updated = now;

    if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);

    return true;
}

setInterval(() => {
    const cutoff = Date.now() - 5 * 60_000;

    for (const [key, bucket] of buckets) {
        if (bucket.updated < cutoff) {
            buckets.delete(key);
        }
    }
}, 60_000).unref();

app.all('/api/*', async (c) => {
    const request = c.req.raw;
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
        return problem(405, 'method_not_allowed', 'That method is not provided');
    }

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const rateKey = forwarded || getConnInfo(c).remote.address || 'unknown';

    if (!takeToken(rateKey)) {
        return problem(429, 'rate_limited', 'Too many requests.');
    }

    let target: ProxyTarget;

    try {
        target = parseTarget(url.pathname, url.search);
    } catch (err) {
        if (err instanceof TargetError) {
            return problem(400, err.code, err.message);
        }

        throw err;
    }

    let body: string | undefined;

    if (request.method !== 'GET' && request.method !== 'DELETE') {
        const raw = await request.arrayBuffer();

        if (raw.byteLength > MAX_BODY_BYTES) {
            return problem(413, 'body_too_large', 'Request body is too large to proxy');
        }

        if (raw.byteLength > 0) {
            body = new TextDecoder().decode(raw);
        }
    }

    const headers = new Headers();

    for (const name of FORWARD_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
    }

    try {
        const upstream = await safeFetch(`http://${target.host}:${target.port}${target.path}`, {
            method: request.method,
            headers,
            body,
            maxRedirects: 0,
            signal: AbortSignal.timeout(UPSTREAM_TIMEPUT_MS)
        });

        const out = new Headers(corsHeaders());
        const contentType = upstream.headers.get('content-type');

        if (contentType) out.set('Content-Type', contentType);

        const etag = upstream.headers.get('etag');

        if (etag) out.set('ETag', etag);

        out.set('Cache-Control', 'no-store');

        return new Response(upstream.body as ReadableStream | null, {
            status: upstream.status,
            headers: out
        });
    } catch (err) {
        if (err instanceof UnsafeUrlError) {
            return problem(400, 'host_not_allowed', 'That host cannot be proxied');
        }

        const { code, message } = describeFetchFailure(err, target);

        return problem(502, code, message);
    }
});

app.get('/health', (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`rcon proxy listening on port ${info.port}`);
});

export default app;
