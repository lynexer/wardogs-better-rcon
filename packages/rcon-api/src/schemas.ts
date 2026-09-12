import { z } from 'zod';

// SECTION: Shared Primitives // ----------------------------------------

const count = z.number().optional();
const nullableString = (fallback = '') =>
    z
        .string()
        .nullish()
        .transform((v) => v ?? fallback);

export const SteamId = z.string().regex(/^\d{17}$/, 'Expected a 17-digit SteamID64.');
export const FactionLabel = z.enum(['RED', 'BLU', 'GRN']);
export const AppliesWhen = z.enum(['applied', 'next-match', 'next-restart', 'pending']);

// !SECTION

// SECTION: Errors

export const ApiError = z.object({
    code: z.string(),
    message: z.string()
});

export const ApiErrorEnvelope = z.object({ error: z.union([z.string(), ApiError]) });

export function normalizeApiError(raw: unknown): { code: string; message: string } | null {
    const parsed = ApiErrorEnvelope.safeParse(raw);
    if (!parsed.success) return null;

    const error = parsed.data.error;

    return typeof error === 'string' ? { code: 'auth_error', message: error } : error;
}

export const MessageResponse = z.object({
    ok: z.boolean().optional(),
    pending: z.boolean().optional(),
    message: nullableString()
});

// !SECTION

// SECTION: Capabilities // ----------------------------------------

export const Capabilities = z.object({
    apiVersion: z.string().optional(),
    build: z.string().optional(),
    auth: z.object({ scheme: z.string().optional(), header: z.string().optional() }).optional(),
    limits: z
        .object({
            maxBodyBytes: z.number().optional(),
            maxRequestsPerMinutePerIp: z.number().optional()
        })
        .optional(),
    config: z
        .object({
            writable: z.boolean().optional(),
            document: z.string().optional()
        })
        .default({}),
    routes: z.array(z.string()).default([])
});

// !SECTION

// SECTION: Status // ----------------------------------------

export const FactionScore = z.object({
    name: z.string(),
    colorHex: z.string(),
    score: z.number()
});

export const ScoreTick = z.object({
    current: z.number(),
    min: z.number(),
    max: z.number()
});

export const PlayerCount = z.object({
    current: z.number(),
    max: z.number()
});

export const RotationPointers = z.object({
    nowIndex: z.number().nullable().default(null),
    nextIndex: z.number().nullable().default(null)
});

export const Status = z.object({
    serverName: z.string(),
    map: z.string(),
    experiences: z.array(z.string()).default([]),
    lighting: z.string(),
    alternator: nullableString(),
    scoreTick: ScoreTick,
    players: PlayerCount,
    factionScores: z.array(FactionScore).default([]),
    rotation: RotationPointers.default({ nowIndex: null, nextIndex: null }),
    scoreCap: z.number().optional(),
    matchSeconds: z.number().optional()
});

// !SECTION

// SECTION: Players // ----------------------------------------

export const Player = z.object({
    name: z.string(),
    steamId: z.string(),
    faction: z.string().nullable().default(null),
    kills: z.number().default(0),
    deaths: z.number().default(0),
    cash: z.number().default(0),
    pingMs: z.number().default(0)
});

export const PlayerList = z.object({
    players: z.array(Player).default([]),
    count
});

// !SECTION

// SECTION: Bans and Reserved Slots // ----------------------------------------

export const Ban = z.object({
    steamId: z.string(),
    bannedAtUtc: nullableString(),
    bannedBy: nullableString(),
    reason: nullableString()
});

export const BanList = z.object({
    bans: z.array(Ban).default([])
});

export const ReservedSlotList = z.object({
    reservedSlots: z.array(z.string()).default([]),
    count
});

// !SECTION

// SECTION: Catalogs // ----------------------------------------

const CatalogEntry = z.object({
    id: z.string(),
    displayName: nullableString()
});

export const MapCatalog = z.object({ maps: z.array(CatalogEntry).default([]), count });
export const LightingCatalog = z.object({ lightings: z.array(CatalogEntry).default([]), count });
export const ExperienceCatalog = z.object({
    experiences: z.array(CatalogEntry).default([]),
    count
});

export const AlternatorCatalog = z.object({
    map: z.string().optional(),
    alternators: z
        .array(
            z.object({
                index: z.number().optional(),
                tag: z.string(),
                displayName: nullableString()
            })
        )
        .default([]),
    count
});

export const MapExperienceIds = z.object({
    map: z.string().optional(),
    experiences: z.array(z.string()).default([]),
    count
});

// !SECTION

// SECTION: Rotation // ----------------------------------------

export const RotationEntry = z.object({
    index: z.number().optional(),
    map: z.string(),
    experiences: z.array(z.string()).default([]),
    lighting: nullableString(),
    zoneAlternator: nullableString('None'),
    denied: z.boolean().default(false),
    status: nullableString()
});

export const Rotation = z.object({
    enabled: z.boolean().default(false),
    mode: z.string().default('ordered'),
    entries: z.array(RotationEntry).default([]),
    count
});

// !SECTION

// SECTION: Sponsor and Audit // ----------------------------------------

export const Sponsor = z.object({
    imageUrl: nullableString()
});

export const AuditEntry = z.object({
    timestampUtc: z.string(),
    peer: nullableString(),
    sessionId: nullableString(),
    event: z.string(),
    detail: nullableString()
});

export const AuditLog = z.object({
    limit: z.number().optional(),
    entries: z.array(AuditEntry).default([]),
    count
});

// !SECTION

// SECTION: Config // ----------------------------------------

export const ConfigKeyOverride = z.object({
    key: z.string(),
    appliesWhen: AppliesWhen.optional(),
    description: nullableString()
});

export const ConfigSection = z.object({
    section: z.string(),
    appliesWhen: AppliesWhen.optional(),
    description: nullableString(),
    allowedKeys: z.array(z.string()).default([]),
    keyOverrides: z.array(ConfigKeyOverride).default([])
});

export const ConfigDocument = z.object({
    revision: nullableString(),
    writable: z.boolean().default(true),
    text: nullableString(),
    sections: z.array(ConfigSection).default([]),
    warnings: z.array(z.string()).default([])
});

export const ConfigOutcome = z.object({
    section: z.string(),
    state: AppliesWhen.optional(),
    detail: nullableString()
});

export const ConfigShadowed = z.object({
    section: z.string(),
    key: z.string(),
    declared: nullableString(),
    effective: nullableString(),
    branch: nullableString()
});

export const ConfigStripped = z.object({
    section: z.string(),
    key: z.string().optional(),
    reason: nullableString()
});

export const ConfigFieldError = z.object({
    section: z.string(),
    key: z.string(),
    message: z.string()
});

export const ConfigTimings = z.object({
    validate: z.number().optional(),
    write: z.number().optional(),
    layerSwap: z.number().optional(),
    appliers: z.number().optional(),
    shadowScan: z.number().optional(),
    total: z.number().optional()
});

export const ConfigResultBody = z.object({
    ok: z.boolean().optional(),
    revision: z.string().optional(),
    error: z.union([z.string(), ApiError]).optional(),
    outcomes: z.array(ConfigOutcome).default([]),
    shadowed: z.array(ConfigShadowed).default([]),
    stripped: z.array(ConfigStripped).default([]),
    errors: z.array(ConfigFieldError).default([]),
    changed: z.array(z.unknown()).default([]),
    conflict: z.array(z.unknown()).default([]),
    warnings: z.array(z.string()).default([]),
    timingsMs: ConfigTimings.nullable().default(null)
});

// !SECTION

// SECTION: Request Bodies // ----------------------------------------

export const MapSelectionBody = z.object({
    map: z.string(),
    experiences: z.array(z.string()).optional(),
    lighting: z.string().optional(),
    zoneAlternator: z.string().optional()
});

export const KickBody = z.object({ reason: z.string() });
export const WhisperBody = z.object({ message: z.string() });
export const BroadcastBody = z.object({ message: z.string() });
export const BanBody = z.object({ steamId: z.string(), reason: z.string().optional() });
export const ReserveBody = z.object({ steamId: z.string() });
export const ChangeFactionBody = z.object({ faction: z.string() });
export const LightingBody = z.object({ lighting: z.string() });
export const SponsorBody = z.object({ imageUrl: z.string() });
export const MoveEntryBody = z.object({ direction: z.enum(['up', 'down']) });

export const SettingsPatchBody = z
    .object({
        scoreTick: z.number().optional(),
        rotationEnabled: z.boolean().optional(),
        rotationMode: z.string().optional()
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No settings to apply.' });

// !SECTION

// SECTION: Inferred types   // ----------------------------------------

export type ApiErrorShape = z.infer<typeof ApiError>;
export type CapabilitiesShape = z.infer<typeof Capabilities>;
export type StatusShape = z.infer<typeof Status>;
export type FactionScoreShape = z.infer<typeof FactionScore>;
export type PlayerShape = z.infer<typeof Player>;
export type BanShape = z.infer<typeof Ban>;
export type RotationShape = z.infer<typeof Rotation>;
export type RotationEntryShape = z.infer<typeof RotationEntry>;
export type AuditEntryShape = z.infer<typeof AuditEntry>;
export type ConfigDocumentShape = z.infer<typeof ConfigDocument>;
export type ConfigResultBodyShape = z.infer<typeof ConfigResultBody>;
export type ConfigSectionShape = z.infer<typeof ConfigSection>;
export type ConfigShadowedShape = z.infer<typeof ConfigShadowed>;
export type MapSelectionBodyShape = z.infer<typeof MapSelectionBody>;
export type SettingsPatchBodyShape = z.infer<typeof SettingsPatchBody>;
export type AppliesWhenValue = z.infer<typeof AppliesWhen>;
export type FactionLabelValue = z.infer<typeof FactionLabel>;

// !SECTION
