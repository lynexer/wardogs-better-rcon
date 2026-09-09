/**
 * @lynexer/wardogs-api
 *
 * Typed client and runtime-validated schemas for the Wardogs RCON v1 HTTP API.
 *
 * This contract was reverse-engineered from the official demo web console and
 * is not published or versioned by BULKHEAD or Team17. Responses are validated at the
 * boundary so a server-side change surfaces as a schema error rather instead of
 * a crash.
 *
 * Quick start:
 *
 *   const client = new WardogsRconClient({
 *     baseUrl: "/api/203.0.113.10/7777",
 *     password: rconPassword,
 *   });
 *
 *   const status = await client.getStatus();
 *   const features = await client.probeCapabilities();
 */

export {
    type ApplyConfigOptions,
    type Features,
    type MapSelection,
    mapSelection,
    type SettingsPatch,
    WardogsRconClient
} from './client.js';

export {
    type ConfigResult,
    type FetchLike,
    RconError,
    RconSchemaError,
    Transport,
    type TransportOptions
} from './http.js';

export type {
    AppliesWhenValue,
    AuditEntryShape,
    BanShape,
    CapabilitiesShape,
    ConfigDocumentShape,
    ConfigResultBodyShape,
    ConfigSectionShape,
    ConfigShadowedShape,
    FactionLabelValue,
    FactionScoreShape,
    MapSelectionBodyShape,
    PlayerShape,
    RotationEntryShape,
    RotationShape,
    SettingsPatchBodyShape,
    StatusShape
} from './schemas.js';

export * as schemas from './schemas.js';
