import { Injectable } from "@angular/core";
import {
  BniTerrainFeature,
  CameraService,
  DrawHelpers,
  TerrainFeature,
  Vector2,
} from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import {
  TerrainAnnotationService,
  findTerrainFeatureAt,
} from "../../services/terrain-annotation.service";
import { DrawPixi } from "../../drawing/draw-pixi";
import { terrainIconUrl } from "../../drawing/draw-terrain-overlay";
import { ITool, ToolType } from "./tool";
import {
  ShortcutAction,
  ShortcutActionId,
} from "../../keybindings/shortcut-actions";
import { ToolService } from "../../services/tool-service";

const PREVIEW_ALPHA = 0.5;

// The feature a fresh session starts on, so the tool is placeable the moment
// it is picked instead of opening on an empty palette. A Cool Steam Vent is
// both the most common thing people build around and a mid-sized footprint,
// which makes the placement cue read clearly.
const DEFAULT_FEATURE_ID = "GeyserGeneric_steam";

// Terrain Annotation Tool. Places geysers, vents and volcanoes on click.
// Modelled on NotesTool and PlanningTool: single-click mutation, exclusive
// within toolGroup 1, right-click/Escape return to Select.
//
// These are annotations, not construction — placing one never touches
// blueprintItems, so nothing here feeds material cost or build order.
@Injectable({ providedIn: "root" })
export class TerrainTool implements ITool {
  parent!: ToolService;

  // The feature the next click will place. Kept as a bare prefab id rather than
  // a pending BniTerrainFeature: unlike a world note there is nothing else to
  // pre-fill, since v1 annotations are position and type only.
  private _featureId: string = DEFAULT_FEATURE_ID;
  get featureId(): string {
    return this._featureId;
  }
  set featureId(value: string) {
    this._featureId = value;
  }

  get feature(): TerrainFeature | undefined {
    return TerrainFeature.getFeature(this._featureId);
  }

  private hoverTile: Vector2 | null = null;
  private preview: PIXI.Sprite | null = null;

  constructor(
    private blueprintService: BlueprintService,
    private terrainService: TerrainAnnotationService,
  ) {}

  switchFrom() {
    this.hoverTile = null;
    if (this.preview != null) this.preview.visible = false;
  }
  switchTo() {
    // Placing into a hidden layer would look like nothing happened.
    this.terrainService.visible = true;
    if (TerrainFeature.getFeature(this._featureId) == null) {
      const first = TerrainFeature.features[0];
      if (first != null) this._featureId = first.id;
    }
  }
  mouseOut() {
    this.hoverTile = null;
  }

  mouseDown(tile: Vector2) {
    const position = DrawHelpers.getIntegerTile(tile);
    const existing = findTerrainFeatureAt(
      this.blueprintService.blueprint.terrainFeatures,
      position,
    );
    // Clicking an existing annotation selects it rather than stacking a second
    // one on top — the same rule NotesTool uses for an occupied cell.
    if (existing != null) {
      this.terrainService.select(existing);
      return;
    }
    const feature: BniTerrainFeature = {
      id: this._featureId,
      x: position.x,
      y: position.y,
    };
    this.terrainService.add(feature);
  }

  leftClick(_tile: Vector2) {}
  rightClick(_tile: Vector2) {
    this.parent.changeTool(ToolType.select);
  }
  hover(tile: Vector2) {
    this.hoverTile = DrawHelpers.getIntegerTile(tile);
  }
  drag(_tileStart: Vector2, _tileStop: Vector2) {}
  dragStop() {}

  handleShortcut(action: ShortcutActionId): boolean {
    if (action == ShortcutAction.interfaceCancel) {
      this.parent.changeTool(ToolType.select);
      return true;
    }
    return false;
  }

  // A translucent footprint-sized icon under the cursor is the whole placement
  // cue: it shows both what will be placed and how much room it takes, which
  // matters here because footprints vary from 2x2 to 4x4.
  private updatePreview(drawPixi: DrawPixi, camera: CameraService) {
    let preview = this.preview;
    const url = terrainIconUrl({ id: this._featureId, x: 0, y: 0 });

    if (preview == null) {
      preview = drawPixi.getSpriteFrom(url) as PIXI.Sprite;
      preview.anchor.set(0.5, 0.5);
      drawPixi.pixiApp.stage.addChild(preview);
      this.preview = preview;
    }
    preview.visible = this.hoverTile != null;
    if (!preview.visible) return;

    preview.texture = drawPixi.getNewBaseTexture(url);
    preview.alpha = PREVIEW_ALPHA;

    const known = this.feature;
    const width = known != null ? known.width : 1;
    const height = known != null ? known.height : 1;

    const zoom = camera.currentZoom;
    const offset = camera.cameraOffset;
    preview.width = width * zoom;
    preview.height = height * zoom;
    // Anchor is the bottom-left cell; centre the sprite over the footprint.
    preview.x = (this.hoverTile!.x + offset.x + width / 2) * zoom;
    preview.y = (offset.y - this.hoverTile!.y - height / 2 + 1) * zoom;
  }

  draw(drawPixi: DrawPixi, camera: CameraService) {
    this.updatePreview(drawPixi, camera);
  }

  toggleable = false;
  visible = false;
  captureInput = true;
  toolType = ToolType.terrain;
  toolGroup = 1;
}
