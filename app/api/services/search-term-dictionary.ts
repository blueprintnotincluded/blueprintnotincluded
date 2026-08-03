import fs from 'fs';
import path from 'path';
import {
  OniItem,
  ROOM_TYPE_IDS,
  TermDictionary,
  normalizeText,
  stripKleiMarkup,
} from '../../../lib/index';

// The English term dictionary (spec/multilingual-search-plan.md §2.2):
// building display names from the loaded game database, room type names, and
// the hand-maintained community-jargon alias file. Built lazily from
// OniItem.oniItems (OniItem.load runs at app startup), so it needs no
// generated asset of its own; other languages later come from ONI's own .po
// files as data files with this same shape.

// __dirname-relative (same convention as derive-rooms' database path) so the
// file resolves in both a dev checkout and the deploy image regardless of cwd.
const ALIAS_FILE = path.resolve(__dirname, '../../../assets/search-aliases.json');

export interface SearchTermDictionary extends TermDictionary {
  // id → English display name, for building a search row's terms[].
  byId: Record<string, string>;
}

// The room ids are camelCase codes ('privateBedroom'); their display names
// are just the humanized form, which is what the game calls them too.
export function roomDisplayName(roomId: string): string {
  const spaced = roomId.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Editor-annotation pseudo-ids that never name a searchable thing.
const NON_SEARCH_IDS = new Set([OniItem.elementId, OniItem.infoId]);

let dictionary: SearchTermDictionary | null = null;

function addTerm(byTerm: Record<string, string[]>, term: string, id: string) {
  const key = normalizeText(term);
  if (key.length === 0) return;
  const ids = (byTerm[key] ??= []);
  if (!ids.includes(id)) ids.push(id);
}

function build(): SearchTermDictionary {
  const byId: Record<string, string> = {};
  const byTerm: Record<string, string[]> = {};

  for (const item of OniItem.oniItems) {
    if (NON_SEARCH_IDS.has(item.id)) continue;
    const displayName = stripKleiMarkup(item.name ?? '').trim();
    byId[item.id] = displayName.length > 0 ? displayName : item.id;
    addTerm(byTerm, byId[item.id], item.id);
    // The raw prefab id is a legitimate way to search ("WaterPurifier").
    addTerm(byTerm, item.id, item.id);
  }

  for (const roomId of ROOM_TYPE_IDS) {
    byId[roomId] = roomDisplayName(roomId);
    addTerm(byTerm, byId[roomId], roomId);
  }

  // Aliases last, additively: an alias may share a key with a real display
  // name ("washroom" the room vs the jargon), in which case both id sets
  // apply. A missing or malformed file costs the aliases, never the search.
  try {
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
    const aliases: Record<string, string[]> = raw.aliases ?? {};
    for (const [term, ids] of Object.entries(aliases)) {
      for (const id of ids) addTerm(byTerm, term, id);
    }
  } catch (err) {
    console.log(`search-aliases load failed (${ALIAS_FILE}) — continuing without aliases`);
    console.log(err);
  }

  return { byId, byTerm };
}

export function getSearchTermDictionary(): SearchTermDictionary {
  if (dictionary == null) dictionary = build();
  return dictionary;
}

// Tests load different game databases; the cache must not outlive them.
export function resetSearchTermDictionaryForTest() {
  dictionary = null;
}
