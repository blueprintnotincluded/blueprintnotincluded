import { Vector2 } from '../../vector2';
import { Orientation } from '../../enums/orientation';

// One per-component settings entry from BlueprintsV2 (§3). Value shapes are
// component-specific and version-fragile — treated as opaque passthrough.
export interface BniBuildingData {
  Key: string;
  Value: any;
}

export class BniBuilding {
  offset: Vector2 = new Vector2();
  buildingdef: string = '';
  orientation: Orientation = Orientation.Neutral;
  flags: number = 0;
  // Construction materials as Klei tag hashes, recipe-ingredient order —
  // each resolves to BuildableElement.tag (§2.3).
  selected_elements: number[] = [];
  buildingData?: BniBuildingData[];
  // The mod's per-building "temporarily disabled" switch: the building stays in
  // the file but is skipped when the blueprint is placed, and left out of the
  // mod's building counts. Written only when set — the mod omits the key for an
  // enabled building, and so do we.
  tempDisabled?: boolean;
}
