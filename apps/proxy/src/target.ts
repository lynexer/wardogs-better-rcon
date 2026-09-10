export interface ProxyTarget {
    host: string;
    port: number;
    path: string;
}

export const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export class TargetError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);

        this.name = 'TargetError';
        this.code = code;
    }
}

export function parseTarget(pathname: string, search = ''): ProxyTarget {
    const [prefix, rawHost, rawPort, ...rest] = pathname.split('/').filter(Boolean);

    if (prefix !== 'api' || !rawHost || !rawPort || rest.length === 0) {
        throw new TargetError('bad_target', 'Expected /api/<host>/<port>/v1/...');
    }

    const host = decodeURIComponent(rawHost).trim().toLowerCase();
    const port = Number(rawPort);
    const path = `/${rest.join('/')}${search}`;

    if (!host || host.length > 253) {
        throw new TargetError('bad_host', 'Target host is missing or malformed.');
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TargetError('bad_port', 'Target port is out of range.');
    }

    if (port === 25) {
        throw new TargetError('bad_port', 'Port 25 cannot be proxied.');
    }

    if (!path.startsWith('/v1/')) {
        throw new TargetError('bad_path', 'Only /v1/ paths are proxied.');
    }

    return { host, port, path };
}

export function describeFetchFailure(
    err: unknown,
    target: ProxyTarget
): { code: string; message: string } {
    const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
    const errno = cause?.code ?? (err as { code?: string } | undefined)?.code ?? '';
    const where = `${target.host}:${target.port}`;

    switch (errno) {
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return {
                code: 'dns_failure',
                message: `Could not resolve "${target.host}". Check the hostname, or use the server's IP address instead.`
            };
        case 'ECONNREFUSED':
            return {
                code: 'connection_refused',
                message: `Nothing is listening on port ${target.port} at ${target.host}. The RCON listener may be disabled, or running on a different port.`
            };
        case 'ETIMEDOUT':
        case 'UND_ERR_CONNECT_TIMEOUT':
            return {
                code: 'connect_timeout',
                message: `${where} did not respond. A firewall is most likely dropping the connection.`
            };
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
            return { code: 'unreachable', message: `${where} is not reachable from this network.` };
        case 'ECONNRESET':
            return {
                code: 'connection_reset',
                message: `${where} closed the connection unexpectedly. It may not be an RCON listener.`
            };
        case 'UND_ERR_HEADERS_TIMEOUT':
            return {
                code: 'response_timeout',
                message: `${where} accepted the connection but sent no response in time.`
            };
        default:
            if (err instanceof Error && err.name === 'TimeoutError') {
                return { code: 'timeout', message: `${where} took too long to respond.` };
            }

            return { code: 'upstream_error', message: `Could not reach ${where}.` };
    }
}
