import { type ConfigResult, RconError, Transport, type TransportOptions } from './http.js';
import {
    AlternatorCatalog,
    AuditLog,
    BanList,
    Capabilities,
    type CapabilitiesShape,
    ConfigDocument,
    ExperienceCatalog,
    LightingCatalog,
    MapCatalog,
    MapExperienceIds,
    type MapSelectionBodyShape,
    MessageResponse,
    PlayerList,
    ReservedSlotList,
    Rotation,
    Sponsor,
    Status,
    type StatusShape
} from './schemas.js';

export interface Features {
    changeTeam: boolean;
    configDocument: boolean;
    reservedExpiry: boolean;
    routes: Set<string>;
}

export interface MapSelection {
    map: string;
    experiences?: string[];
    lighting?: string;
    alternator?: string;
    zoneAlternator?: string;
}

export interface SettingsPatch {
    scoreTick?: number;
    rotationEnabled?: boolean;
    rotationMode?: string;
}

export interface ApplyConfigOptions {
    revision?: string;
    force?: boolean;
    fullApply?: boolean;
}

export function mapSelection(selection: MapSelection): MapSelectionBodyShape {
    const alternator = selection.zoneAlternator ?? selection.alternator ?? '';
    const body: MapSelectionBodyShape = { map: selection.map };

    if (selection.experiences && selection.experiences.length > 0) {
        body.experiences = selection.experiences;
    }
    if (selection.lighting) {
        body.lighting = selection.lighting;
    }
    if (alternator && alternator !== 'None') {
        body.zoneAlternator = alternator;
    }

    return body;
}

const enc = encodeURIComponent;

export class WardogsRconClient {
    private readonly transport: Transport;
    private capabilities: CapabilitiesShape | null = null;

    constructor(options: TransportOptions) {
        this.transport = new Transport(options);
    }

    async connect(): Promise<StatusShape> {
        return this.getStatus();
    }

    async probeCapabilities(): Promise<Features> {
        if (!this.capabilities) {
            this.capabilities = await this.transport.request('/v1/capabilities', Capabilities);
        }

        const routes = new Set(
            this.capabilities.routes.map((r) =>
                r
                    .replace(/\{[^}]*\}/g, '*')
                    .replace(/:[A-Za-z0-9_]+/g, '*')
                    .replace(/\s+/g, ' ')
                    .trim()
            )
        );

        return {
            changeTeam: routes.has('PATCH /v1/players/*'),
            configDocument:
                routes.has('PUT /v1/config') && this.capabilities.config.writable !== false,
            reservedExpiry: false,
            routes
        };
    }

    getStatus() {
        return this.transport.request('/v1/status', Status);
    }

    getPlayers() {
        return this.transport.request('/v1/players', PlayerList);
    }

    kickPlayer(steamId: string, reason = 'Kicked by admin.') {
        return this.post(`/v1/players/${enc(steamId)}/kick`, { reason });
    }

    killPlayer(steamId: string) {
        return this.post(`/v1/players/${enc(steamId)}/kill`);
    }

    whisper(steamId: string, message: string) {
        return this.post(`/v1/players/${enc(steamId)}/message`, { message });
    }

    changeFaction(steamId: string, faction: string) {
        return this.transport.request(`/v1/players/${enc(steamId)}`, MessageResponse, {
            method: 'PATCH',
            body: JSON.stringify({ faction }),
            contentType: 'application/json'
        });
    }

    broadcast(message: string) {
        return this.post('/v1/broadcast', { message });
    }

    getBans() {
        return this.transport.request('/v1/bans', BanList);
    }

    banPlayer(steamId: string, reason?: string) {
        return this.post('/v1/bans', { steamId, reason: reason || undefined });
    }

    unban(steamId: string) {
        return this.delete(`/v1/bans/${enc(steamId)}`);
    }

    getReservedSlots() {
        return this.transport.request('/v1/reserved-slots', ReservedSlotList);
    }

    addReserved(steamId: string) {
        return this.post('/v1/reserved-slots', { steamId });
    }

    removeReserved(steamId: string) {
        return this.delete(`/v1/reserved-slots/${enc(steamId)}`);
    }

    getMaps() {
        return this.transport.request('/v1/catalog/maps', MapCatalog);
    }

    getLightings() {
        return this.transport.request('/v1/catalog/lightings', LightingCatalog);
    }

    getExperiences() {
        return this.transport.request('/v1/catalog/experiences', ExperienceCatalog);
    }

    getMapExperiences(mapId: string) {
        return this.transport.request(
            `/v1/catalog/maps/${enc(mapId)}/experiences`,
            MapExperienceIds
        );
    }

    getMapAlternators(mapId: string) {
        return this.transport.request(
            `/v1/catalog/maps/${enc(mapId)}/alternators`,
            AlternatorCatalog
        );
    }

    changeMap(selection: MapSelection) {
        return this.post('/v1/match/map', mapSelection(selection));
    }

    endMatch() {
        return this.post('/v1/match/end');
    }

    restartMatch() {
        return this.post('/v1/match/restart');
    }

    setLighting(lighting: string) {
        return this.transport.request('/v1/world/lighting', MessageResponse, {
            method: 'PUT',
            body: JSON.stringify({ lighting }),
            contentType: 'application/json'
        });
    }

    getRotation() {
        return this.transport.request('/v1/rotation', Rotation);
    }

    addRotationEntry(selection: MapSelection) {
        return this.post('/v1/rotation/entries', mapSelection(selection));
    }

    removeRotationEntry(index: number) {
        return this.delete(`/v1/rotation/entries/${index}`);
    }

    moveRotationEntry(index: number, direction: 'up' | 'down') {
        return this.post(`/v1/rotation/entries/${index}/move`, { direction });
    }

    saveRotation() {
        return this.post('/v1/rotation/save');
    }

    setSettings(patch: SettingsPatch) {
        const body: Record<string, unknown> = {};

        if (patch.scoreTick !== undefined) {
            body.scoreTick = Number(patch.scoreTick);
        }

        if (patch.rotationEnabled !== undefined) {
            body.rotationEnabled = Boolean(patch.rotationEnabled);
        }

        if (patch.rotationMode !== undefined) {
            body.rotationMode = String(patch.rotationMode);
        }

        if (Object.keys(body).length === 0) {
            throw new RconError('No settings to apply.', 'empty_patch');
        }

        return this.transport.request('/v1/settings', MessageResponse, {
            method: 'PATCH',
            body: JSON.stringify(body),
            contentType: 'application/json'
        });
    }

    getSponsor() {
        return this.transport.request('/v1/sponsor', Sponsor);
    }

    setSponsor(imageUrl: string) {
        return this.transport.request('/v1/sponsor', MessageResponse, {
            method: 'PUT',
            body: JSON.stringify({ imageUrl }),
            contentType: 'application/json'
        });
    }

    getAudit(limit = 50) {
        const clamped = Math.max(1, Math.min(500, Math.floor(limit) || 50));
        return this.transport.request(`/v1/audit?limit=${clamped}`, AuditLog);
    }

    getConfig() {
        return this.transport.request('/v1/config', ConfigDocument);
    }

    validateConfig(text: string): Promise<ConfigResult> {
        return this.transport.configRequest('/v1/config/validate', {
            method: 'POST',
            body: text,
            contentType: 'text/plain'
        });
    }

    applyConfig(text: string, options: ApplyConfigOptions = {}): Promise<ConfigResult> {
        const params = new URLSearchParams();
        if (options.force) {
            params.set('force', 'true');
        }
        if (options.fullApply) {
            params.set('fullApply', 'true');
        }

        const query = params.toString();
        const headers: Record<string, string> = {};

        if (options.revision) {
            headers['If-Match'] = `"${options.revision}"`;
        }

        return this.transport.configRequest(`/v1/config${query ? `?${query}` : ''}`, {
            method: 'PUT',
            body: text,
            contentType: 'text/plain',
            headers
        });
    }

    private post(path: string, body?: Record<string, unknown>) {
        return this.transport.request(path, MessageResponse, {
            method: 'POST',
            ...(body ? { body: JSON.stringify(body), contentType: 'application/json' } : {})
        });
    }

    private delete(path: string) {
        return this.transport.request(path, MessageResponse, { method: 'DELETE' });
    }
}
