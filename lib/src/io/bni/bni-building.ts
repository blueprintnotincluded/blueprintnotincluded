import { Vector2 } from '../../vector2';
import { Orientation } from '../../enums/orientation';

export class BniBuilding {
  offset: Vector2 = new Vector2();
  buildingdef: string = '';
  orientation: Orientation = Orientation.Neutral;
  flags: number = 0;
  selected_elements: number[] = [];
}
