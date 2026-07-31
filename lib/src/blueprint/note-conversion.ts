import { BniWorldNote } from '../io/bni/bni-blueprint';
import { MdbBuilding } from '../io/mdb/mdb-building';

// The website's own annotation type, retired in favour of the mod's world
// notes.
//
// `Info` was a pseudo-building: a blueprint item with an id the game has never
// heard of, carrying a title, a body and a coloured badge. It rendered on the
// canvas and in every server-side image, but it could not be written to a
// .blueprint file at all — there is nowhere in the BlueprintsV2 format for a
// building the game cannot build. So a blueprint annotated on the website lost
// its annotations the moment it was downloaded.
//
// The mod's world notes say the same thing in a format the game round-trips,
// so they are now the only annotation model. `Info` survives here as an
// *input* format: stored items are converted on read (Blueprint.importFromMdb)
// and never written again.

export enum InfoIcon {
  icon_inf,
  icon_int,
  icon_exc,
  icon_no1,
  icon_no2,
  icon_no3,
  icon_no4,
  icon_no5,
  icon_no6,
  icon_no7,
  icon_no8,
  icon_no9,
}

// Text note. The mod's `BlueprintNoteData.NoteType`; 1 is an element note,
// which `Info` has no equivalent of.
const TEXT_NOTE = 0;

// InfoIcon -> the mod's `BlueprintNoteData.Symbol` (a sprite name in its
// `textnote_icons` folder). Lossless in both meaning and count: the website's
// three glyphs each have a counterpart, and its nine digits map onto the mod's
// ten. `note_num_0` has no `Info` source, which is why this is one-way.
const INFO_ICON_SYMBOLS: Record<InfoIcon, string> = {
  [InfoIcon.icon_inf]: 'note_info',
  [InfoIcon.icon_int]: 'note_question',
  [InfoIcon.icon_exc]: 'note_warn',
  [InfoIcon.icon_no1]: 'note_num_1',
  [InfoIcon.icon_no2]: 'note_num_2',
  [InfoIcon.icon_no3]: 'note_num_3',
  [InfoIcon.icon_no4]: 'note_num_4',
  [InfoIcon.icon_no5]: 'note_num_5',
  [InfoIcon.icon_no6]: 'note_num_6',
  [InfoIcon.icon_no7]: 'note_num_7',
  [InfoIcon.icon_no8]: 'note_num_8',
  [InfoIcon.icon_no9]: 'note_num_9',
};

// What a stored `Info` item with no explicit colour/icon rendered as. Both are
// written out explicitly rather than left to the world note's own defaults,
// which differ — a converted note has to keep looking like the badge the
// author placed, not like a fresh one.
export const INFO_DEFAULT_BACK_COLOR = 0x007ad9;
const INFO_DEFAULT_ICON = InfoIcon.icon_inf;

// 0xRRGGBB -> the mod's "RRGGBBAA" (Color.ToHexString), always fully opaque.
function backColorToTintHex(backColor: number): string {
  const rgb = (backColor >>> 0) & 0xffffff;
  return rgb.toString(16).padStart(6, '0') + 'ff';
}

// Convert one stored `Info` blueprint item into the world note that replaces
// it. Everything the mod can express is carried across; `frontColor` (the
// glyph colour inside the badge) is dropped, because a world note marker is a
// single-colour sprite with nothing for a second colour to paint.
export function infoBuildingToWorldNote(building: MdbBuilding): BniWorldNote {
  const icon = building.icon ?? INFO_DEFAULT_ICON;
  const note: BniWorldNote = {
    x: building.position?.x ?? 0,
    y: building.position?.y ?? 0,
    type: TEXT_NOTE,
    tinthex: backColorToTintHex(building.backColor ?? INFO_DEFAULT_BACK_COLOR),
    symbol: INFO_ICON_SYMBOLS[icon] ?? INFO_ICON_SYMBOLS[INFO_DEFAULT_ICON],
  };

  // Absent rather than empty, matching how the mod writes an untitled note.
  if (building.title) note.title = building.title;
  if (building.infoString) note.text = building.infoString;

  return note;
}
