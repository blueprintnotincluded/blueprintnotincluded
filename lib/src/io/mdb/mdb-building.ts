import { Vector2 } from '../../vector2';
import { UiSaveSettings } from '../../b-export/b-ui-screen';
import { InfoIcon } from '../../blueprint/blueprint-item-info';
import { BuildableElement } from '../../b-export/b-element';

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

  // Info Icons
  infoString?: string;
  title?: string;
  backColor?: number;
  frontColor?: number;
  icon?: InfoIcon;
}
