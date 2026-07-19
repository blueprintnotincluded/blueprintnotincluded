// BlueprintsV2 clipboard/share-string transport (spec/blueprintsv2-import-spec.md §1.2):
// base64( 4-byte little-endian uncompressed-length ++ gzip(utf8(json)) ).
// Decoding uses the standard DecompressionStream API, available in every
// modern browser and in Node 18+ — no gzip dependency on either tier.

// Discriminator for the verbatim raw upload stored on a blueprint record
// (§8): 'bpv2-json' = the .blueprint file text, 'bpv2-sharestring' = the
// clipboard share-string text. Downloads serve the stored text unmodified.
export const RAW_SOURCE_FORMATS = ['bpv2-json', 'bpv2-sharestring'] as const;
export type RawSourceFormat = (typeof RAW_SOURCE_FORMATS)[number];

// Cheap shape check so import UIs can route pasted/uploaded text without
// attempting a full decode. Deliberately loose: decode remains the authority.
export function looksLikeBniShareString(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
}

// Decodes a share-string to the underlying blueprint JSON text. Throws on
// anything that is not a valid share-string (bad base64, bad gzip payload).
export async function decodeBniShareString(shareString: string): Promise<string> {
  const bytes = base64ToBytes(shareString.trim());
  // First 4 bytes are the informational uncompressed-length prefix; gzip is
  // self-terminating so the prefix is skipped, not trusted.
  if (bytes.length <= 4) throw new Error('Share string too short');
  const gzipped = bytes.subarray(4);

  const stream = new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decompressed = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  // atob exists in browsers and Node 16+; keeps this module runtime-agnostic.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Encodes blueprint JSON text back into a share-string — the inverse of
// decodeBniShareString, byte-compatible with the mod's ExportToClipboard.
export async function encodeBniShareString(json: string): Promise<string> {
  const utf8 = new TextEncoder().encode(json);

  const stream = new Blob([utf8]).stream().pipeThrough(new CompressionStream('gzip'));
  const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());

  const withHeader = new Uint8Array(4 + gzipped.length);
  new DataView(withHeader.buffer).setInt32(0, utf8.length, true);
  withHeader.set(gzipped, 4);

  let binary = '';
  for (let i = 0; i < withHeader.length; i++) binary += String.fromCharCode(withHeader[i]);
  return btoa(binary);
}
