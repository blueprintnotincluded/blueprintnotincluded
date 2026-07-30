import { BlueprintItem } from './blueprint-item';
import { BlueprintItemWire } from './blueprint-item-wire';
import { BinaryReader, Encoding } from 'csharp-binary-stream';
import { BlueprintHelpers } from './blueprint-helpers';
import { BlueprintItemElement } from './blueprint-item-element';
import { Vector2 } from '../vector2';
import { OniTemplate } from '../io/oni/oni-template';
import { OniItem } from '../oni-item';
import { BniBlueprint, BniPlanShape, BniWorldNote } from '../io/bni/bni-blueprint';
import { MdbBlueprint } from '../io/mdb/mdb-blueprint';
import { BniBuilding } from '../io/bni/bni-building';
import { Overlay } from '../enums/overlay';
import { DrawHelpers } from '../drawing/draw-helpers';
import { UtilityConnectionTracker } from '../utility-connection';
import {
  BniTerrainFeature,
  decodeTerrainFeatures,
  encodeTerrainFeatures,
  TERRAIN_METADATA_KEY,
} from './terrain-metadata';
import { applySanitizeOffset, modSanitizeOffset } from './bpv2-sanitize';
import { TerrainFeature } from '../b-export/b-terrain-feature';

export class Blueprint {
  blueprintItems: BlueprintItem[];
  templateTiles: BlueprintItem[][] = [];
  // Set to true when any building ID was not found in OniItem.oniItemsMap during
  // import. Indicates the blueprint was created with mods installed.
  hadUnknownBuildings: boolean = false;
  // Distinct building defs that were skipped during import because they are
  // not in our database (modded prefabs, e.g. 'PAirlockDoor') — surfaced as a
  // "contains N unrecognized buildings" hint. The entries themselves survive
  // in the verbatim raw upload stored server-side (Q8).
  unknownBuildingDefs: string[] = [];
  // BlueprintsV2 metadata parsed from the imported file (userdesc, icon,
  // icontint, worldNotes, …) — display/prefill only, never the round-trip
  // source of truth.
  bniMetadata: BniBlueprint | null = null;
  // World-note annotation pins (text + element notes). First-class blueprint
  // content, carried through the MDB model exactly like planningToolShapes:
  // saved, undone/redone, versioned, and downloaded back out as BlueprintsV2.
  worldNotes: BniWorldNote[] = [];
  // Decorative cells from the separate Planning Tool mod. Unlike world notes,
  // these are editable and therefore live in the normal MDB/undo model.
  planningToolShapes: BniPlanShape[] = [];
  // Natural terrain features (geysers, vents, volcanoes) annotated onto the
  // blueprint. Annotations, not construction: they never become BlueprintItems,
  // never appear in `buildings`, and contribute nothing to material cost or
  // build order. Persisted in the BlueprintsV2 `metadata` block.
  terrainFeatures: BniTerrainFeature[] = [];
  // Every BlueprintsV2 `metadata` key we do not own, kept verbatim so re-saving
  // a blueprint here never destroys the mod's or another tool's annotations.
  foreignMetadata: Record<string, string> = {};

  // We need a utility map because some objects have utilities outside of their size (HighWattageWireBridge)
  utilities: UtilityConnectionTracker[][] = [];

  innerYaml: any;

  constructor() {
    this.blueprintItems = [];

    this.observersBlueprintChanged = [];
  }

  public importFromOni(oniBlueprint: OniTemplate) {
    this.blueprintItems = [];
    this.hadUnknownBuildings = false;
    this.unknownBuildingDefs = [];
    this.bniMetadata = null;
    this.worldNotes = [];
    this.planningToolShapes = [];
    this.terrainFeatures = [];
    this.foreignMetadata = {};

    // Copy the buildings
    for (let building of oniBlueprint.buildings) {

      let newTemplateItem = BlueprintHelpers.createInstance(building.id);
      if (newTemplateItem == null) continue;

      newTemplateItem.importOniBuilding(building);

      this.addBlueprintItem(newTemplateItem);
    }

    // Copy the cells
    for (let cell of oniBlueprint.cells) {
      let elementPosition = new Vector2();
      if (cell.location_x != null) elementPosition.x = cell.location_x;
      if (cell.location_y != null) elementPosition.y = cell.location_y;

      let currentElement: BlueprintItemElement | undefined = undefined;
      let buildingsAtPosition = this.getBlueprintItemsAt(elementPosition);

      for (let building of buildingsAtPosition)
        if (building.oniItem.id == 'Element') {
          currentElement = building as BlueprintItemElement;
          currentElement.setElement(cell.element, 0);
        }

      if (currentElement == undefined) {
        currentElement = new BlueprintItemElement('Element');
        currentElement.position = elementPosition;
        currentElement.temperature = cell.temperature;
        currentElement.mass = cell.mass;
        currentElement.setElement(cell.element, 0);
        currentElement.cleanUp();

        // TODO boolean in export instead
        if (
          currentElement.buildableElements[0].hasTag('Liquid') ||
          currentElement.buildableElements[0].hasTag('Gas') ||
          currentElement.buildableElements[0].hasTag('Vacuum')
        )
          this.addBlueprintItem(currentElement);
      }
    }

    // Keep a copy of the yaml object in memory
    this.innerYaml = oniBlueprint;
  }

  public importFromBni(bniBlueprint: BniBlueprint) {
    this.blueprintItems = [];
    this.hadUnknownBuildings = false;
    this.unknownBuildingDefs = [];
    this.bniMetadata = bniBlueprint;
    this.worldNotes = (bniBlueprint.worldNotes ?? []).map(note => ({ ...note }));
    this.planningToolShapes = (bniBlueprint.planningtoolmod_shapecollection ?? []).map(shape => ({
      ...shape,
    }));
    this.importTerrainMetadata(bniBlueprint);

    for (let building of bniBlueprint.buildings ?? []) {
      try {
        let newTemplateItem = BlueprintHelpers.createInstance(building.buildingdef);
        if (newTemplateItem == null) {
          this.hadUnknownBuildings = true;
          if (this.unknownBuildingDefs.indexOf(building.buildingdef) == -1)
            this.unknownBuildingDefs.push(building.buildingdef);
          continue;
        }

        newTemplateItem.importBniBuilding(building);

        this.addBlueprintItem(newTemplateItem);
      } catch (error) {
        console.log(error);
      }
    }
  }

  // Read terrain annotations and any foreign metadata keys out of a
  // BlueprintsV2 file.
  //
  // Deliberately does NOT re-origin the annotations, even when the file still
  // needs sanitizing. The invariant that makes rendering correct is that terrain
  // coordinates are in the same space as the `buildings` and `digcommands` of
  // the same file — and this importer reads those verbatim too. Shifting the
  // annotations alone would be the one thing that breaks that alignment.
  //
  // The desync this guards against is created on write, not on read, so it is
  // fixed on write: toBniBlueprint() normalizes the buildings and the terrain
  // together, which makes the mod's own SanitizePositions() a guaranteed no-op
  // on every file we produce. See bpv2-sanitize.ts.
  private importTerrainMetadata(bniBlueprint: BniBlueprint) {
    const metadata = bniBlueprint.metadata;
    this.terrainFeatures = decodeTerrainFeatures(metadata);

    this.foreignMetadata = {};
    for (const [key, value] of Object.entries(metadata ?? {}))
      if (key !== TERRAIN_METADATA_KEY && typeof value === 'string')
        this.foreignMetadata[key] = value;
  }

  public importFromMdb(mdbBlueprint: MdbBlueprint) {
    this.blueprintItems = [];
    this.hadUnknownBuildings = false;
    this.unknownBuildingDefs = [];
    this.bniMetadata = null;
    this.worldNotes = (mdbBlueprint.worldNotes ?? []).map(note => ({ ...note }));
    this.planningToolShapes = (mdbBlueprint.planningToolShapes ?? []).map(shape => ({ ...shape }));
    this.terrainFeatures = (mdbBlueprint.terrainFeatures ?? []).map(feature => ({ ...feature }));
    this.foreignMetadata = { ...(mdbBlueprint.foreignMetadata ?? {}) };

    for (let originalTemplateItem of mdbBlueprint.blueprintItems) {
      let newTemplateItem = BlueprintHelpers.createInstance(originalTemplateItem.id);

      // Don't import buildings we don't recognise
      if (newTemplateItem == null) {
        this.hadUnknownBuildings = true;
        if (this.unknownBuildingDefs.indexOf(originalTemplateItem.id) == -1)
          this.unknownBuildingDefs.push(originalTemplateItem.id);
        continue;
      }

      newTemplateItem.importMdbBuilding(originalTemplateItem);
      this.addBlueprintItem(newTemplateItem);
    }
  }

  public importFromBinary(template: ArrayBuffer) {
    const reader = new BinaryReader(template);

    let bniBlueprint = new BniBlueprint();
    bniBlueprint.friendlyname = reader.readString(Encoding.Utf8);
    bniBlueprint.buildings = [];

    let buildingCount = reader.readInt();

    for (let buildingIndex = 0; buildingIndex < buildingCount; buildingIndex++) {
      let bniBuilding = new BniBuilding();

      let offsetX = reader.readInt();
      let offsetY = reader.readInt();
      bniBuilding.offset = new Vector2(offsetX, offsetY);

      let buildingDef = reader.readString(Encoding.Utf8);
      bniBuilding.buildingdef = buildingDef;

      let selectedElementCount = reader.readInt();
      for (let elementIndex = 0; elementIndex < selectedElementCount; elementIndex++) {
        reader.readInt();
      }

      let orientation = reader.readInt();
      bniBuilding.orientation = orientation;

      let flags = reader.readInt();
      bniBuilding.flags = flags;

      bniBlueprint.buildings.push(bniBuilding);
    }

    this.importFromBni(bniBlueprint);
  }

  public destroyAndCopyItems(source: Blueprint, emitChanges: boolean = true) {
    this.destroy(emitChanges);

    // World notes live on the source (fresh import); carry them onto the
    // rendered blueprint so the editor overlay can draw them.
    this.worldNotes = (source.worldNotes ?? []).map(note => ({ ...note }));
    this.planningToolShapes = source.planningToolShapes.map(shape => ({ ...shape }));
    this.terrainFeatures = (source.terrainFeatures ?? []).map(feature => ({ ...feature }));
    this.foreignMetadata = { ...(source.foreignMetadata ?? {}) };

    this.pauseChangeEvents();
    for (let blueprintItem of source.blueprintItems) this.addBlueprintItem(blueprintItem);
    this.resumeChangeEvents(emitChanges);
  }

  public prepareOverlayInfo(_currentOverlay: Overlay) {
    this.refreshOverlayInfo();
  }

  public refreshOverlayInfo() {
    //for (let blueprintItem of this.blueprintItems) blueprintItem.overlayChanged(this.currentOverlay);
  }

  public addBlueprintItem(blueprintItem: BlueprintItem) {
    this.blueprintItems.push(blueprintItem);

    if (blueprintItem.tileIndexes == null) blueprintItem.prepareBoundingBox();

    for (let tileIndex of blueprintItem.tileIndexes)
      this.getBlueprintItemsAtIndex(tileIndex).push(blueprintItem);
    for (let connection of blueprintItem.oniItem.utilityConnections) {
      let connectionPosition = Vector2.cloneNullToZero(connection.offset);
      connectionPosition = DrawHelpers.rotateVector2(
        connectionPosition,
        Vector2.Zero,
        blueprintItem.rotation
      );
      connectionPosition = DrawHelpers.scaleVector2(
        connectionPosition,
        Vector2.Zero,
        blueprintItem.scale
      );
      connectionPosition.x += blueprintItem.position.x;
      connectionPosition.y += blueprintItem.position.y;

      let newUtilityTracker: UtilityConnectionTracker = {
        blueprintItem: blueprintItem,
        utilityConnection: connection,
      };
      this.getUtilityConnectionsAtIndex(DrawHelpers.getTileIndex(connectionPosition)).push(
        newUtilityTracker
      );
      //console.log(this.getUtilityConnectionsAtIndex(DrawHelpers.getTileIndex(connectionPosition)))
    }

    this.emitItemAdded(blueprintItem);
  }

  public destroyBlueprintItem(templateItem: BlueprintItem) {
    // If the item is a wire, we need to disconnect it
    if (templateItem.oniItem.isWire) {
      let templateItemWire = templateItem as BlueprintItemWire;

      let connectionsArray = DrawHelpers.getConnectionArray(templateItemWire.connections);
      for (let i = 0; i < 4; i++) {
        if (connectionsArray[i]) {
          let offsetToModify = DrawHelpers.connectionVectors[i];
          let positionToModify = new Vector2(
            templateItem.position.x + offsetToModify.x,
            templateItem.position.y + offsetToModify.y
          );

          let itemsToModify = this.getBlueprintItemsAt(positionToModify).filter(
            i => i.oniItem.objectLayer == templateItem.oniItem.objectLayer
          );
          for (let itemToModify of itemsToModify) {
            let itemToModifyWire = itemToModify as BlueprintItemWire;

            if (itemToModifyWire != null) {
              let connectionsArrayToModify = DrawHelpers.getConnectionArray(
                itemToModifyWire.connections
              );
              connectionsArrayToModify[DrawHelpers.connectionBitsOpposite[i]] = false;
              itemToModifyWire.connections = DrawHelpers.getConnection(connectionsArrayToModify);
            }
          }
        }
      }
    }

    // First remove from the tilemap
    if (templateItem.tileIndexes != null && templateItem.tileIndexes.length > 0)
      for (let tileIndex of templateItem.tileIndexes) {
        const indexInTileMap = this.templateTiles[tileIndex].indexOf(templateItem, 0);
        if (indexInTileMap > -1) this.templateTiles[tileIndex].splice(indexInTileMap, 1);
      }

    // Then from the utility map
    for (let connection of templateItem.oniItem.utilityConnections) {
      let connectionPosition = Vector2.cloneNullToZero(connection.offset);
      connectionPosition = DrawHelpers.rotateVector2(
        connectionPosition,
        Vector2.Zero,
        templateItem.rotation
      );
      connectionPosition = DrawHelpers.scaleVector2(
        connectionPosition,
        Vector2.Zero,
        templateItem.scale
      );
      connectionPosition.x += templateItem.position.x;
      connectionPosition.y += templateItem.position.y;

      let utilitiesAtPosition = this.getUtilityConnectionsAtIndex(
        DrawHelpers.getTileIndex(connectionPosition)
      );
      for (let index = 0; index < utilitiesAtPosition.length; index++) {
        if (
          utilitiesAtPosition[index].blueprintItem == templateItem &&
          utilitiesAtPosition[index].utilityConnection == connection
        ) {
          utilitiesAtPosition.splice(index, 1);
          break;
        }
      }
      //console.log(utilitiesAtPosition)
    }

    // Then remove from the item list,
    const index = this.blueprintItems.indexOf(templateItem, 0);
    if (index > -1) this.blueprintItems.splice(index, 1);

    // Then destroy the sprite
    templateItem.destroy();

    // Then fire the events
    this.emitItemDestroyed();
  }

  public getBlueprintItemsAt(position: Vector2): BlueprintItem[] {
    let arrayIndex = DrawHelpers.getTileIndex(position);
    return this.getBlueprintItemsAtIndex(arrayIndex);
  }

  public getBlueprintItemsAtIndex(index: number): BlueprintItem[] {
    if (this.templateTiles == null) this.templateTiles = [];

    let returnValue = this.templateTiles[index];
    if (returnValue == null) {
      returnValue = [];
      this.templateTiles[index] = returnValue;
    }

    return returnValue;
  }

  public getUtilityConnectionsAtIndex(index: number): UtilityConnectionTracker[] {
    if (this.utilities == null) this.utilities = [];

    let returnValue = this.utilities[index];
    if (returnValue == null) {
      returnValue = [];
      this.utilities[index] = returnValue;
    }

    return returnValue;
  }

  // Sometimes we need to pause the events (when lots of changes are happening at once)
  private pauseChangeEvents_: boolean = false;
  public pauseChangeEvents() {
    this.pauseChangeEvents_ = true;
  }
  public resumeChangeEvents(emitChanges: boolean = true) {
    this.pauseChangeEvents_ = false;
    if (emitChanges) this.emitBlueprintChanged();
  }

  observersBlueprintChanged: IObsBlueprintChange[];
  public subscribeBlueprintChanged(observer: IObsBlueprintChange) {
    this.observersBlueprintChanged.push(observer);
  }

  private emitItemDestroyed() {
    if (!this.pauseChangeEvents_) {
      this.observersBlueprintChanged.map(observer => {
        observer.itemDestroyed();
      });
      this.emitBlueprintChanged();
    }
  }

  private emitItemAdded(blueprintItem: BlueprintItem) {
    if (!this.pauseChangeEvents_) {
      this.observersBlueprintChanged.map(observer => {
        observer.itemAdded(blueprintItem);
      });
      this.emitBlueprintChanged();
    }
  }

  public emitBlueprintChanged() {
    if (!this.pauseChangeEvents_) {
      this.observersBlueprintChanged.map(observer => {
        observer.blueprintChanged();
      });

      for (let blueprintItem of this.blueprintItems) blueprintItem.updateTileables(this);
    }
  }

  public toMdbBlueprint(): MdbBlueprint {
    let returnValue: MdbBlueprint = {
      blueprintItems: [],
    };

    if (this.planningToolShapes.length > 0)
      returnValue.planningToolShapes = this.planningToolShapes.map(shape => ({ ...shape }));

    if (this.worldNotes.length > 0)
      returnValue.worldNotes = this.worldNotes.map(note => ({ ...note }));

    if (this.terrainFeatures.length > 0)
      returnValue.terrainFeatures = this.terrainFeatures.map(feature => ({ ...feature }));

    if (Object.keys(this.foreignMetadata).length > 0)
      returnValue.foreignMetadata = { ...this.foreignMetadata };

    for (let originalTemplateItem of this.blueprintItems)
      returnValue.blueprintItems.push(originalTemplateItem.toMdbBuilding());

    return returnValue;
  }

  public toBniBlueprint(friendlyname: string): BniBlueprint {
    let returnValue: BniBlueprint = {
      friendlyname: friendlyname,
      buildings: [],
      digcommands: [],
    };

    for (let originalTemplateItem of this.blueprintItems)
      if (originalTemplateItem.id != OniItem.elementId && originalTemplateItem.id != OniItem.infoId)
        returnValue.buildings.push(originalTemplateItem.toBniBuilding());

    if (this.planningToolShapes.length > 0) {
      returnValue.blueprintVersion = 3;
      returnValue.planningtoolmod_shapecollection = this.planningToolShapes.map(shape => ({
        ...shape,
      }));
      // Planning Tool shapes are represented by dig commands in BlueprintsV2.
      returnValue.digcommands = this.planningToolShapes.map(({ x, y }) => ({ x, y }));
    }

    if (this.worldNotes.length > 0) {
      returnValue.blueprintVersion = 3;
      returnValue.worldNotes = this.worldNotes.map(note => ({ ...note }));
    }

    // Terrain annotations ride in `metadata`, which the mod's SanitizePositions()
    // does not re-origin — so normalize here, before encoding, and shift the
    // annotations by the very same offset. That makes the mod's pass a no-op on
    // this file and keeps the markers glued to the buildings they annotate.
    const terrainFeatures = this.terrainFeatures.map(feature => ({ ...feature }));
    const offset = modSanitizeOffset(returnValue);
    if (offset != null) {
      applySanitizeOffset(returnValue, offset);
      for (const feature of terrainFeatures) {
        feature.x += offset.x;
        feature.y += offset.y;
      }
    }

    // Written even when we have no terrain of our own: foreign keys must
    // survive a re-save, and encodeTerrainFeatures returns undefined (omitting
    // the block, as the mod does) only when nothing at all is left to write.
    const metadata = encodeTerrainFeatures(this.foreignMetadata, terrainFeatures);
    if (metadata != null) {
      returnValue.blueprintVersion = 3;
      returnValue.metadata = metadata;
    }

    return returnValue;
  }

  public clone(): Blueprint {
    let mdb = this.toMdbBlueprint();

    let returnValue = new Blueprint();
    returnValue.importFromMdb(mdb);

    return returnValue;
  }

  public getBoundingBox(): Vector2[] {
    let topLeft = new Vector2(9999, 9999);
    let bottomRight = new Vector2(-9999, -9999);

    this.blueprintItems.map(item => {
      item.tileIndexes.map(index => {
        let position = DrawHelpers.getTilePosition(index);
        if (topLeft.x > position.x) topLeft.x = position.x;
        if (topLeft.y > position.y) topLeft.y = position.y;
        if (bottomRight.x < position.x) bottomRight.x = position.x;
        if (bottomRight.y < position.y) bottomRight.y = position.y;
      });
    });

    this.planningToolShapes.forEach(shape => {
      if (topLeft.x > shape.x) topLeft.x = shape.x;
      if (topLeft.y > shape.y) topLeft.y = shape.y;
      if (bottomRight.x < shape.x) bottomRight.x = shape.x;
      if (bottomRight.y < shape.y) bottomRight.y = shape.y;
    });

    this.worldNotes.forEach(note => {
      if (topLeft.x > note.x) topLeft.x = note.x;
      if (topLeft.y > note.y) topLeft.y = note.y;
      if (bottomRight.x < note.x) bottomRight.x = note.x;
      if (bottomRight.y < note.y) bottomRight.y = note.y;
    });

    // Terrain annotations frame like any other content — a blueprint that is
    // only geysers still needs a sensible extent to centre the camera on. Their
    // footprint extends up and right from the anchor cell (bottom-left).
    this.terrainFeatures.forEach(feature => {
      const size = TerrainFeature.getFeature(feature.id);
      const right = feature.x + (size != null ? size.width - 1 : 0);
      const top = feature.y + (size != null ? size.height - 1 : 0);
      if (topLeft.x > feature.x) topLeft.x = feature.x;
      if (topLeft.y > feature.y) topLeft.y = feature.y;
      if (bottomRight.x < right) bottomRight.x = right;
      if (bottomRight.y < top) bottomRight.y = top;
    });

    return [topLeft, bottomRight];
  }

  public sortChildren() {
    for (let blueprintItem of this.blueprintItems) blueprintItem.sortChildren();
  }

  public destroy(emitChanges: boolean = true) {
    if (this.blueprintItems != null) {
      let blueprintItemsCopy: BlueprintItem[] = [];

      for (let b of this.blueprintItems) blueprintItemsCopy.push(b);

      this.pauseChangeEvents();
      for (let b of blueprintItemsCopy) this.destroyBlueprintItem(b);
      this.resumeChangeEvents(emitChanges);
    }
  }
}

export interface IObsBlueprintChange {
  itemDestroyed(): void;
  itemAdded(blueprintItem: BlueprintItem): void;
  blueprintChanged(): void;
}
