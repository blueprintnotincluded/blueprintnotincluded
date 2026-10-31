import {
  Component,
  EventEmitter,
  Inject,
  LOCALE_ID,
  OnInit,
  Output,
} from "@angular/core";
import { MenuItem } from "primeng/api";
import {
  Blueprint,
  CameraService,
  Display,
  IObsCameraChanged,
  Overlay,
  ROCKET_INTERIOR_MODULES,
  RocketInteriorModule,
  Visualization,
} from "../../../../../../lib/index";
import { rocketInteriorLabel } from "../../common/rocket-interior-label";
import { ToolType } from "../../common/tools/tool";
import {
  BlueprintFileType,
  BlueprintService,
  IObsBlueprintChanged,
} from "../../services/blueprint-service";
import { IObsToolChanged, ToolService } from "../../services/tool-service";
import { AuthenticationService } from "../../services/authentification-service";
import { BrowseData } from "../user-menu/user-menu.component";

export { BrowseData } from "../user-menu/user-menu.component";

// Menu item ids for the rocket-interior choice: the prefix plus the module,
// or "none".
const ROCKET_INTERIOR_MENU_PREFIX = "rocket-interior:";

const ALL_LANGUAGES = [
  {
    code: "en-US",
    name: $localize`:language name here:en-US`,
  },
  {
    code: "zh-Hans",
    name: $localize`:language name here:zh-Hans`,
  },
  {
    code: "ru",
    name: $localize`:language name here:ru`,
  },
  {
    code: "ko",
    name: $localize`:language name here:ko`,
  },
];

@Component({
  selector: "app-component-menu",
  templateUrl: "./component-menu.component.html",
  styleUrls: ["./component-menu.component.css"],
  standalone: false,
})
export class ComponentMenuComponent
  implements OnInit, IObsToolChanged, IObsCameraChanged, IObsBlueprintChanged
{
  @Output() menuCommand = new EventEmitter<MenuCommand>();

  menuItems!: MenuItem[];
  overlayMenuItems!: MenuItem[];
  displayMenuItems!: MenuItem[];
  rocketInteriorMenuItems!: MenuItem[];
  visualizationMenuItems!: MenuItem[];
  toolMenuItems!: MenuItem[];
  languagesMenuItems!: MenuItem[];

  static debugFps: number = 0;
  public getFps() {
    return ComponentMenuComponent.debugFps;
  }

  private cameraService: CameraService;

  constructor(
    public authService: AuthenticationService,
    private toolService: ToolService,
    private blueprintService: BlueprintService,
    @Inject(LOCALE_ID) private locale: string,
  ) {
    this.toolService.subscribeToolChanged(this);
    this.cameraService = CameraService.cameraService;
    if (this.cameraService) this.cameraService.subscribeCameraChange(this);
    this.blueprintService.rocketInteriorChanged$.subscribe(() =>
      this.updateRocketInteriorIcon(),
    );
    this.blueprintService.subscribeBlueprintChanged(this);
  }

  blueprintChanged(_blueprint: Blueprint) {
    this.updateRocketInteriorIcon();
  }

  ngOnInit() {
    const overlayList: { id: Overlay; name: string }[] = [
      {
        id: Overlay.Base,
        name: $localize`:overlay switch on the menu:Buildings`,
      },
      { id: Overlay.Power, name: $localize`:overlay switch on the menu:Power` },
      {
        id: Overlay.Liquid,
        name: $localize`:overlay switch on the menu:Plumbing`,
      },
      {
        id: Overlay.Gas,
        name: $localize`:overlay switch on the menu:Ventilation`,
      },
      {
        id: Overlay.Automation,
        name: $localize`:overlay switch on the menu:Automation`,
      },
      {
        id: Overlay.Conveyor,
        name: $localize`:overlay switch on the menu:Shipment`,
      },
      { id: Overlay.Room, name: $localize`:overlay switch on the menu:Rooms` },
    ];
    this.overlayMenuItems = [];
    overlayList.map((overlay) => {
      this.overlayMenuItems.push({
        label: overlay.name,
        id: overlay.id.toString(),
        command: () => this.clickOverlay(overlay.id),
      });
    });

    this.displayMenuItems = [];
    this.displayMenuItems.push({
      label: $localize`Blueprint`,
      id: Display.blueprint.toString(),
      command: () => this.clickDisplay(Display.blueprint),
    });
    this.displayMenuItems.push({
      label: $localize`Color`,
      id: Display.solid.toString(),
      command: () => this.clickDisplay(Display.solid),
    });

    // Rocket interior: which habitat module's hull and landed backdrop to
    // draw behind the blueprint. A choice about the blueprint (stored with
    // its metadata on save), offered here so it can be previewed live.
    this.rocketInteriorMenuItems = [null, ...ROCKET_INTERIOR_MODULES].map(
      (module) => ({
        label: rocketInteriorLabel(module),
        id: ROCKET_INTERIOR_MENU_PREFIX + (module ?? "none"),
        command: (_event: any) => this.clickRocketInterior(module),
      }),
    );
    this.updateRocketInteriorIcon();

    this.visualizationMenuItems = [];
    this.visualizationMenuItems.push({
      label: $localize`None`,
      id: Visualization.none.toString(),
      command: () => this.clickVisualization(Visualization.none),
    });
    this.visualizationMenuItems.push({
      label: $localize`Temperature`,
      id: Visualization.temperature.toString(),
      command: () => this.clickVisualization(Visualization.temperature),
    });
    this.visualizationMenuItems.push({
      label: $localize`Elements`,
      id: Visualization.elements.toString(),
      command: () => this.clickVisualization(Visualization.elements),
    });

    this.toolMenuItems = [
      {
        label: $localize`Select`,
        id: ToolType[ToolType.select],
        command: (_event: any) => {
          this.clickTool(ToolType.select);
        },
      },
      {
        label: $localize`Build`,
        id: ToolType[ToolType.build],
        command: (_event: any) => {
          this.clickTool(ToolType.build);
        },
      },
      {
        label: $localize`Dig`,
        id: ToolType[ToolType.dig],
        command: (_event: any) => {
          this.clickTool(ToolType.dig);
        },
      },
    ];

    this.languagesMenuItems = [];
    for (const lang of ALL_LANGUAGES) {
      if (lang.code === this.locale) continue;
      this.languagesMenuItems.push({
        label: lang.name,
        url: (this.locale === "en-US" ? "/" : "/../") + lang.code,
      });
    }

    this.menuItems = [
      {
        id: "blueprint",
        label: $localize`Blueprint`,
        items: [
          {
            label: $localize`New`,
            icon: "pi pi-plus",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.newBlueprint,
                data: null,
              });
            },
          },
          {
            id: "save",
            label: $localize`Save`,
            icon: "pi pi-save",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.saveBlueprint,
                data: null,
              });
            },
          },
          {
            label: $localize`Upload`,
            icon: "pi pi-upload",
            items: [
              {
                label: $localize`Game (yaml)`,
                command: (_event: any) => {
                  this.uploadYamlTemplate();
                },
              },
              {
                label: $localize`Blueprint (json)`,
                command: (_event: any) => {
                  this.uploadJsonTemplate();
                },
              },
              {
                label: $localize`Blueprint (binary)`,
                command: (_event: any) => {
                  this.uploadBsonTemplate();
                },
              },
              {
                label: $localize`Blueprint (paste text)`,
                command: (_event: any) => {
                  this.menuCommand.emit({
                    type: MenuCommandType.importBlueprintText,
                    data: null,
                  });
                },
              },
            ],
          },
          {
            label: $localize`Download`,
            icon: "pi pi-download",
            items: [
              {
                label: $localize`Blueprint (json)`,
                command: (_event: any) => {
                  this.menuCommand.emit({
                    type: MenuCommandType.exportBlueprint,
                    data: null,
                  });
                },
              },
              {
                label: $localize`Blueprint (copy text)`,
                command: (_event: any) => {
                  this.menuCommand.emit({
                    type: MenuCommandType.exportBlueprintText,
                    data: null,
                  });
                },
              },
            ],
          },
          {
            label: $localize`Browse`,
            icon: "pi pi-search",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.browseBlueprints,
                data: null,
              });
            },
          },
          {
            label: $localize`Get shareable Url`,
            icon: "pi pi-share-alt",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.getShareableUrl,
                data: null,
              });
            },
          },
          {
            label: $localize`Export images`,
            icon: "pi pi-images",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.exportImages,
                data: null,
              });
            },
          },
        ],
      },
      {
        label: $localize`Edit`,
        items: [
          {
            label: $localize`Undo`,
            icon: "pi pi-undo",
            command: (_event: any) => {
              this.blueprintService.undo();
            },
          },
          {
            label: $localize`Redo`,
            icon: "pi pi-replay",
            command: (_event: any) => {
              this.blueprintService.redo();
            },
          },
          { separator: true },
          {
            label: $localize`Keyboard shortcuts`,
            icon: "pi pi-th-large",
            command: (_event: any) => {
              this.menuCommand.emit({
                type: MenuCommandType.keyboardShortcuts,
                data: null,
              });
            },
          },
        ],
      },
      {
        label: $localize`Tools`,
        items: this.toolMenuItems,
      },
      {
        label: $localize`Overlay`,
        items: this.overlayMenuItems,
      },
      {
        label: $localize`Visualization`,
        items: this.visualizationMenuItems,
      },
      {
        label: $localize`Display`,
        items: this.displayMenuItems,
      },
      {
        label: $localize`Rocket interior`,
        items: this.rocketInteriorMenuItems,
      },
      {
        label:
          ALL_LANGUAGES.find((l) => l.code === this.locale)?.name ||
          this.locale,
        items: this.languagesMenuItems,
      },
    ];

    this.clickOverlay(Overlay.Base);
    this.clickDisplay(Display.solid);
    this.clickVisualization(Visualization.none);
    this.clickTool(ToolType.select);
  }

  toolChanged(_toolType: ToolType) {
    this.updateToolIcon();
  }

  updateToolIcon() {
    for (const menuItem of this.toolMenuItems) {
      if (!menuItem.separator) {
        if (
          menuItem.id != null &&
          this.toolService.getTool(
            ToolType[menuItem.id as keyof typeof ToolType],
          ).visible
        )
          menuItem.icon = "pi pi-fw pi-check";
        else menuItem.icon = "pi pi-fw pi-none";
      }
    }
  }

  clickTool(toolType: ToolType) {
    this.toolService.changeTool(toolType);
  }

  cameraChanged(camera: CameraService) {
    this.updateOverlayIcon(camera.overlay);
    this.updateVisualizationIcon(camera.visualization);
    this.updateDisplayIcon(camera.display);
  }

  updateOverlayIcon(overlay: Overlay) {
    for (const menuItem of this.overlayMenuItems) {
      if (menuItem.id == overlay.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  updateDisplayIcon(display: Display) {
    for (const menuItem of this.displayMenuItems) {
      if (menuItem.id == display.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  updateVisualizationIcon(visualization: Visualization) {
    for (const menuItem of this.visualizationMenuItems) {
      if (menuItem.id == visualization.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  // Each item closes over its enum value rather than reading it back from
  // the PrimeNG item: MenuItem.id is a string, and a string assigned to the
  // camera passes every loose comparison the buildings make but fails the
  // strict ones the element-note fade makes (isElementOverlayPrimary), so
  // notes picked from this menu stayed dimmed until an F-key wrote a number.
  clickOverlay(overlay: Overlay) {
    if (this.cameraService) this.cameraService.overlay = overlay;
  }

  clickDisplay(display: Display) {
    if (this.cameraService) this.cameraService.display = display;
  }

  clickRocketInterior(module: RocketInteriorModule | null) {
    this.blueprintService.setRocketInterior(module);
  }

  // The checkmark follows whatever the open blueprint carries, wherever it
  // was set: here, in the save dialog (rocketInteriorChanged$), or by opening
  // a blueprint (blueprintChanged).
  updateRocketInteriorIcon() {
    if (this.rocketInteriorMenuItems == null) return;
    const current = this.blueprintService.metadata?.rocketInterior ?? null;
    for (const menuItem of this.rocketInteriorMenuItems)
      menuItem.icon =
        menuItem.id === ROCKET_INTERIOR_MENU_PREFIX + (current ?? "none")
          ? "pi pi-fw pi-check"
          : "pi pi-fw pi-none";
  }

  clickVisualization(visualization: Visualization) {
    if (this.cameraService) this.cameraService.visualization = visualization;
  }

  uploadYamlTemplate() {
    const fileElem = document.getElementById("fileChooser") as HTMLInputElement;
    fileElem.click();
  }

  uploadJsonTemplate() {
    const fileElem = document.getElementById(
      "fileChooserJson",
    ) as HTMLInputElement;
    fileElem.click();
  }

  uploadBsonTemplate() {
    const fileElem = document.getElementById(
      "fileChooserBson",
    ) as HTMLInputElement;
    fileElem.click();
  }

  templateUpload(_event: any) {
    const fileElem = document.getElementById("fileChooser") as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.YAML,
      fileElem.files!,
    );
    fileElem.value = "";
  }

  templateUploadJson(_event: any) {
    const fileElem = document.getElementById(
      "fileChooserJson",
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.JSON,
      fileElem.files!,
    );
    fileElem.value = "";
  }

  templateUploadBson(_event: any) {
    const fileElem = document.getElementById(
      "fileChooserBson",
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.BSON,
      fileElem.files!,
    );
    fileElem.value = "";
  }

  onUserMenuAbout() {
    this.menuCommand.emit({ type: MenuCommandType.about, data: null });
  }

  onUserMenuSendFeedback() {
    this.menuCommand.emit({ type: MenuCommandType.sendFeedback, data: null });
  }

  onMyBlueprintsRequested(data: BrowseData) {
    this.menuCommand.emit({ type: MenuCommandType.browseBlueprints, data });
  }
}

export enum MenuCommandType {
  newBlueprint,
  uploadBlueprint,
  uploadYaml,
  importBlueprintText,
  changeTool,
  changeOverlay,
  about,
  keyboardShortcuts,

  browseBlueprints,
  saveBlueprint,
  getShareableUrl,
  exportImages,
  exportBlueprint,
  exportBlueprintText,

  fetchIcons,
  downloadIcons,
  downloadGroups,
  downloadUtility,
  repackTextures,
  addElementsTiles,

  sendFeedback,
}

export class MenuCommand {
  type!: MenuCommandType;
  data: any;
}
