import { HttpClient } from "@angular/common/http";
import {
  Component,
  ElementRef,
  OnInit,
  Renderer2,
  ViewChild,
} from "@angular/core";
// Library imports
import { ActivatedRoute, Params, UrlSegment } from "@angular/router";
import * as JSZip from "jszip";
import { MessageService } from "primeng/api";
import {} from "sanitize-filename";
import {
  BBuilding,
  Blueprint,
  BSpriteInfo,
  BSpriteModifier,
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  CameraService,
  ImageSource,
  OniItem,
  Overlay,
  SpriteInfo,
  SpriteModifier,
  Vector2,
} from "../../../../../../lib/index";
import { ToolType } from "../../common/tools/tool";
import { AuthenticationService } from "../../services/authentification-service";
import {
  BlueprintService,
  ExportImageOptions,
  IObsBlueprintChanged,
} from "../../services/blueprint-service";
import { GameStringService } from "../../services/game-string-service";
import { ToolService } from "../../services/tool-service";
import { ComponentCanvasComponent } from "../component-canvas/component-canvas.component";
import {
  BrowseData,
  MenuCommand,
  MenuCommandType,
} from "../component-menu/component-menu.component";
import { ComponentSaveDialogComponent } from "../dialogs/component-save-dialog/component-save-dialog.component";
import { DialogAboutComponent } from "../dialogs/dialog-about/dialog-about.component";
import { DialogBrowseComponent } from "../dialogs/dialog-browse/dialog-browse.component";
import { DialogExportImagesComponent } from "../dialogs/dialog-export-images/dialog-export-images.component";
import { DialogShareUrlComponent } from "../dialogs/dialog-share-url/dialog-share-url.component";
import { ComponentSideBuildToolComponent } from "../side-bar/build-tool/build-tool.component";
import { ComponentSideSelectionToolComponent } from "../side-bar/selection-tool/selection-tool.component";
import { ComponentLoginDialogComponent } from "../user-auth/login-dialog/login-dialog.component";
var sanitize = require("sanitize-filename");

/*
TODO Feature List before release :

 * Filter author on browse
 * Toast on blueprint error, nb item skipped
 * save camera offset and zoom on save + shared code on save
 *

 Less important stuff :
 * Unify returns in backend
 * dragBuild is not used
 * build drag on move with keyboard
 *
 *

*/

@Component({
  selector: "app-component-blueprint-parent",
  templateUrl: "./component-blueprint-parent.component.html",
  styleUrls: ["./component-blueprint-parent.component.css"],
  providers: [MessageService],
  standalone: false,
})
export class ComponentBlueprintParentComponent
  implements OnInit, IObsBlueprintChanged
{
  @ViewChild("canvas", { static: true })
  canvas: ComponentCanvasComponent;

  @ViewChild("buildTool", { static: false })
  buildTool: ComponentSideBuildToolComponent;

  @ViewChild("saveDialog", { static: false })
  saveDialog: ComponentSaveDialogComponent;

  @ViewChild("browseDialog", { static: false })
  browseDialog: DialogBrowseComponent;

  @ViewChild("loginDialog", { static: false })
  loginDialog: ComponentLoginDialogComponent;

  @ViewChild("exportImagesDialog", { static: false })
  exportImagesDialog: DialogExportImagesComponent;

  @ViewChild("shareUrlDialog", { static: false })
  shareUrlDialog: DialogShareUrlComponent;

  @ViewChild("aboutDialog")
  aboutDialog: DialogAboutComponent;

  // The left ui panel is not static, because when in a iframe we don't load it
  @ViewChild("sidePanelLeft", { static: false })
  sidePanelLeft: ElementRef;

  @ViewChild("selectionTool", { static: false })
  selectionTool: ComponentSideSelectionToolComponent;

  constructor(
    private messageService: MessageService,
    private route: ActivatedRoute,
    private authService: AuthenticationService,
    private blueprintService: BlueprintService,
    public toolService: ToolService,
    private renderer: Renderer2,
    private http: HttpClient,
    public gameStringService: GameStringService
  ) {}

  get showElementReport() {
    if (CameraService.cameraService == null) return false;
    else return CameraService.cameraService.showElementReport;
  }

  get showTemperatureScale() {
    if (CameraService.cameraService == null) return false;
    else return CameraService.cameraService.showTemperatureScale;
  }

  forceSize: boolean = false;
  forcedSize: Vector2 = Vector2.zero();

  ngOnInit() {
    this.route.params.subscribe((params: Params): void => {
      let width = Number(params.width);
      let height = Number(params.height);
      if (Number.isInteger(width) && Number.isInteger(height)) {
        this.forceSize = true;
        this.forcedSize = new Vector2(width, height);
      } else this.forceSize = false;
    });

    SpriteModifier.init();
    OniItem.init();
    ImageSource.init();
    SpriteInfo.init();
    BuildMenuCategory.init();
    BuildMenuItem.init();
    BuildableElement.init();

    this.blueprintService.subscribeBlueprintChanged(this);

    this.fetchDatabase().then(() => {
      if (!this.forceSize) {
        this.buildTool.oniItemsLoaded();
      }

      this.route.url.subscribe((url: UrlSegment[]) => {
        if (url != null && url.length > 0 && url[0].path == "browse") {
          this.browseDialog.showDialog();
        } else if (url != null && url.length > 0 && url[0].path == "about") {
          this.aboutDialog.visible = true;
        } else if (
          url != null &&
          url.length > 1 &&
          url[0].path == "openfromurl"
        ) {
          this.blueprintService.loadUrlBlueprint(url[1].path);
        }
      });

      this.route.params.subscribe((params: Params): void => {
        if (params.id != null)
          this.blueprintService.openBlueprintFromId(params.id);
      });
    }); /*
      .catch((error) => {
        this.messageService.add({
          severity: 'error',
          summary: $localize`Error loading database`,
          detail: error,
          sticky: true
        });
      });
    */
    this.renderer.listen("window", "load", () => {
      this.resizeTools();
    });
    this.renderer.listen("window", "resize", () => {
      this.resizeTools();
    });
  }

  resizeTools() {
    if (!this.forceSize) {
      let sidePanelPosition: number =
        this.sidePanelLeft.nativeElement.getBoundingClientRect().y;
      this.selectionTool.setMaxHeight(sidePanelPosition);
    }
  }

  blueprintChanged(blueprint: Blueprint) {
    this.loadTemplateIntoCanvas(blueprint);
  }

  database: any;
  fetchDatabase(): Promise<any> {
    let promise = new Promise((resolve, reject) => {
      // Start comment here
      this.http
        .get("assets/database/database.zip", { responseType: "arraybuffer" })
        .subscribe((data) => {
          JSZip.loadAsync(data)
            .then((zipped) => {
              zipped.files["database.json"].async("text").then(async (text) => {
                let json = JSON.parse(text);

                this.database = json;

                let elements: BuildableElement[] = json.elements;
                for (const e of elements) {
                  const localizedName = await this.gameStringService.getStr(
                    `STRINGS.ELEMENTS.${e.id.toUpperCase()}.NAME`
                  );
                  if (!localizedName)
                    console.warn(`Missing element translation`, e);
                  e.name = localizedName || e.name;
                }
                BuildableElement.load(elements);

                let buildMenuCategories: BuildMenuCategory[] =
                  json.buildMenuCategories;
                for (const bm of buildMenuCategories) {
                  const localizedName = await this.gameStringService.getStr(
                    `STRINGS.UI.BUILDCATEGORIES.${bm.categoryName.toUpperCase()}.NAME`
                  );
                  if (!localizedName)
                    console.warn(`Missing buildMenuCategory translation`, bm);
                  bm.categoryShowName = localizedName || bm.categoryName;
                }
                BuildMenuCategory.load(buildMenuCategories);

                let buildMenuItems: BuildMenuItem[] = json.buildMenuItems;
                BuildMenuItem.load(buildMenuItems);

                let uiSprites: BSpriteInfo[] = json.uiSprites;
                SpriteInfo.load(uiSprites);

                let spriteModifiers: BSpriteModifier[] = json.spriteModifiers;
                SpriteModifier.load(spriteModifiers);

                let buildings: BBuilding[] = json.buildings;
                for (const b of buildings) {
                  const localizedName = await this.gameStringService.getStr(
                    `STRINGS.BUILDINGS.PREFABS.${b.prefabId.toUpperCase()}.NAME`
                  );
                  if (!localizedName)
                    console.warn(`Missing building translation`, b);
                  b.name = localizedName;
                }
                OniItem.load(buildings);

                resolve(0);
              });
            })
            .catch((error) => {
              reject(error);
            });
        });
      // End comment here

      /*
      // Start comment here
      fetch("/assets/database/database.json")
        .then(response => { return response.json(); })
        .then(json => {

          this.database = json;

          let elements: BuildableElement[] = json.elements;
          BuildableElement.load(elements);

          let buildMenuCategories: BuildMenuCategory[] = json.buildMenuCategories;
          BuildMenuCategory.load(buildMenuCategories);

          let buildMenuItems: BuildMenuItem[] = json.buildMenuItems;
          BuildMenuItem.load(buildMenuItems);

          let uiSprites: BSpriteInfo[] = json.uiSprites;
          SpriteInfo.load(uiSprites)

          let spriteModifiers: BSpriteModifier[] = json.spriteModifiers;
          SpriteModifier.load(spriteModifiers);

          let buildings: BBuilding[] = json.buildings;
          OniItem.load(buildings);

          resolve(0);
      })
      .catch((error) => {
        reject(error);
      });
      // End comment here
      */
    });

    return promise;
  }

  menuCommand(menuCommand: MenuCommand) {
    if (menuCommand.type == MenuCommandType.newBlueprint)
      this.blueprintService.newBlueprint();
    else if (menuCommand.type == MenuCommandType.showLoginDialog)
      this.loginDialog.showDialog();
    else if (menuCommand.type == MenuCommandType.browseBlueprints)
      this.browseBlueprints(menuCommand.data);
    else if (menuCommand.type == MenuCommandType.about)
      this.aboutDialog.toggleDialog();
    else if (menuCommand.type == MenuCommandType.getShareableUrl)
      this.shareUrl();
    else if (menuCommand.type == MenuCommandType.exportImages)
      this.exportImages();
    else if (menuCommand.type == MenuCommandType.saveBlueprint)
      this.saveBlueprint();
    else if (menuCommand.type == MenuCommandType.exportBlueprint)
      this.exportBlueprint();
    // Technical (repack, generate solid sprites, etc)
    else if (menuCommand.type == MenuCommandType.fetchIcons)
      this.canvas.fetchIcons();
    else if (menuCommand.type == MenuCommandType.downloadIcons)
      this.canvas.downloadIcons();
    else if (menuCommand.type == MenuCommandType.downloadGroups)
      this.canvas.downloadGroups(this.database);
    else if (menuCommand.type == MenuCommandType.downloadUtility)
      this.canvas.downloadUtility(this.database);
    else if (menuCommand.type == MenuCommandType.repackTextures)
      this.canvas.repackTextures(this.database);
    else if (menuCommand.type == MenuCommandType.addElementsTiles)
      this.addElementsTiles();
  }

  saveImages(exportOptions: ExportImageOptions) {
    this.canvas.saveImages(exportOptions);
  }

  loadTemplateIntoCanvas(template: Blueprint) {
    this.canvas.loadNewBlueprint(template);
    CameraService.cameraService.overlay = Overlay.Base;
    this.toolService.changeTool(ToolType.select);

    // TODO error handling
    this.messageService.add({
      severity: "success",
      summary: $localize`Loaded blueprint: ${this.blueprintService.name}`,
      detail: $localize`${template.blueprintItems.length} items loaded`,
    });
  }

  saveBlueprint() {
    if (!this.authService.isLoggedIn())
      this.messageService.add({
        severity: "error",
        summary: $localize`Not logged in`,
        detail: $localize`You must be logged in to be able to save blueprints`,
      });
    else if (this.blueprintService.blueprint.blueprintItems.length == 0)
      this.messageService.add({
        severity: "error",
        summary: $localize`Empty blueprint`,
        detail: $localize`Add some buildings before trying to save`,
      });
    else {
      this.updateThumbnail();
      this.saveDialog.showDialog();
    }
  }

  exportBlueprint() {
    if (this.blueprintService.blueprint.blueprintItems.length == 0)
      this.messageService.add({
        severity: "error",
        summary: $localize`Empty blueprint`,
        detail: $localize`Add some buildings before trying to save`,
      });
    else {
      let friendlyname = "new blueprint";
      if (this.blueprintService.name != undefined)
        friendlyname = this.blueprintService.name;

      let bniBlueprint =
        this.blueprintService.blueprint.toBniBlueprint(friendlyname);

      let a = document.createElement("a");
      document.body.append(a);
      a.download = sanitize(friendlyname) + ".blueprint";
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(bniBlueprint)], {})
      );
      a.click();
      a.remove();
    }
  }

  updateThumbnail() {
    this.canvas.updateThumbnail();
  }

  shareUrl() {
    if (this.blueprintService.id == null)
      this.messageService.add({
        severity: "error",
        summary: $localize`Blueprint not saved`,
        detail: $localize`Save this blueprint to share it with others`,
      });
    else this.shareUrlDialog.showDialog();
  }

  browseBlueprints(data: any) {
    let browseData = data as BrowseData;
    if (browseData != null)
      this.browseDialog.showDialog(
        browseData.filterUserId,
        browseData.filterUserName,
        browseData.getDuplicates
      );
    else this.browseDialog.showDialog();
  }

  // TODO toast on save and generate url also
  exportImages() {
    if (this.blueprintService.blueprint.blueprintItems.length == 0)
      this.messageService.add({
        severity: "error",
        summary: $localize`Empty blueprint`,
        detail: $localize`Add some buildings before trying to export images`,
      });
    else this.exportImagesDialog.showDialog();
  }

  addElementsTiles() {
    /*

    Ui Sprites
  {
      "name": "gas_tile_front",
      "uvMin": {
        "x": 0,
        "y": 0
      },
      "uvSize": {
        "x": 128,
        "y": 128
      },
      "realSize": {
        "x": 100,
        "y": 100
      },
      "pivot": {
        "x": 1,
        "y": 0
      },
      "isIcon": false,
      "textureName": "gas_tile_front"
    },
  {
      "name": "liquid_tile_front",
      "uvMin": {
        "x": 0,
        "y": 0
      },
      "uvSize": {
        "x": 128,
        "y": 128
      },
      "realSize": {
        "x": 100,
        "y": 100
      },
      "pivot": {
        "x": 1,
        "y": 0
      },
      "isIcon": false,
      "textureName": "liquid_tile_front"
    },
  {
      "name": "vacuum_tile_front",
      "uvMin": {
        "x": 0,
        "y": 0
      },
      "uvSize": {
        "x": 128,
        "y": 128
      },
      "realSize": {
        "x": 100,
        "y": 100
      },
      "pivot": {
        "x": 1,
        "y": 0
      },
      "isIcon": false,
      "textureName": "vacuum_tile_front"
    },
  {
      "name": "gas_tile",
      "uvMin": {
        "x": 0,
        "y": 0
      },
      "uvSize": {
        "x": 128,
        "y": 128
      },
      "realSize": {
        "x": 100,
        "y": 100
      },
      "pivot": {
        "x": 1,
        "y": 0
      },
      "isIcon": false,
      "textureName": "gas_tile"
    },



    // Sprite Modifiers
    {
      "name": "gas_tile",
      "type": 0,
      "spriteInfoName": "gas_tile",
      "translation": {
        "x": 0,
        "y": 0
      },
      "scale": {
        "x": 1,
        "y": 1
      },
      "rotation": 0,
      "multColour": {
        "r": 1,
        "g": 1,
        "b": 1,
        "a": 1
      },
      "tags": [
        27
      ]
    },
  {
      "name": "gas_tile_front",
      "type": 0,
      "spriteInfoName": "gas_tile_front",
      "translation": {
        "x": 0,
        "y": 0
      },
      "scale": {
        "x": 1,
        "y": 1
      },
      "rotation": 0,
      "multColour": {
        "r": 1,
        "g": 1,
        "b": 1,
        "a": 1
      },
      "tags": [
        28
      ]
    },
  {
      "name": "liquid_tile_front",
      "type": 0,
      "spriteInfoName": "liquid_tile_front",
      "translation": {
        "x": 0,
        "y": 0
      },
      "scale": {
        "x": 1,
        "y": 1
      },
      "rotation": 0,
      "multColour": {
        "r": 1,
        "g": 1,
        "b": 1,
        "a": 1
      },
      "tags": [
        30
      ]
    },
  {
      "name": "vacuum_tile_front",
      "type": 0,
      "spriteInfoName": "liquid_tile_front",
      "translation": {
        "x": 0,
        "y": 0
      },
      "scale": {
        "x": 1,
        "y": 1
      },
      "rotation": 0,
      "multColour": {
        "r": 1,
        "g": 1,
        "b": 1,
        "a": 1
      },
      "tags": [
        30
      ]
    },
    */
  }
}
