// All avatar prompt templates in one place. Template ids are persisted on the
// Avatar/AvatarBatch documents so a stored asset can always be traced back to
// the exact wording generation used.
//
// v3: every generation attaches two committed reference sheets — the duplicant
// portrait sheet (assets/avatar-reference/duplicant-style-sheet.jpg) and the
// in-game hats sheet (assets/avatar-reference/duplicant-hats-sheet.jpg) — and
// asks for a 2x2 grid of four avatars in one 512px image; the service slices
// it into four 256px assets, quartering the per-avatar cost. Exactly one
// character per grid is bare-headed; the other three wear hats sourced from
// (or riffing on) the hats sheet. The point of the feature is that results
// look like Klei's Oxygen Not Included duplicant portraits specifically, so
// the style language leans hard on the sheets.

export const AVATAR_TEMPLATE_GRID = 'duplicant-grid-v3';
export const AVATAR_TEMPLATE_FACE_GRID = 'face-duplicant-grid-v3';

// The style sheet is always the first attached image
const SHEET_CLAUSE =
  'The first attached image is a reference sheet of avatar portraits from the game Oxygen Not ' +
  'Included. Match its art style EXACTLY: bean-shaped oversized heads on tiny bodies, thick ' +
  'clean dark outlines, flat cel shading, simple oval eyes, expressive cartoon mouths, chunky ' +
  'striped knit jumpsuits, and the same muted blue-grey interior background. The result must ' +
  'look like it was drawn by the same artist who drew the reference sheet.';

// The hats sheet is always the second attached image
const HATS_CLAUSE =
  'The second attached image is a reference sheet of hats from the same game. Every hat worn ' +
  'by a character must either be copied faithfully from this sheet or be clearly inspired by ' +
  'one of them, redrawn in the exact same style and sitting naturally on top of the hair. ' +
  'Exactly ONE of the four characters wears no hat at all; the other three each wear a ' +
  'different hat.';

const GRID_CLAUSE =
  'Produce ONE square image divided into an exact 2x2 grid of four independent square avatar ' +
  'portraits, each filling exactly one quarter of the image edge to edge. No borders, gutters, ' +
  'dividing lines, or margins between or around the quarters. Each portrait is a ' +
  'head-and-shoulders framing of a single character, family-friendly, no text, no watermark.';

// Variation axes injected per call so grids and batches come out visibly
// distinct instead of four near-identical characters.
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
  'a wild cloud of curls',
  'a neat bowl cut',
];

const EXPRESSION = [
  'a cheerful grin',
  'a determined frown',
  'a sleepy half-lidded look',
  'a surprised wide-eyed expression',
  'a smug confident smirk',
  'a gentle content smile',
  'a mischievous grin',
  'a proud thumbs-up pose',
];

// Hat briefs describe hats that actually appear on the hats sheet, so the
// model can locate the matching drawing; the last two entries invite an
// original design in the same visual language.
const HAT = [
  "the miner's helmet with a glowing headlamp from the hats sheet",
  'the hard hat with a pencil tucked into the band from the hats sheet',
  'the woven straw sun hat from the hats sheet',
  'the ranger hat with a band of teeth from the hats sheet',
  "the tall white cook's hat from the hats sheet",
  'the plaid beret with a paintbrush tucked in it from the hats sheet',
  'the strut-frame trainee hat strung with small lights from the hats sheet',
  'the chunky visor headset from the hats sheet',
  'the space helmet with a glowing visor from the hats sheet',
  'the newsboy cap from the hats sheet',
  'the hard hat with a lightning-bolt decal from the hats sheet',
  'the cap with a gear emblem from the hats sheet',
  "the medic's cap with a bandaid emblem from the hats sheet",
  "the conductor's cap with a water-drop emblem from the hats sheet",
  'a hat of your own invention that is NOT on the hats sheet but looks at home beside them',
  'a playful brand-new hat design in the same style as the hats sheet',
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Four distinct character briefs, one per grid cell; one randomly chosen cell
// is bare-headed, the rest wear hats. rng injectable for deterministic tests.
export function gridAvatarPrompt(rng: () => number = Math.random): string {
  const hatless = Math.floor(rng() * 4);
  const briefs = [0, 1, 2, 3]
    .map(i => {
      const headwear = i === hatless ? 'no hat' : `wearing ${pick(HAT, rng)}`;
      return `Character ${i + 1}: ${pick(HAIR, rng)}, ${pick(EXPRESSION, rng)}, ${headwear}.`;
    })
    .join(' ');
  return (
    `${SHEET_CLAUSE} ${HATS_CLAUSE} ${GRID_CLAUSE} The four characters must be clearly ` +
    `different from each other and from every character on the reference sheet — vary skin ` +
    `tone, hair color, hair style and jumpsuit color across the four. ${briefs}`
  );
}

// Sent with three attachments: [style sheet, hats sheet, user photo]
export function faceGridAvatarPrompt(): string {
  return (
    `${SHEET_CLAUSE} ${HATS_CLAUSE} The third attached image is a photo of a person. ` +
    `${GRID_CLAUSE} All four portraits are of the SAME new character: a cartoon version of ` +
    'the person in the photo, carrying over their recognizable features — approximate hair ' +
    'style and color, skin tone, glasses or facial hair if present, and overall vibe — fully ' +
    'redrawn in the reference-sheet style. Give each of the four portraits a different ' +
    'expression and pose, and give the three hatted portraits three different hats, so the ' +
    'person can pick their favorite. Do not reproduce the photo itself, its background, or ' +
    'any other people in it.'
  );
}

// Face classification prompt for the cheap multimodal pre-check
export const FACE_CLASSIFY_PROMPT =
  'Does this image clearly contain a human face (photo, selfie, portrait, or drawing of a ' +
  'person where the face is a prominent subject)? Answer with exactly one word: FACE or NOT_FACE.';
