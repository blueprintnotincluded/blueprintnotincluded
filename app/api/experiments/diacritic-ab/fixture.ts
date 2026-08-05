import fs from 'fs';
import path from 'path';
import { CAPS, FIXTURE_PATH } from './constants';
import { CaseCategory, DiacriticCase } from './types';

const CATEGORIES = new Set<CaseCategory>(['live', 'synthetic', 'ambiguous', 'control']);

export function stripVietnameseDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

export function validateFixture(value: unknown): DiacriticCase[] {
  if (!Array.isArray(value) || value.length !== CAPS.fixtureCases) {
    throw new Error(`Fixture must contain exactly ${CAPS.fixtureCases} cases`);
  }
  const cases = value as DiacriticCase[];
  const ids = new Set<string>();
  for (const item of cases) {
    if (
      item == null ||
      typeof item.id !== 'string' ||
      typeof item.asciiInput !== 'string' ||
      !CATEGORIES.has(item.category)
    ) {
      throw new Error('Fixture contains a malformed case');
    }
    if (ids.has(item.id)) throw new Error(`Duplicate fixture id: ${item.id}`);
    ids.add(item.id);
    if (!/^[\x00-\x7f]*$/.test(item.asciiInput)) {
      throw new Error(`Fixture input is not ASCII: ${item.id}`);
    }
    if (item.category === 'synthetic') {
      if (item.canonicalVietnamese == null) {
        throw new Error(`Synthetic case lacks canonicalVietnamese: ${item.id}`);
      }
      if (stripVietnameseDiacritics(item.canonicalVietnamese) !== item.asciiInput) {
        throw new Error(`Synthetic case was not mechanically stripped: ${item.id}`);
      }
    }
  }
  const characters = cases.reduce((sum, item) => sum + item.asciiInput.length, 0);
  if (characters > CAPS.sourceCharacters) {
    throw new Error(`Fixture has ${characters} source characters; cap is ${CAPS.sourceCharacters}`);
  }
  return cases;
}

export function loadFixture(rootDir = process.cwd()): DiacriticCase[] {
  const raw = fs.readFileSync(path.resolve(rootDir, FIXTURE_PATH), 'utf8');
  return validateFixture(JSON.parse(raw) as unknown);
}
