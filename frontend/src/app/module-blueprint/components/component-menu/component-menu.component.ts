import {
  Component,
  EventEmitter,
  Inject,
  LOCALE_ID,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { Menu } from "primeng/menu";
import { MenuItem, MessageService } from "primeng/api";
import {
  CameraService,
  Display,
  IObsCameraChanged,
  Overlay,
  Visualization,
} from "../../../../../../lib/index";
import { ToolType } from "../../common/tools/tool";
import { Router } from "@angular/router";
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
  standalone: false,
})
export class ComponentMenuComponent
  implements OnInit, IObsToolChanged, IObsCameraChanged
{
  @Output() menuCommand = new EventEmitter<MenuCommand>();

  @ViewChild("userMenu") userMenu!: Menu;

  menuItems!: MenuItem[];
  userMenuItems!: MenuItem[];
  overlayMenuItems!: MenuItem[];
  displayMenuItems!: MenuItem[];
  visualizationMenuItems!: MenuItem[];
  toolMenuItems!: MenuItem[];
  languagesMenuItems!: MenuItem[];

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
    const bpGroup = this.menuItems.find((i) => i.id == "blueprint");
    const blueprintMenuItems = bpGroup?.items as MenuItem[] | undefined;
    if (blueprintMenuItems) {
      const saveItem = blueprintMenuItems.find((i) => i.id == "save");
      if (saveItem) saveItem.disabled = !this.authService.isLoggedIn();
    }
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
        command: (event: any) => {
          this.clickOverlay(event);
        },
      });
    });

    this.displayMenuItems = [];
    this.displayMenuItems.push({
      label: $localize`Blueprint`,
      id: Display.blueprint.toString(),
      command: (event: any) => {
        this.clickDisplay(event);
      },
    });
    this.displayMenuItems.push({
      label: $localize`Color`,
      id: Display.solid.toString(),
      command: (event: any) => {
        this.clickDisplay(event);
      },
    });

    this.visualizationMenuItems = [];
    this.visualizationMenuItems.push({
      label: $localize`None`,
      id: Visualization.none.toString(),
      command: (event: any) => {
        this.clickVisualization(event);
      },
    });
    this.visualizationMenuItems.push({
      label: $localize`Temperature`,
      id: Visualization.temperature.toString(),
      command: (event: any) => {
        this.clickVisualization(event);
      },
    });
    this.visualizationMenuItems.push({
      label: $localize`Elements`,
      id: Visualization.elements.toString(),
      command: (event: any) => {
        this.clickVisualization(event);
      },
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
            command: (_event: any) => {
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
          {label: 'Fetch images',          icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.fetchIcons, data:null}); } },
          {label: 'Add element tiles',     icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.addElementsTiles, data:null}); } },
          {label: 'Download groups',       icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.downloadGroups, data:null}); } },
          {label: 'Download icons',        icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.downloadIcons, data:null}); } },
          {label: 'Download white',        icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.downloadUtility, data:null}); } },
          {label: 'Repack textures',       icon:'pi pi-download', command: (_event: any) => { this.menuCommand.emit({type: MenuCommandType.repackTextures, data:null}); } }
        ]
      }
      */
    ];

    const isAdmin = this.authService.getUserDetails()?.role === "admin";

    this.userMenuItems = [
      {
        label: $localize`My Blueprints`,
        icon: "pi pi-images",
        command: () => this.userProfile(),
      },
      {
        label: $localize`Switch account`,
        icon: "pi pi-refresh",
        command: () => this.switchAccount(),
      },
      { separator: true },
      {
        label: $localize`Send Feedback`,
        icon: "pi pi-comment",
        command: () =>
          this.menuCommand.emit({
            type: MenuCommandType.sendFeedback,
            data: null,
          }),
      },
      {
        label: $localize`Admin Panel`,
        icon: "pi pi-shield",
        command: () => this.openAdminPanel(),
        visible: isAdmin,
      },
      { separator: true },
      {
        label: $localize`Log out`,
        icon: "pi pi-sign-out",
        command: () => this.logout(),
      },
    ];

    this.clickOverlay({ item: { id: Overlay.Base } });
    this.clickDisplay({ item: { id: Display.solid } });
    this.clickVisualization({ item: { id: Visualization.none } });
    this.clickTool(ToolType.select);
  }

  openAdminPanel() {
    const adminWin = window.open("/admin", "_blank");
    if (!adminWin) return;
    // Receive the "ADMIN_READY" signal from the newly opened admin app, then
    // send the JWT back via postMessage so it never appears in the URL.
    const handler = (event: MessageEvent) => {
      if (event.source !== adminWin) return;
      if (event.data?.type !== "ADMIN_READY") return;
      window.removeEventListener("message", handler);
      const token = this.authService.getToken();
      if (token) {
        adminWin.postMessage({ type: "AUTH_TOKEN", token }, event.origin);
      }
    };
    window.addEventListener("message", handler);
  }

  toolChanged(_toolType: ToolType) {
    this.updateToolIcon();
  }

  updateToolIcon() {
    for (let menuItem of this.toolMenuItems) {
      if (!menuItem.separator) {
        if (
          menuItem.id != null &&
          this.toolService.getTool(
            ToolType[menuItem.id as keyof typeof ToolType]
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

  userProfile() {
    const user = this.authService.getUserDetails();
    if (!user) {
      return;
    }

    let userFilter: BrowseData = {
      filterUserId: user._id,
      filterUserName: user.username,
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

  templateUpload(_event: any) {
    let fileElem = document.getElementById("fileChooser") as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.YAML,
      fileElem.files!
    );
    fileElem.value = "";
  }

  templateUploadJson(_event: any) {
    let fileElem = document.getElementById(
      "fileChooserJson"
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.JSON,
      fileElem.files!
    );
    fileElem.value = "";
  }

  templateUploadBson(_event: any) {
    let fileElem = document.getElementById(
      "fileChooserBson"
    ) as HTMLInputElement;
    this.blueprintService.openBlueprintFromUpload(
      BlueprintFileType.BSON,
      fileElem.files!
    );
    fileElem.value = "";
  }

  login() {
    this.router.navigate(["/login"]);
  }

  switchAccount() {
    this.authService.logout();
    this.router.navigate(["/login"]);
  }

  logout() {
    this.authService.logout();
    this.messageService.add({
      severity: "success",
      summary: $localize`Logout Successful`,
      detail: undefined,
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

  sendFeedback,
}

export class MenuCommand {
  type!: MenuCommandType;
  data: any;
}

export interface BrowseData {
  filterUserId: string;
  filterUserName: string;
  getDuplicates: boolean;
}
