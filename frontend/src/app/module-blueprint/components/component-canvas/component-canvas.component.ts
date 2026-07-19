// Angular imports
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
  Input,
} from "@angular/core";

// Engine imports
import {
  Blueprint,
  CameraService,
  IObsCameraChanged,
  SpriteInfo,
  DrawHelpers,
  ImageSource,
  OniItem,
  SpriteModifier,
  Overlay,
  Display,
  BExport,
  BSpriteInfo,
  BSpriteModifier,
  Vector2,
  SpriteTag,
  BniWorldNote,
} from "../../../../../../lib/index";

import { DrawPixi } from "../../drawing/draw-pixi";
import { DrawMiniUi } from "../../drawing/draw-mini-ui";
import { DrawRoomOverlay } from "../../drawing/draw-room-overlay";
import { DrawNotesOverlay } from "../../drawing/draw-notes-overlay";
import { RoomDetectionService } from "../../services/room-detection-service";
import { WorldNoteService } from "../../services/world-note.service";
import { GoogleAnalyticsService } from "ngx-google-analytics";
import JSZip from "jszip";
import {
  BlueprintService,
  ExportImageOptions,
} from "../../services/blueprint-service";
import { ToolService, IObsToolChanged } from "../../services/tool-service";
import { ToolType } from "../../common/tools/tool";

import {} from "pixi.js-legacy";
declare let PIXI: any;

// Hotspot is the sprite's center (32x54 baked cursor image).
const SCISSORS_CURSOR =
  "url(assets/images/disconnect-none-cursor.png) 16 27, auto";

@Component({
  selector: "app-component-canvas",
  templateUrl: "./component-canvas.component.html",
  styleUrls: ["./component-canvas.component.css"],
  standalone: false,
  providers: [DrawPixi],
})
export class ComponentCanvasComponent
  implements OnInit, OnDestroy, IObsCameraChanged, IObsToolChanged
{
  width!: number;
  height!: number;

  debug: any;

  @ViewChild("blueprintCanvas", { static: true })
  canvasRef!: ElementRef;

  @ViewChild("divCalcHeight", { static: true })
  divCalcHeight!: ElementRef;

  @Input()
  forceSize!: boolean;
  @Input()
  forcedSize!: Vector2;

  drawPixi: DrawPixi;
  drawRoomOverlay!: DrawRoomOverlay;
  drawNotesOverlay!: DrawNotesOverlay;

  private cameraService: CameraService;

  public get blueprint() {
    return this.blueprintService.blueprint;
  }
  constructor(
    private ngZone: NgZone,
    private blueprintService: BlueprintService,
    private toolService: ToolService,
    private gaService: GoogleAnalyticsService,
    private roomDetectionService: RoomDetectionService,
    private worldNoteService: WorldNoteService,
    drawPixi: DrawPixi,
  ) {
    this.drawPixi = drawPixi;
    this.cameraService = new CameraService(this.drawPixi.getNewContainer());
    this.cameraService.subscribeCameraChange(this);
    this.toolService.subscribeToolChanged(this);
  }

  toolChanged(toolType: ToolType) {
    if (!this.forceSize)
      this.canvasRef.nativeElement.style.cursor =
        toolType == ToolType.scissors ? SCISSORS_CURSOR : "";
  }

  private running!: boolean;
  ngOnInit() {
    // Init the camera service (maybe this should be elsewhere?)

    // Start the rendering loop
    this.running = true;
    this.ngZone.runOutsideAngular(() => {
      this.drawPixi.Init(this.canvasRef, this);
      this.drawPixi.InitAnimation();
      this.cameraService.container = this.drawPixi.blueprintContainer;
      this.drawRoomOverlay = new DrawRoomOverlay(this.drawPixi);
      this.drawNotesOverlay = new DrawNotesOverlay(this.drawPixi);

      if (this.forceSize) {
        const miniUi = new DrawMiniUi();
        miniUi.init(this.drawPixi.pixiApp.stage);
        this.cameraService.subscribeCameraChange(miniUi);
      }
    });

    //this.drawAbstraction.Init(this.canvasRef, this)
  }

  ngOnDestroy() {
    this.running = false;
  }

  // Render-time telemetry: how long it takes from "a blueprint is handed to the
  // canvas" to "every item has a PIXI container", reported to GA so we have some
  // real signal on client-side render performance in prod. Best-effort only -
  // any failure here must never affect actual loading/rendering.
  private pendingRenderMetric: {
    startTime: number;
    itemCount: number;
    generation: number;
  } | null = null;
  private renderMetricGeneration = 0;

  private startRenderMetric(source: Blueprint) {
    try {
      this.renderMetricGeneration++;
      this.pendingRenderMetric = {
        startTime: performance.now(),
        itemCount: source.blueprintItems?.length ?? 0,
        generation: this.renderMetricGeneration,
      };
    } catch (error) {
      console.warn("startRenderMetric failed", error);
      this.pendingRenderMetric = null;
    }
  }

  private static readonly RENDER_METRIC_TIMEOUT_MS = 20000;
  private checkRenderMetric() {
    const pending = this.pendingRenderMetric;
    if (pending == null) return;

    try {
      // A newer blueprint was loaded before this one finished rendering; drop it.
      if (pending.generation !== this.renderMetricGeneration) {
        this.pendingRenderMetric = null;
        return;
      }

      const elapsedMs = performance.now() - pending.startTime;
      const items = this.blueprint?.blueprintItems;
      if (items == null) {
        this.pendingRenderMetric = null;
        return;
      }

      if (elapsedMs > ComponentCanvasComponent.RENDER_METRIC_TIMEOUT_MS) {
        this.reportRenderMetric(
          "blueprint_render_timeout",
          pending.itemCount,
          elapsedMs,
        );
        this.pendingRenderMetric = null;
        return;
      }

      const allReady = items.every((item) => item?.containerCreated);
      if (allReady) {
        this.reportRenderMetric(
          "blueprint_render_complete",
          pending.itemCount,
          elapsedMs,
        );
        this.pendingRenderMetric = null;
      }
    } catch (error) {
      console.warn("checkRenderMetric failed", error);
      this.pendingRenderMetric = null;
    }
  }

  private reportRenderMetric(
    action: string,
    itemCount: number,
    durationMs: number,
  ) {
    try {
      this.gaService?.event(
        action,
        "blueprint_performance",
        undefined,
        Math.round(durationMs),
        false,
        {
          item_count: itemCount,
        },
      );
    } catch (error) {
      console.warn("reportRenderMetric failed", error);
    }
  }

  public loadNewBlueprint(source: Blueprint) {
    // TODO make sure nothing creates a "real  blueprint" before this
    // TODO fixme
    this.startRenderMetric(source);
    this.worldNoteService.clear();
    this.blueprint.destroyAndCopyItems(source);

    this.cameraService.overlay = Overlay.Base;
    //let cameraOffset = new Vector2(-topLeft.x + 1, bottomRight.y + 1);

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.cameraService.resetZoom(
      new Vector2(rect.width - rect.left, rect.height - rect.top),
    );

    if (source.blueprintItems.length > 0) {
      const boundingBox = this.blueprint.getBoundingBox();
      const topLeft = boundingBox[0];
      const bottomRight = boundingBox[1];

      const totalTileSize = new Vector2(
        bottomRight.x - topLeft.x + 3,
        bottomRight.y - topLeft.y + 3,
      );
      const maxTotalSize = Math.max(totalTileSize.x, totalTileSize.y);
      const minCanvasSize = Math.min(
        this.canvasRef.nativeElement.width,
        this.canvasRef.nativeElement.height,
      );
      const thumbnailTileSize = minCanvasSize / maxTotalSize;

      this.cameraService.cameraOffset.x = -topLeft.x + 1;
      this.cameraService.cameraOffset.y = bottomRight.y + 1; // (add 2 instead of 1, one tile will probably be hidden by the menu)

      if (totalTileSize.x > totalTileSize.y)
        this.cameraService.cameraOffset.y +=
          totalTileSize.x / 2 - totalTileSize.y / 2;
      if (totalTileSize.y > totalTileSize.x)
        this.cameraService.cameraOffset.x +=
          totalTileSize.y / 2 - totalTileSize.x / 2;

      this.cameraService.setHardZoom(thumbnailTileSize);
    }
  }

  getCursorPosition(event: any): Vector2 {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return new Vector2(event.clientX - rect.left, event.clientY - rect.top);
  }

  getCurrentTile(event: any): Vector2 {
    const returnValue = this.cameraService.getTileCoords(
      this.getCursorPosition(event),
    );

    returnValue.x = Math.floor(returnValue.x);
    returnValue.y = Math.ceil(returnValue.y);

    return returnValue;
  }

  mouseWheel(event: any) {
    this.cameraService.zoom(event.delta, this.getCursorPosition(event));
  }

  mouseUp(event: any) {
    if (event.button == 0) {
      this.storePreviousTileFloat = null;
    }
  }

  mouseDown(event: any) {
    if (event.button == 0) {
      this.toolService.mouseDown(
        this.getCurrentTile(event),
        this.cameraService.getTileCoords(this.getCursorPosition(event)),
      );
    }
  }

  mouseOut(_event: any) {
    this.toolService.mouseOut();
  }

  mouseClick(event: any) {
    // Don't send the clicks to the tools if we are in an iframe
    if (!this.forceSize) {
      if (event.button == 0) {
        const tile = this.getCurrentTile(event);
        // World notes are a top annotation layer: a left click on a note
        // selects it for editing and is consumed, so it never falls through
        // to the tool.
        const note = this.findNoteAt(tile);
        if (note != null) {
          this.worldNoteService.select(note);
          return;
        }
        this.worldNoteService.clear();
        this.toolService.leftClick(tile);
      } else if (event.button == 2) {
        this.worldNoteService.clear();
        this.toolService.rightClick(this.getCurrentTile(event));
      }
    }
  }

  private findNoteAt(tile: Vector2): BniWorldNote | null {
    const notes = this.blueprint?.worldNotes;
    if (notes == null) return null;
    // Last wins so the topmost drawn note (drawn last) is the one selected.
    for (let i = notes.length - 1; i >= 0; i--)
      if (notes[i].x == tile.x && notes[i].y == tile.y) return notes[i];
    return null;
  }

  storePreviousTileFloat: Vector2 | null = null;
  mouseDrag(event: any) {
    const previousTileFloat = Vector2.clone(
      this.storePreviousTileFloat ?? undefined,
    );
    const currentTileFloat = this.cameraService.getTileCoords(
      this.getCursorPosition(event),
    );

    if (event.dragButton[2]) {
      //console.log('camera drag');
      this.cameraService.cameraOffset.x +=
        event.dragX / this.cameraService.currentZoom;
      this.cameraService.cameraOffset.y +=
        event.dragY / this.cameraService.currentZoom;
    } else if (event.dragButton[0]) {
      // Don't send the clicks to the tools if we are in an iframe
      if (!this.forceSize)
        this.toolService.drag(previousTileFloat!, currentTileFloat!);
    }

    this.storePreviousTileFloat = Vector2.clone(currentTileFloat);
  }

  mouseStopDrag(_event: any) {
    this.storePreviousTileFloat = null;
    this.toolService.dragStop();
  }

  // Two-finger touch gesture: pans and zooms the camera together, mirroring
  // desktop's right-drag-to-pan + wheel-to-zoom since touch has no
  // equivalent buttons/wheel. Single-finger touch drives the active tool
  // exactly like a left-button mouse drag (see mouseDrag/mouseDown above).
  multiTouchGesture(event: any) {
    this.cameraService.cameraOffset.x +=
      event.panX / this.cameraService.currentZoom;
    this.cameraService.cameraOffset.y +=
      event.panY / this.cameraService.currentZoom;

    if (event.zoomDelta) {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const centerPos = new Vector2(
        event.centerClientX - rect.left,
        event.centerClientY - rect.top,
      );
      this.cameraService.changeZoom(event.zoomDelta, centerPos);
    }
  }

  // previousMouse is used by the keyboard zoom
  previousMouse: Vector2 = new Vector2();
  previousTileUnderMouse: Vector2 | null = null;
  mouseMove(event: any) {
    this.previousMouse = this.getCursorPosition(event);
    const currentTileUnderMouse = this.getCurrentTile(event);

    if (
      this.previousTileUnderMouse == null ||
      !this.previousTileUnderMouse.equals(currentTileUnderMouse)
    )
      this.toolService.hover(currentTileUnderMouse);

    this.previousTileUnderMouse = currentTileUnderMouse;
  }

  keyPress(event: any) {
    //console.log(event.key)
    if (event.key == "Escape") this.worldNoteService.clear();
    this.toolService.keyDown(event.key);

    if (document.body == document.activeElement) {
      if (event.key == "ArrowLeft") this.cameraService.cameraOffset.x += 1;
      if (event.key == "ArrowRight") this.cameraService.cameraOffset.x -= 1;
      if (event.key == "ArrowUp") this.cameraService.cameraOffset.y += 1;
      if (event.key == "ArrowDown") this.cameraService.cameraOffset.y -= 1;
      if (event.key == "+") this.cameraService.zoom(1, this.previousMouse);
      if (event.key == "-") this.cameraService.zoom(-1, this.previousMouse);
    }

    if (event.key == "z" && event.ctrlKey) this.blueprintService.undo();
    if (event.key == "y" && event.ctrlKey) this.blueprintService.redo();

    //this.canvasRef.nativeElement.click();
  }

  prepareOverlayInfo() {
    if (this.blueprint != null)
      this.blueprint.prepareOverlayInfo(this.cameraService.overlay);
  }

  /*
   *
   * Sprite repackaging
   *
   */
  fetchIcons() {
    for (const k of ImageSource.keys)
      ImageSource.getBaseTexture(k, this.drawPixi);
    for (const k of SpriteInfo.keys)
      SpriteInfo.getSpriteInfo(k).getTexture(this.drawPixi);
  }

  downloadUtility(database: BExport) {
    const allWhiteFilter = new PIXI.filters.ColorMatrixFilter();
    // 1 1 1 0 1
    // 1 1 1 0 1
    // 1 1 1 0 1
    // 1 1 1 1 1
    allWhiteFilter.matrix[0] = 1;
    allWhiteFilter.matrix[1] = 1;
    allWhiteFilter.matrix[2] = 1;
    allWhiteFilter.matrix[4] = 1;
    allWhiteFilter.matrix[5] = 1;
    allWhiteFilter.matrix[6] = 1;
    allWhiteFilter.matrix[7] = 1;
    allWhiteFilter.matrix[9] = 1;
    allWhiteFilter.matrix[10] = 1;
    allWhiteFilter.matrix[11] = 1;
    allWhiteFilter.matrix[12] = 1;
    allWhiteFilter.matrix[14] = 1;

    const sourceSpriteModifiers = database.spriteModifiers.filter((s) => {
      return s.tags.indexOf(SpriteTag.solid) != -1;
    });

    const sourceTextures: string[] = [];

    for (const sourceSpriteModifier of sourceSpriteModifiers) {
      const sourceSpriteInfo = database.uiSprites.find((s) => {
        return s.name == sourceSpriteModifier.spriteInfoName;
      });

      if (sourceTextures.indexOf(sourceSpriteInfo!.textureName) == -1)
        sourceTextures.push(sourceSpriteInfo!.textureName);

      const spriteModifierWhite = BSpriteModifier.clone(sourceSpriteModifier);
      spriteModifierWhite.name = spriteModifierWhite.name + "_white";
      spriteModifierWhite.spriteInfoName =
        spriteModifierWhite.spriteInfoName + "_white";
      spriteModifierWhite.tags.push(SpriteTag.white);
      database.spriteModifiers.push(spriteModifierWhite);

      let spriteInfoWhite: BSpriteInfo | null = null;
      for (const spriteInfo of database.uiSprites)
        if (spriteInfo.name == sourceSpriteModifier.spriteInfoName)
          spriteInfoWhite = BSpriteInfo.clone(spriteInfo);

      if (spriteInfoWhite != null) {
        spriteInfoWhite.name = spriteModifierWhite.spriteInfoName;
        spriteInfoWhite.textureName = spriteInfoWhite.textureName + "_white";
        database.uiSprites.push(spriteInfoWhite);
      }

      for (const building of database.buildings)
        if (
          building.sprites.spriteNames.indexOf(sourceSpriteModifier.name) != -1
        )
          building.sprites.spriteNames.push(spriteModifierWhite.name);
    }

    ComponentCanvasComponent.zip = new JSZip();
    ComponentCanvasComponent.nbBlob = 0;
    ComponentCanvasComponent.downloadFile = "solidSprites.zip";
    ComponentCanvasComponent.nbBlobMax = sourceTextures.length;

    ComponentCanvasComponent.zip.file(
      "database_white.json",
      JSON.stringify(database, null, 2),
    );

    for (const sourceTexture of sourceTextures) {
      const baseTexture = ImageSource.getBaseTexture(
        sourceTexture,
        this.drawPixi,
      );

      const texture = new PIXI.Texture(baseTexture);

      const brt = new PIXI.BaseRenderTexture({
        width: texture.width,
        height: texture.height,
      });
      const rt = new PIXI.RenderTexture(brt);

      const sprite = PIXI.Sprite.from(texture);
      sprite.filters = [allWhiteFilter];

      this.drawPixi.pixiApp.renderer.render(sprite, rt);

      this.drawPixi.pixiApp.renderer.extract.canvas(rt).toBlob((b) => {
        this.addBlob(b!, sourceTexture + "_white.png");
      }, "image/png");
    }
  }

  downloadGroups(database: BExport) {
    const renderTextures: PIXI.RenderTexture[] = [];
    const textureNames: string[] = [];

    for (const oniItem of OniItem.oniItems) {
      const buildingInDatabase = database.buildings.find((building) => {
        return building.prefabId == oniItem.id;
      });

      const spritesToGroup: SpriteModifier[] = [];
      for (const spriteModifier of oniItem.spriteGroup.spriteModifiers) {
        if (
          spriteModifier.tags.indexOf(SpriteTag.solid) != -1 &&
          spriteModifier.tags.indexOf(SpriteTag.tileable) == -1 &&
          spriteModifier.tags.indexOf(SpriteTag.connection) == -1
        )
          spritesToGroup.push(spriteModifier);
      }

      if (spritesToGroup.length > 1) {
        const container: PIXI.Container = new PIXI.Container();
        container.sortableChildren = true;

        const modifierId = oniItem.id + "_group_modifier";
        const spriteInfoId = oniItem.id + "_group_sprite";
        const textureName = oniItem.id + "_group_sprite";

        let indexDrawPart = 0;
        for (const spriteModifier of oniItem.spriteGroup.spriteModifiers) {
          if (
            spriteModifier.tags.indexOf(SpriteTag.solid) == -1 ||
            spriteModifier.tags.indexOf(SpriteTag.tileable) != -1 ||
            spriteModifier.tags.indexOf(SpriteTag.connection) != -1
          )
            continue;

          // Remove from the database building sprite list
          let indexToRemove = buildingInDatabase!.sprites.spriteNames.indexOf(
            spriteModifier.spriteModifierId,
          );
          buildingInDatabase!.sprites.spriteNames.splice(indexToRemove, 1);

          // Then from the sprite modifiers
          const spriteModifierToRemove = database.spriteModifiers.find((s) => {
            return s.name == spriteModifier.spriteModifierId;
          });
          if (spriteModifierToRemove != null) {
            indexToRemove = database.spriteModifiers.indexOf(
              spriteModifierToRemove,
            );
            database.spriteModifiers.splice(indexToRemove, 1);
          }

          const spriteInfoToRemove = database.uiSprites.find((s) => {
            return s.name == spriteModifier.spriteInfoName;
          });
          if (spriteInfoToRemove != null) {
            indexToRemove = database.uiSprites.indexOf(spriteInfoToRemove);
            database.uiSprites.splice(indexToRemove, 1);
          }

          const spriteInfo = SpriteInfo.getSpriteInfo(
            spriteModifier.spriteInfoName,
          );
          const texture = spriteInfo.getTexture(this.drawPixi);
          const sprite = PIXI.Sprite.from(texture);
          sprite.anchor.set(spriteInfo.pivot.x, 1 - spriteInfo.pivot.y);
          sprite.x = 0 + spriteModifier.translation.x;
          sprite.y = 0 - spriteModifier.translation.y;
          sprite.width = spriteInfo.realSize.x;
          sprite.height = spriteInfo.realSize.y;
          sprite.scale.x = spriteModifier.scale.x;
          sprite.scale.y = spriteModifier.scale.y;
          sprite.angle = -spriteModifier.rotation;
          sprite.zIndex -= indexDrawPart / 50;

          container.addChild(sprite);

          indexDrawPart++;
        }

        buildingInDatabase!.sprites.spriteNames.push(modifierId);

        container.calculateBounds();
        const bounds = container.getBounds();
        bounds.x = Math.floor(bounds.x);
        bounds.y = Math.floor(bounds.y);
        bounds.width = Math.ceil(bounds.width);
        bounds.height = Math.ceil(bounds.height);

        const diff = new Vector2(bounds.x, bounds.y);
        for (const child of container.children) {
          child.x -= diff.x;
          child.y -= diff.y;
        }

        const pivot = new Vector2(
          1 - (bounds.width + bounds.x) / bounds.width,
          (bounds.height + bounds.y) / bounds.height,
        );
        //console.log(pivot);

        const brt = new PIXI.BaseRenderTexture({
          width: bounds.width,
          height: bounds.height,
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        });
        const rt = new PIXI.RenderTexture(brt);

        this.drawPixi.pixiApp.renderer.render(container, rt);

        renderTextures.push(rt);
        textureNames.push(textureName);

        // Create and add the new sprite modifier to replace the group
        const newSpriteModifier = new BSpriteModifier();
        newSpriteModifier.name = modifierId;
        newSpriteModifier.spriteInfoName = spriteInfoId;
        newSpriteModifier.rotation = 0;
        newSpriteModifier.scale = new Vector2(1, 1);
        newSpriteModifier.translation = new Vector2(0, 0);
        newSpriteModifier.tags = [SpriteTag.solid];
        database.spriteModifiers.push(newSpriteModifier);

        // Create and add the new spriteInfo
        const newSpriteInfo = new BSpriteInfo();
        newSpriteInfo.name = spriteInfoId;
        newSpriteInfo.textureName = textureName;
        newSpriteInfo.pivot = pivot;
        newSpriteInfo.uvMin = new Vector2(0, 0);
        newSpriteInfo.realSize = new Vector2(bounds.width, bounds.height);
        newSpriteInfo.uvSize = new Vector2(bounds.width, bounds.height);
        database.uiSprites.push(newSpriteInfo);
      }
    }

    ComponentCanvasComponent.zip = new JSZip();
    ComponentCanvasComponent.nbBlob = 0;
    ComponentCanvasComponent.downloadFile = "solidGroups.zip";
    ComponentCanvasComponent.nbBlobMax = renderTextures.length;

    ComponentCanvasComponent.zip.file(
      "database_groups.json",
      JSON.stringify(database, null, 2),
    );

    for (let indexRt = 0; indexRt < renderTextures.length; indexRt++)
      this.drawPixi.pixiApp.renderer.extract
        .canvas(renderTextures[indexRt])
        .toBlob((b) => {
          this.addBlob(b!, textureNames[indexRt] + ".png");
        }, "image/png");
  }

  repackTextures(_database: any) {
    /*
    // Tests bintrays
    let traySize = 1024;
    let textureBaseString = 'repack_';
    let binController = new BinController(new Vector2(traySize, traySize));

    let bleed = new Vector2(10, 10);
    /*
    // Tests
    binController.addItem('test_0', new Vector2(50, 50), bleed);
    binController.addItem('test_1', new Vector2(50, 50), bleed);
    binController.addItem('test_2', new Vector2(10, 50), bleed);
    binController.addItem('test_3', new Vector2(10, 50), bleed);
    */
    /*
    // First, we clone the existing spriteInfos into a new array :
    let newSpriteInfos: BSpriteInfo[] = [];

    for (let spriteInfo of SpriteInfo.spriteInfos) {
      // Copy the sprite info into the BSpriteInfo.
      // We need to start from the start info because some of them are generated (tiles)
      let newSpriteInfo = new BSpriteInfo();
      newSpriteInfo.name = spriteInfo.spriteInfoId;
      newSpriteInfo.uvMin = Vector2.clone(spriteInfo.uvMin);
      newSpriteInfo.uvSize = Vector2.clone(spriteInfo.uvSize);
      newSpriteInfo.realSize = Vector2.clone(spriteInfo.realSize);
      newSpriteInfo.pivot = Vector2.clone(spriteInfo.pivot);
      newSpriteInfo.isIcon = spriteInfo.isIcon;
      newSpriteInfos.push(newSpriteInfo);
    }

    // Sort our new array of BSpriteInfo by descending height
    newSpriteInfos = newSpriteInfos.sort((i1, i2) => { return i2.uvSize.y - i1.uvSize.y; });

    for (let spriteInfo of newSpriteInfos) {
      let itemAdded  = binController.addItem(spriteInfo.name, Vector2.clone(spriteInfo.uvSize), bleed);
      if (itemAdded != null) {
        spriteInfo.uvMin = Vector2.clone(itemAdded.uvStart);
        spriteInfo.textureName = textureBaseString + itemAdded.trayIndex;
      }
    }


    database.uiSprites = newSpriteInfos;

    ComponentCanvasComponent.zip = new JSZip();
    ComponentCanvasComponent.nbBlob = 0;
    ComponentCanvasComponent.downloadFile = 'repackedTextureAndDatabase.zip';
    ComponentCanvasComponent.nbBlobMax = binController.binTrays.length;

    ComponentCanvasComponent.zip.file('database_repacked.json', JSON.stringify(database, null, 2));


    for (let trayIndex = 0; trayIndex < binController.binTrays.length; trayIndex++) {
      let brt = new PIXI.BaseRenderTexture({width: binController.binTrays[trayIndex].binSize.x, height: binController.binTrays[trayIndex].binSize.y});
      let rt = new PIXI.RenderTexture(brt);

      let graphics = new PIXI.Graphics();
      let container = new PIXI.Container();
      container.addChild(graphics);

      for (let spriteInfo of newSpriteInfos.filter((s) => { return s.textureName == textureBaseString + trayIndex; })) {
        let repackBleed = 5;
        let realBleed = new Vector2();
        let texture = SpriteInfo.getSpriteInfo(spriteInfo.name).getTextureWithBleed(repackBleed, realBleed, this.drawPixi);
        let sprite = PIXI.Sprite.from(texture);

        sprite.x = spriteInfo.uvMin.x - realBleed.x;
        sprite.y = spriteInfo.uvMin.y - realBleed.y;
        container.addChild(sprite);

        //graphics.beginFill(0x007AD9);
        //graphics.drawRect(spriteInfo.uvMin.x, spriteInfo.uvMin.y, spriteInfo.uvSize.x, spriteInfo.uvSize.y);
        //graphics.endFill();
      }

      this.drawPixi.pixiApp.renderer.render(container, rt, true);

      this.drawPixi.pixiApp.renderer.extract.canvas(rt).toBlob((b) =>
      {
        this.addBlob(b, textureBaseString + trayIndex + '.png');
      }, 'image/png');
    }
    */
  }

  downloadIcons() {
    ComponentCanvasComponent.zip = new JSZip();
    ComponentCanvasComponent.nbBlob = 0;
    ComponentCanvasComponent.downloadFile = "icons.zip";
    ComponentCanvasComponent.nbBlobMax = SpriteInfo.keys.filter(
      (s) => SpriteInfo.getSpriteInfo(s).isIcon,
    ).length;

    for (const k of SpriteInfo.keys.filter(
      (s) => SpriteInfo.getSpriteInfo(s).isIcon,
    )) {
      const uiSpriteInfo = SpriteInfo.getSpriteInfo(k);
      const texture = uiSpriteInfo.getTexture(this.drawPixi);
      const uiSprite = PIXI.Sprite.from(texture);

      const size = Math.max(texture.width, texture.height);

      const container = new PIXI.Container();
      container.addChild(uiSprite);

      uiSprite.x = 0;
      uiSprite.y = 0;

      if (texture.width > texture.height)
        uiSprite.y += texture.width / 2 - texture.height / 2;
      if (texture.height > texture.width)
        uiSprite.x += texture.height / 2 - texture.width / 2;

      const brt = new PIXI.BaseRenderTexture({
        width: size,
        height: size,
        scaleMode: PIXI.SCALE_MODES.LINEAR,
      });
      const rt = new PIXI.RenderTexture(brt);

      this.drawPixi.pixiApp.renderer.render(container, rt, true);
      this.drawPixi.pixiApp.renderer.extract.canvas(rt).toBlob((blob) => {
        this.addBlob(blob!, k + ".png");
      }, "image/png");
    }
  }

  private static downloadFile: string;
  private static nbBlobMax: number;
  private static nbBlob: number;
  private static zip: JSZip;
  addBlob(blob: Blob, filename: string) {
    ComponentCanvasComponent.nbBlob++;
    ComponentCanvasComponent.zip.file(filename, blob);

    if (ComponentCanvasComponent.nbBlob == ComponentCanvasComponent.nbBlobMax) {
      ComponentCanvasComponent.zip
        .generateAsync({ type: "blob" })
        .then(function (blob) {
          const a = document.createElement("a");
          document.body.append(a);
          a.download = ComponentCanvasComponent.downloadFile;
          a.href = URL.createObjectURL(blob);
          a.click();
          a.remove();
        });
    }
  }

  updateThumbnail() {
    //console.log('updateThumbnail')
    this.blueprintService.thumbnail = null!;

    const clone = this.blueprint.clone();
    if (clone.blueprintItems.length == 0)
      throw new Error("No buildings to export");

    const boundingBox = clone.getBoundingBox();
    const topLeft = boundingBox[0];
    const bottomRight = boundingBox[1];

    const totalTileSize = new Vector2(
      bottomRight.x - topLeft.x + 3,
      bottomRight.y - topLeft.y + 3,
    );

    const thumbnailSize = 200;
    const maxTotalSize = Math.max(totalTileSize.x, totalTileSize.y);
    const thumbnailTileSize = thumbnailSize / maxTotalSize;
    const cameraOffset = new Vector2(-topLeft.x + 1, bottomRight.y + 1);
    if (totalTileSize.x > totalTileSize.y)
      cameraOffset.y += totalTileSize.x / 2 - totalTileSize.y / 2;
    if (totalTileSize.y > totalTileSize.x)
      cameraOffset.x += totalTileSize.y / 2 - totalTileSize.x / 2;

    const exportCamera = new CameraService(this.drawPixi.getNewContainer());
    exportCamera.setHardZoom(thumbnailTileSize);
    exportCamera.cameraOffset = cameraOffset;
    exportCamera.overlay = Overlay.Base;
    exportCamera.display = this.cameraService.display;
    exportCamera.container = new PIXI.Container();
    exportCamera.container.sortableChildren = true;

    const graphics = new PIXI.Graphics();
    exportCamera.container.addChild(graphics);

    //graphics.beginFill(0x00000000);
    //graphics.drawRect(0, 0, thumbnailSize, thumbnailSize);
    //graphics.endFill();

    clone.blueprintItems.map((item) => {
      item.updateTileables(clone);
      item.drawPixi(exportCamera, this.drawPixi);
    });

    const brt = new PIXI.BaseRenderTexture({
      width: thumbnailSize,
      height: thumbnailSize,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
    });
    const rt = new PIXI.RenderTexture(brt);

    this.drawPixi.pixiApp.renderer.render(exportCamera.container, rt, false);
    this.drawPixi.pixiApp.renderer.extract.canvas(rt).toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        this.blueprintService.thumbnail = reader.result as string;
      };
      reader.readAsDataURL(blob!);

      /*
      // Test download
      let a = document.createElement('a');
        document.body.append(a);
        a.download = ComponentCanvasComponent.downloadFile;
        a.href = URL.createObjectURL(blob);
        a.click();
        a.remove();
      */
    });
  }

  saveImages(exportOptions: ExportImageOptions) {
    const clone = this.blueprint.clone();
    if (clone.blueprintItems.length == 0)
      throw new Error("No buildings to export");

    const boundingBox = clone.getBoundingBox();
    const topLeft = boundingBox[0];
    const bottomRight = boundingBox[1];

    const tileSize = exportOptions.pixelsPerTile;
    const totalTileSize = new Vector2(
      bottomRight.x - topLeft.x + 3,
      bottomRight.y - topLeft.y + 3,
    );
    const sizeInPixels = new Vector2(
      totalTileSize.x * tileSize,
      totalTileSize.y * tileSize,
    );

    const exportCamera = new CameraService(this.drawPixi.getNewContainer());
    exportCamera.setHardZoom(tileSize);
    exportCamera.cameraOffset = new Vector2(-topLeft.x + 1, bottomRight.y + 1);
    exportCamera.container = new PIXI.Container();
    exportCamera.container.sortableChildren = true;

    const graphics = new PIXI.Graphics();
    exportCamera.container.addChild(graphics);

    // TODO color in parameter
    graphics.beginFill(0x007ad9);
    graphics.drawRect(0, 0, sizeInPixels.x, sizeInPixels.y);
    graphics.endFill();

    ComponentCanvasComponent.zip = new JSZip();
    ComponentCanvasComponent.nbBlob = 0;
    ComponentCanvasComponent.downloadFile = "export.zip";
    ComponentCanvasComponent.nbBlobMax = exportOptions.selectedOverlays.length;

    exportOptions.selectedOverlays.map((overlay) => {
      exportCamera.overlay = overlay;

      clone.blueprintItems.map((item) => {
        item.updateTileables(clone);
        item.drawPixi(exportCamera, this.drawPixi);
      });

      const brt = new PIXI.BaseRenderTexture({
        width: sizeInPixels.x,
        height: sizeInPixels.y,
        scaleMode: PIXI.SCALE_MODES.LINEAR,
      });
      const rt = new PIXI.RenderTexture(brt);

      this.drawPixi.pixiApp.renderer.render(exportCamera.container, rt, false);

      this.drawPixi.pixiApp.renderer.extract.canvas(rt).toBlob((blob) => {
        this.addBlob(
          blob!,
          "export_" + DrawHelpers.overlayString[overlay] + ".png",
        );
      });
    });
  }

  drawAll() {
    //console.log(this.running);
    //console.log('tick');
    // Check that we're still running.
    if (!this.running) {
      return;
    }

    // Whole page dimensions
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    //console.log('tick');
    // TODO ugly
    //if (this.canvasRef == null) return;

    //console.log(this.divCalcHeight.nativeElement.offsetHeight)

    //this.canvasRef.nativeElement.height = 500;

    //this.canvasRef.nativeElement.height = this.divCalcHeight.nativeElement.offsetHeight - 7;

    if (this.forceSize) {
      this.canvasRef.nativeElement.width = this.forcedSize.x;
      this.canvasRef.nativeElement.height = this.forcedSize.y;
    } else {
      this.canvasRef.nativeElement.width = window.innerWidth;
      this.canvasRef.nativeElement.height = window.innerHeight;
    }

    this.cameraService.updateZoom();

    //console.log('tick');
    //this.drawAbstraction.Init(this.canvasRef, this);

    //let ctx: CanvasRenderingContext2D = this.canvasRef.nativeElement.getContext('2d');

    this.drawPixi.clearGraphics();

    //if (this.cameraService.visualization == Visualization.temperature) this.drawPixi.FillRect(0x909090, 0, 0, this.width, this.height);
    if (this.cameraService.display == Display.blueprint)
      this.drawPixi.FillRect(0x007ad9, 0, 0, this.width, this.height);
    else this.drawPixi.FillRect(0x909090, 0, 0, this.width, this.height);

    const alphaOrig: number = 0.4;
    let alpha: number = alphaOrig;
    const realLineSpacing: number = this.cameraService.currentZoom;

    const zoomFadeMax: number = 35;
    const zoomFadeMin: number = 25;
    if (this.cameraService.currentZoom < zoomFadeMax)
      alpha *=
        (this.cameraService.currentZoom - zoomFadeMin) /
        (zoomFadeMax - zoomFadeMin);
    if (this.cameraService.currentZoom < zoomFadeMin) alpha = 0;

    //while (realLineSpacing < 30)
    //  realLineSpacing *= 5;

    const colOrig: number =
      ((this.cameraService.cameraOffset.x * this.cameraService.currentZoom) %
        (realLineSpacing * 5)) -
      realLineSpacing * 4;
    let mod = 0;
    for (
      let col = colOrig;
      col < this.width + realLineSpacing * 4;
      col += realLineSpacing
    ) {
      const realAlpha = mod % 5 == 0 ? alphaOrig + 0.3 : alpha;
      const color = "rgba(255,255,255, " + realAlpha + ")";
      if (realAlpha > 0)
        this.drawPixi.drawBlueprintLine(
          color,
          realAlpha,
          new Vector2(col, 0),
          new Vector2(col, this.height),
          1,
        );
      mod++;
    }

    const lineOrig =
      ((this.cameraService.cameraOffset.y * this.cameraService.currentZoom) %
        (realLineSpacing * 5)) -
      realLineSpacing * 4;
    mod = 0;
    for (
      let line = lineOrig;
      line < this.height + realLineSpacing * 4;
      line += realLineSpacing
    ) {
      const realAlpha = mod % 5 == 0 ? alphaOrig + 0.3 : alpha;
      const color = "rgba(255,255,255, " + realAlpha + ")";
      if (realAlpha > 0)
        this.drawPixi.drawBlueprintLine(
          color,
          realAlpha,
          new Vector2(0, line),
          new Vector2(this.width, line),
          1,
        );
      mod++;
    }

    if (this.blueprint != null) {
      for (const templateItem of this.blueprint.blueprintItems) {
        //templateItem.updateTileables(this.blueprint);
        this.drawPixi.drawTemplateItem(templateItem, this.cameraService);
        //templateItem.draw(ctx, this.camera);
      }

      this.toolService.draw(this.drawPixi, this.cameraService);

      // Room overlay: cavity tints + labels above everything. Only the main
      // editor canvas drives detection activity — export/thumbnail canvases
      // (forceSize) never show the Room overlay and must not fight the flag.
      if (!this.forceSize) {
        const roomOverlayActive = this.cameraService.overlay == Overlay.Room;
        this.roomDetectionService.active = roomOverlayActive;
        if (roomOverlayActive)
          this.drawRoomOverlay.draw(
            this.roomDetectionService.result,
            this.cameraService,
          );
        else this.drawRoomOverlay.clear();

        // World-note pins from a BlueprintsV2 import — annotations that sit
        // above buildings like the mod's own preview.
        this.drawNotesOverlay.draw(
          this.blueprint.worldNotes,
          this.cameraService,
          this.worldNoteService.selected,
        );
      }
    }

    if (this.pendingRenderMetric != null) this.checkRenderMetric();

    if (this.cameraService.triggerSortChildren) {
      this.drawPixi.sortChildren();
      this.blueprint.sortChildren();
      this.cameraService.triggerSortChildren = false;
    }

    // Schedule next
    //requestAnimationFrame(() => this.drawAll());
  }

  animateAll() {
    this.cameraService.updateAnimations(this.drawPixi.pixiApp.ticker.elapsedMS);
  }

  drawBlueprintLine(
    ctx: CanvasRenderingContext2D,
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    lineWidth: number,
    alpha: number,
  ) {
    const offset: number = (lineWidth % 2) / 2;

    ctx.beginPath();
    ctx.moveTo(Math.floor(xStart) + offset, Math.floor(yStart) + offset);
    ctx.strokeStyle = "rgba(255,255,255, " + alpha + ")";
    ctx.lineWidth = lineWidth;
    ctx.lineTo(Math.floor(xEnd) + offset, Math.floor(yEnd) + offset);
    ctx.stroke();
  }

  cameraChanged(camera: CameraService) {
    if (this.blueprint != null)
      for (const blueprintItem of this.blueprint.blueprintItems)
        blueprintItem.cameraChanged(camera);

    if (
      this.toolService != null &&
      this.toolService.buildTool != null &&
      this.toolService.buildTool.templateItemToBuild != null
    )
      this.toolService.buildTool.templateItemToBuild.cameraChanged(camera);
  }
}
