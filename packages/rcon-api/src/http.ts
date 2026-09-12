import type { z } from 'zod';
import {
    ApiErrorEnvelope,
    ConfigResultBody,
    type ConfigResultBodyShape,
    normalizeApiError
} from './schemas.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TransportOptions {
    baseUrl: string;
    password: string;
    fetch?: FetchLike;
    timeoutMs?: number;
}

export interface RequestInitLite {
    method?: string;
    body?: string;
    contentType?: string;
    headers?: Record<string, string>;
}

export interface ConfigResult {
    ok: boolean;
    status: number;
    conflict: boolean;
    revision: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    outcomes: ConfigResultBodyShape['outcomes'];
    shadowed: ConfigResultBodyShape['shadowed'];
    stripped: ConfigResultBodyShape['stripped'];
    errors: ConfigResultBodyShape['errors'];
    changed: unknown[];
    conflictDeltas: unknown[];
    warnings: string[];
    timingsMs: ConfigResultBodyShape['timingsMs'];
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function emptyConfigResult(): ConfigResult {
    return {
        ok: false,
        status: 0,
        conflict: false,
        revision: null,
        errorCode: null,
        errorMessage: null,
        outcomes: [],
        shadowed: [],
        stripped: [],
        errors: [],
        changed: [],
        conflictDeltas: [],
        warnings: [],
        timingsMs: null
    };
}

export class RconError extends Error {
    readonly code: string;
    readonly status: number | null;

    constructor(message: string, code: string, status: number | null = null) {
        super(message);

        this.name = 'RconError';
        this.code = code;
        this.status = status;
    }

    get isAuthFailure(): boolean {
        return this.status === 401 || this.status === 403;
    }
}

export class RconSchemaError extends Error {
    readonly path: string;
    readonly issues: z.core.$ZodIssue[];

    constructor(path: string, issues: z.core.$ZodIssue[]) {
        const detail = issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ');

        super(`Response from ${path} did not match the expected shape — ${detail}`);

        this.name = 'RconSchemaError';
        this.path = path;
        this.issues = issues;
    }
}

export class Transport {
    private readonly baseUrl: string;
    private readonly password: string;
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;

    constructor(options: TransportOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.password = options.password;
        this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.timeoutMs = options.timeoutMs ?? 15_000;
    }

    async request<T>(path: string, schema: z.ZodType<T>, init: RequestInitLite = {}): Promise<T> {
        const response = await this.send(path, init);
        const text = await response.text();

        if (!response.ok) {
            throw this.toError(text, response.status);
        }

        const raw = text.length > 0 ? safeJson(text) : {};
        const parsed = schema.safeParse(raw);

        if (!parsed.success) {
            throw new RconSchemaError(path, parsed.error.issues);
        }

        return parsed.data;
    }

    async configRequest(path: string, init: RequestInitLite = {}): Promise<ConfigResult> {
        let response: Response;
        let text: string;

        try {
            response = await this.send(path, init);
            text = await response.text();
        } catch (err) {
            return {
                ...emptyConfigResult(),
                errorCode: err instanceof RconError ? err.code : 'network_error',
                errorMessage: err instanceof Error ? err.message : String(err)
            };
        }

        const raw = text.length > 0 ? safeJson(text) : {};
        const parsed = ConfigResultBody.safeParse(raw);
        const body = parsed.success ? parsed.data : ConfigResultBody.parse({});
        const error =
            typeof body.error === 'string'
                ? { code: 'error', message: body.error }
                : (body.error ?? null);

        return {
            ok: response.ok && body.ok !== false,
            status: response.status,
            conflict: response.status === 412,
            revision: body.revision ?? null,
            errorCode: error?.code ?? null,
            errorMessage:
                error?.message ?? (response.ok ? null : `Request failed (${response.status}).`),
            outcomes: body.outcomes,
            shadowed: body.shadowed,
            stripped: body.stripped,
            errors: body.errors,
            changed: body.changed,
            conflictDeltas: body.conflict,
            warnings: body.warnings,
            timingsMs: body.timingsMs
        };
    }

    private async send(path: string, init: RequestInitLite): Promise<Response> {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.password}`,
            ...(init.headers ?? {})
        };

        if (init.body !== undefined && init.contentType) {
            headers['Content-Type'] = init.contentType;
        }

        try {
            return await this.fetchImpl(`${this.baseUrl}${path}`, {
                method: init.method ?? 'GET',
                headers,
                body: init.body,
                cache: 'no-store',
                credentials: 'omit',
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        } catch (err) {
            const reason =
                err instanceof Error && err.name === 'TimeoutError'
                    ? `No response within ${this.timeoutMs}ms.`
                    : 'The request could not be completed.';

            throw new RconError(
                `Could not reach the server. ${reason} Check the host and port, that the RCON listener is running, and that it is reachable from here.`,
                'unreachable'
            );
        }
    }

    private toError(text: string, status: number): RconError {
        const error = normalizeApiError(safeJson(text));

        if (error) {
            return new RconError(error.message, error.code, status);
        }

        return new RconError(`Request failed (${status}).`, 'http_error', status);
    }
}
