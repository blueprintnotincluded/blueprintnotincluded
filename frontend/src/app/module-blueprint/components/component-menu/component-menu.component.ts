import {
  Component,
  EventEmitter,
  Inject,
  LOCALE_ID,
  OnInit,
  Output,
} from "@angular/core";
import { Router } from "@angular/router";
import { MenuItem, MessageService } from "primeng/api";
import {
  CameraService,
  Display,
  DrawHelpers,
  IObsCameraChanged,
  Overlay,
  Visualization,
} from "../../../../../../lib/index";
import { ToolType } from "../../common/tools/tool";
import { AuthenticationService } from "../../services/authentification-service";
import {
  BlueprintFileType,
  BlueprintService,
} from "../../services/blueprint-service";
import { IObsToolChanged, ToolService } from "../../services/tool-service";

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
  
})
export class ComponentMenuComponent
  implements OnInit, IObsToolChanged, IObsCameraChanged
{
  @Output() menuCommand = new EventEmitter<MenuCommand>();

  menuItems: MenuItem[];
  overlayMenuItems: MenuItem[];
  displayMenuItems: MenuItem[];
  visualizationMenuItems: MenuItem[];
  toolMenuItems: MenuItem[];
  languagesMenuItems: MenuItem[];

  static debugFps: number = 0;
  public getFps() {
    return ComponentMenuComponent.debugFps;
  }

  private cameraService: CameraService;

  constructor(
    //TODO should not be public
    public authService: AuthenticationService,
    private messageService: MessageService,
    private toolService: ToolService,
    private blueprintService: BlueprintService,
    private router: Router,
    @Inject(LOCALE_ID) private locale: string
  ) {
    this.toolService.subscribeToolChanged(this);
    this.cameraService = CameraService.cameraService;
    this.cameraService.subscribeCameraChange(this);
  }

  // TODO this causes errors
  get dynamicMenuItems() {
    let blueprintMenuItems = this.menuItems.find((i) => i.id == "blueprint")
      .items as MenuItem[];
    blueprintMenuItems.find((i) => i.id == "save").disabled =
      !this.authService.isLoggedIn();
    return this.menuItems;
  }

  ngOnInit() {
    let overlayList: { id: Overlay; name: string }[] = [
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
    ];
    this.overlayMenuItems = [];
    overlayList.map((overlay) => {
      this.overlayMenuItems.push({
        label: overlay.name,
        id: overlay.id.toString(),
        command: (event) => {
          this.clickOverlay(event);
        },
      });
    });

    this.displayMenuItems = [];
    this.displayMenuItems.push({
      label: $localize`Blueprint`,
      id: Display.blueprint.toString(),
      command: (event) => {
        this.clickDisplay(event);
      },
    });
    this.displayMenuItems.push({
      label: $localize`Color`,
      id: Display.solid.toString(),
      command: (event) => {
        this.clickDisplay(event);
      },
    });

    this.visualizationMenuItems = [];
    this.visualizationMenuItems.push({
      label: $localize`None`,
      id: Visualization.none.toString(),
      command: (event) => {
        this.clickVisualization(event);
      },
    });
    this.visualizationMenuItems.push({
      label: $localize`Temperature`,
      id: Visualization.temperature.toString(),
      command: (event) => {
        this.clickVisualization(event);
      },
    });
    this.visualizationMenuItems.push({
      label: $localize`Elements`,
      id: Visualization.elements.toString(),
      command: (event) => {
        this.clickVisualization(event);
      },
    });

    this.toolMenuItems = [
      {
        label: $localize`Select`,
        id: ToolType[ToolType.select],
        command: (event) => {
          this.clickTool(ToolType.select);
        },
      },
      {
        label: $localize`Build`,
        id: ToolType[ToolType.build],
        command: (event) => {
          this.clickTool(ToolType.build);
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
            command: (event) => {
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
            command: (event) => {
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
                command: (event) => {
                  this.uploadYamlTemplate();
                },
              },
              {
                label: $localize`Blueprint (json)`,
                command: (event) => {
                  this.uploadJsonTemplate();
                },
              },
              {
                label: $localize`Blueprint (binary)`,
                command: (event) => {
                  this.uploadBsonTemplate();
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
                command: (event) => {
                  this.menuCommand.emit({
                    type: MenuCommandType.exportBlueprint,
                    data: null,
                  });
                },
              },
            ],
          },
          {
            label: $localize`Browse`,
            icon: "pi pi-search",
            command: (event) => {
              this.menuCommand.emit({
                type: MenuCommandType.browseBlueprints,
                data: null,
              });
            },
          },
          {
            label: $localize`Get shareable Url`,
            icon: "pi pi-share-alt",
            command: (event) => {
              this.menuCommand.emit({
                type: MenuCommandType.getShareableUrl,
                data: null,
              });
            },
          },
          {
            label: $localize`Export images`,
            icon: "pi pi-images",
            command: (event) => {
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
            command: (event) => {
              this.blueprintService.undo();
            },
          },
          {
            label: $localize`Redo`,
            icon: "pi pi-replay",
            command: (event) => {
              this.blueprintService.redo();
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
        label: $localize`More`,
        items: [
          {
            label: $localize`About`,
            icon: "pi pi-info-circle",
            command: (event) => {
              this.menuCommand.emit({
                type: MenuCommandType.about,
                data: null,
              });
            },
          },
          {
            label: $localize`Discord`,
            icon: "fab fa-discord",
            url: "https://discord.gg/9gYwKaRujK",
            target: "discord",
          },
          {
            label: $localize`Github`,
            icon: "fab fa-github",
            url: "https://github.com/Sinetheta/blueprintnotincluded",
            target: "github",
          },
        ],
      },
      {
        label:
          ALL_LANGUAGES.find((l) => l.code === this.locale)?.name ||
          this.locale,
        items: this.languagesMenuItems,
      },

      /*
      // This is done on the node backend now
      ,{
        label: 'Technical',
        items: [
          {label: 'Fetch images',          icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.fetchIcons, data:null}); } },
          {label: 'Add element tiles',     icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.addElementsTiles, data:null}); } },
          {label: 'Download groups',       icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.downloadGroups, data:null}); } },
          {label: 'Download icons',        icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.downloadIcons, data:null}); } },
          {label: 'Download white',        icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.downloadUtility, data:null}); } },
          {label: 'Repack textures',       icon:'pi pi-download', command: (event) => { this.menuCommand.emit({type: MenuCommandType.repackTextures, data:null}); } }
        ]
      }
      */
    ];

    this.clickOverlay({ item: { id: Overlay.Base } });
    this.clickDisplay({ item: { id: Display.solid } });
    this.clickVisualization({ item: { id: Visualization.none } });
    this.clickTool(ToolType.select);
  }

  toolChanged(toolType: ToolType) {
    this.updateToolIcon();
  }

  updateToolIcon() {
    for (let menuItem of this.toolMenuItems) {
      if (!menuItem.separator) {
        if (this.toolService.getTool(ToolType[menuItem.id]).visible)
          menuItem.icon = "pi pi-fw pi-check";
        else menuItem.icon = "pi pi-fw pi-none";
      }
    }
  }

  clickTool(toolType: ToolType) {
    this.toolService.changeTool(toolType);
  }

  userProfile() {
    let userFilter: BrowseData = {
      filterUserId: this.authService.getUserDetails()._id,
      filterUserName: this.authService.getUserDetails().username,
      getDuplicates: true,
    };

    this.menuCommand.emit({
      type: MenuCommandType.browseBlueprints,
      data: userFilter,
    });
  }

  cameraChanged(camera: CameraService) {
    this.updateOverlayIcon(camera.overlay);
    this.updateVisualizationIcon(camera.visualization);
    this.updateDisplayIcon(camera.display);
  }

  updateOverlayIcon(overlay: Overlay) {
    for (let menuItem of this.overlayMenuItems) {
      if (menuItem.id == overlay.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  updateDisplayIcon(display: Display) {
    for (let menuItem of this.displayMenuItems) {
      if (menuItem.id == display.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  updateVisualizationIcon(visualization: Visualization) {
    for (let menuItem of this.visualizationMenuItems) {
      if (menuItem.id == visualization.toString()) {
        menuItem.icon = "pi pi-fw pi-check";
      } else menuItem.icon = "pi pi-fw pi-none";
    }
  }

  clickOverlay(event: any) {
    this.cameraService.overlay = event.item.id as Overlay;
  }

  clickDisplay(event: any) {
    this.cameraService.display = event.item.id as Display;
  }

  clickVisualization(event: any) {
    this.cameraService.visualization = event.item.id as Visualization;
  }

  uploadYamlTemplate() {
    let fileElem = document.getElementById("fileChooser") as HTMLInputElement;
    fileElem.click();
  }

  uploadJsonTemplate() {
    let fileElem = document.getElementById(
      "fileChooserJson"
    ) as HTMLInputElement;
    fileElem.click();
  }

  uploadBsonTemplate() {
    let fileElem = document.getElementById(
      "fileChooserBson"
    ) as HTMLInputElement;
    fileElem.click();
  }

  templateUpload(event: any) {
    let fileElem = document.getElementById("fileChooser") as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.YAML,
      fileElem.files
    );
    fileElem.value = "";
  }

  templateUploadJson(event: any) {
    let fileElem = document.getElementById(
      "fileChooserJson"
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.JSON,
      fileElem.files
    );
    fileElem.value = "";
  }

  templateUploadBson(event: any) {
    let fileElem = document.getElementById(
      "fileChooserBson"
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.BSON,
      fileElem.files
    );
    fileElem.value = "";
  }

  login() {
    this.menuCommand.emit({
      type: MenuCommandType.showLoginDialog,
      data: null,
    });
  }

  logout() {
    this.authService.logout();
    this.messageService.add({
      severity: "success",
      summary: $localize`Logout Successful`,
      detail: null,
    });
  }
}

export enum MenuCommandType {
  newBlueprint,
  uploadBlueprint,
  uploadYaml,
  changeTool,
  changeOverlay,
  about,

  browseBlueprints,
  saveBlueprint,
  getShareableUrl,
  exportImages,
  exportBlueprint,

  fetchIcons,
  downloadIcons,
  downloadGroups,
  downloadUtility,
  repackTextures,
  addElementsTiles,

  showLoginDialog,
}

export class MenuCommand {
  type: MenuCommandType;
  data: any;
}

export interface BrowseData {
  filterUserId: string;
  filterUserName: string;
  getDuplicates: boolean;
}
