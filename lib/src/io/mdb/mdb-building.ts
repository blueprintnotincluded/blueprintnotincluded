import { Vector2 } from '../../vector2';
import { UiSaveSettings } from '../../b-export/b-ui-screen';
import { InfoIcon } from '../../blueprint/note-conversion';
import { BniBuildingData } from '../bni/bni-building';

export interface MdbBuilding {
  id: string;
  temperature?: number;
  position?: Vector2;
  elements?: string[];
  settings?: UiSaveSettings[];

  // BlueprintsV2 per-component settings (§3 of the import spec). Opaque
  // passthrough — Value shapes are component-specific and version-fragile.
  // Omitted when empty so the fingerprint of every pre-existing stored
  // blueprint stays byte-identical (same reasoning as worldNotes).
  buildingData?: BniBuildingData[];

  // Utilities
  connections?: number;
  pipeElement?: string;

  orientation?: number;
  mass?: number;

  // Legacy website `Info` annotations (converted to world notes on read;
  // never written by toMdbBuilding any more). See note-conversion.ts.
  infoString?: string;
  title?: string;
  backColor?: number;
  frontColor?: number;
  icon?: InfoIcon;
}
