// All avatar prompt templates in one place. Template ids are persisted on the
// Avatar document (promptTemplate) so a stored asset can always be traced back
// to the exact wording generation used.
//
// Style goal: "inspired by" Oxygen Not Included duplicants, not a copy — an
// original character in the same spirit (cute cartoon space-colony worker),
// which both fits the site and keeps us clear of reproducing Klei's art.

export const AVATAR_TEMPLATE_RANDOM = 'random-duplicant-v1';
export const AVATAR_TEMPLATE_FACE = 'face-duplicant-v1';
export const AVATAR_TEMPLATE_SEED_BATCH = 'seed-batch-duplicant-v1';

// Shared style clause used by every template
const STYLE_BASE =
  'A single square profile avatar of an original cute cartoon space-colony worker character, ' +
  'strongly inspired by the general art style of the game Oxygen Not Included (chunky rounded ' +
  'proportions, oversized head, small body, thick clean outlines, flat cel shading, warm muted ' +
  'palette) but NOT a copy of any existing character. Head-and-shoulders portrait framing, ' +
  'facing slightly off-center, simple readable silhouette, plain single-color background, ' +
  'family-friendly, game-ready. No text, no watermark, no border.';

// Variation axes for random generation — picked per call so a batch of random
// avatars comes out visibly distinct instead of ten near-identical characters.
const HAIR = [
  'a tall gravity-defying pompadour',
  'a messy bun',
  'short spiky hair',
  'a bald head with thick eyebrows',
  'long braided hair',
  'a curly afro',
  'a slicked side parting',
  'twin pigtails',
  'a mohawk',
  'shaggy medium-length hair',
];

const EXPRESSION = [
  'a cheerful grin',
  'a determined frown',
  'a sleepy half-lidded look',
  'a surprised wide-eyed expression',
  'a smug confident smirk',
  'a gentle content smile',
  'a mischievous grin',
];

const ACCESSORY = [
  'welding goggles pushed up on the forehead',
  'a hard hat',
  'a headlamp',
  'round glasses',
  'a small earpiece communicator',
  'a bandana around the neck',
  'a snorkel mask resting on the head',
  'no accessory',
];

const OUTFIT = [
  'an orange industrial jumpsuit',
  'a teal lab coverall',
  'a khaki engineer uniform with suspenders',
  'a purple technician suit',
  'a green agricultural overall',
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// rng injectable for deterministic tests
export function randomAvatarPrompt(rng: () => number = Math.random): string {
  return (
    `${STYLE_BASE} The character has ${pick(HAIR, rng)}, ${pick(EXPRESSION, rng)}, ` +
    `${pick(ACCESSORY, rng)}, and wears ${pick(OUTFIT, rng)}.`
  );
}

// Sent together with the user's uploaded photo as a reference image
export function faceAvatarPrompt(): string {
  return (
    `${STYLE_BASE} Use the attached photo only as loose inspiration for the character's ` +
    'recognizable features — approximate hair style and color, skin tone, glasses or facial ' +
    'hair if present, and overall vibe — while fully redrawing them as an original cartoon ' +
    'character in the style described. Do not reproduce the photo itself, its background, ' +
    'or any other people in it.'
  );
}

// Future batch mode: caller attaches a reference sheet image of many example
// avatars; index diversifies the batch the same way randomAvatarPrompt does.
export function seedBatchPrompt(rng: () => number = Math.random): string {
  return (
    `${STYLE_BASE} Match the visual style, proportions and palette of the attached reference ` +
    'sheet of example avatars, but invent a brand-new character not present on the sheet. ' +
    `The character has ${pick(HAIR, rng)}, ${pick(EXPRESSION, rng)}, ${pick(ACCESSORY, rng)}, ` +
    `and wears ${pick(OUTFIT, rng)}.`
  );
}

// Face classification prompt for the cheap multimodal pre-check
export const FACE_CLASSIFY_PROMPT =
  'Does this image clearly contain a human face (photo, selfie, portrait, or drawing of a ' +
  'person where the face is a prominent subject)? Answer with exactly one word: FACE or NOT_FACE.';
