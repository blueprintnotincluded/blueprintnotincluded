// Terrain annotations <-> the BlueprintsV2 `metadata` block.
//
// The mod (v6.2.0+) added a top-level `metadata` field that deserializes into a
// C# `Dictionary<string, string>`. Everything below follows from that one fact,
// and from reading the mod's reader:
//
//  1. It is FLAT and STRING-VALUED. The reader iterates the object's properties
//     and `continue`s past any value whose token type is not String — a nested
//     object, array, number, boolean or null is silently discarded, with no
//     error, and the key is simply gone after the next in-game save. So all our
//     structure lives inside ONE key, JSON-encoded into a string value.
//  2. Keys are arbitrary strings (children are enumerated directly, not via
//     JSONPath), so dots and slashes are safe.
//  3. The mod does not namespace its own keys and reserves the right to add
//     some, so ours is prefixed with an owned namespace.
//  4. The mod never reads, validates or size-limits the contents, and preserves
//     the block through disk I/O, in-game clone and the multiplayer packets.
//
// Because the dictionary is shared with the mod and with any other tool, we
// treat it as someone else's object: read it whole, mutate only our key, write
// it back. Never replace it wholesale.

// Our namespace. Everything the website writes into `metadata` goes under a
// key starting with this, so a future mod key can never collide with ours.
export const BNI_METADATA_NAMESPACE = 'bni';

export const TERRAIN_METADATA_KEY = BNI_METADATA_NAMESPACE + '/terrain';

// Payload schema version. Bump only for a breaking change — in particular, the
// coordinate convention below is part of the contract. Readers ignore a payload
// whose version they don't understand rather than guessing at its meaning.
export const TERRAIN_SCHEMA_VERSION = 1;

// One placed terrain feature.
//
// COORDINATES: `x`/`y` are integer cell coordinates in the same space as
// `digcommands` and `worldNotes` — relative to the blueprint origin, after
// normalization — and address the BOTTOM-LEFT cell of the feature's footprint.
// Bottom-left is the convention that matches how ONI building offsets work, so
// a terrain annotation lines up with a building placed at the same offset.
// Changing this requires bumping TERRAIN_SCHEMA_VERSION.
export interface BniTerrainFeature {
  // ONI prefab id, e.g. 'GeyserGeneric_chlorine_gas'.
  id: string;
  x: number;
  y: number;
  // Fields a newer client may have written. We don't understand them, but we
  // round-trip them so an older client re-saving a blueprint doesn't silently
  // destroy a newer client's data. Deliberately not part of the v1 contract:
  // v1 stores position and type only. Free text belongs in a world note, which
  // is already first-class blueprint content.
  [unknownKey: string]: unknown;
}

interface TerrainPayload {
  v: number;
  features: BniTerrainFeature[];
}

// The keys v1 owns. Anything else inside a feature object is passed through
// untouched by both the decoder and the encoder.
const KNOWN_FEATURE_KEYS = ['id', 'x', 'y'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ONI cells are integers. A non-integer coordinate means the payload was
// hand-edited or written by something that doesn't share our model; round it
// rather than rendering a feature at a fractional cell.
function toCell(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

// Parse one feature object. Returns null for anything that isn't a usable
// annotation — a feature with no id or no position can't be rendered or placed,
// and silently dropping it is better than rendering garbage at the origin.
function decodeFeature(raw: unknown): BniTerrainFeature | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw['id'] !== 'string' || raw['id'] === '') return null;

  const x = toCell(raw['x']);
  const y = toCell(raw['y']);
  if (x === null || y === null) return null;

  const feature: BniTerrainFeature = { id: raw['id'], x, y };
  for (const [key, value] of Object.entries(raw))
    if (KNOWN_FEATURE_KEYS.indexOf(key) === -1) feature[key] = value;

  return feature;
}

// Read our terrain annotations out of a BlueprintsV2 `metadata` dictionary.
//
// Never throws and never blocks loading a blueprint: an absent key, a value
// that isn't a string, malformed JSON, a schema version we don't understand, or
// a payload of the wrong shape all decode to zero features. The one case worth
// a human's attention — our key is present but unusable — is logged.
export function decodeTerrainFeatures(
  metadata: Record<string, string> | null | undefined
): BniTerrainFeature[] {
  const encoded = metadata?.[TERRAIN_METADATA_KEY];
  if (typeof encoded !== 'string' || encoded === '') return [];

  let payload: unknown;
  try {
    payload = JSON.parse(encoded);
  } catch (error) {
    console.log(`Ignoring unparseable ${TERRAIN_METADATA_KEY} metadata:`, error);
    return [];
  }

  if (!isPlainObject(payload)) {
    console.log(`Ignoring ${TERRAIN_METADATA_KEY} metadata: expected an object`);
    return [];
  }

  // A missing or newer version means we can't know what the fields mean.
  // Ignore the payload rather than guessing — but leave it on disk, since the
  // encoder only rewrites our key when the editor actually has features.
  const version = payload['v'];
  if (typeof version !== 'number' || version > TERRAIN_SCHEMA_VERSION) {
    console.log(`Ignoring ${TERRAIN_METADATA_KEY} metadata: unsupported version ${version}`);
    return [];
  }

  const features = payload['features'];
  if (!Array.isArray(features)) {
    console.log(`Ignoring ${TERRAIN_METADATA_KEY} metadata: features is not an array`);
    return [];
  }

  return features
    .map(decodeFeature)
    .filter((feature): feature is BniTerrainFeature => feature !== null);
}

// Serialize one feature, v1 keys first so the JSON reads well, then any
// unknown keys we're carrying for a newer client.
function encodeFeature(feature: BniTerrainFeature): Record<string, unknown> {
  const encoded: Record<string, unknown> = {
    id: feature.id,
    x: Math.round(feature.x),
    y: Math.round(feature.y),
  };
  for (const [key, value] of Object.entries(feature))
    if (KNOWN_FEATURE_KEYS.indexOf(key) === -1) encoded[key] = value;
  return encoded;
}

// Write terrain annotations into a BlueprintsV2 `metadata` dictionary,
// preserving every key we don't own.
//
// Returns a new dictionary, or undefined when the result would be empty — the
// mod only writes the block when it is non-empty, and we don't want a
// `{"v":1,"features":[]}` husk sitting in every file that has no annotations.
// An empty feature list therefore *deletes* our key rather than emptying it.
export function encodeTerrainFeatures(
  metadata: Record<string, string> | null | undefined,
  features: BniTerrainFeature[]
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  // Copy the foreign keys through verbatim. Non-string values are skipped
  // because the mod would drop them anyway (see note 1 above) — carrying them
  // would only misrepresent what survives the next in-game save.
  for (const [key, value] of Object.entries(metadata ?? {}))
    if (key !== TERRAIN_METADATA_KEY && typeof value === 'string') result[key] = value;

  if (features.length > 0) {
    const payload: TerrainPayload = {
      v: TERRAIN_SCHEMA_VERSION,
      features: features.map(encodeFeature) as BniTerrainFeature[],
    };
    result[TERRAIN_METADATA_KEY] = JSON.stringify(payload);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
