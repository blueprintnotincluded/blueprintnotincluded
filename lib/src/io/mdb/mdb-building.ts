import { Vector2 } from '../../vector2';
import { UiSaveSettings } from '../../b-export/b-ui-screen';
import { InfoIcon } from '../../blueprint/note-conversion';

export interface MdbBuilding {
  id: string;
  temperature?: number;
  position?: Vector2;
  elements?: string[];
  settings?: UiSaveSettings[];

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
