import {
  Component,
  OnInit,
  ViewChild,
  Output,
  EventEmitter,
} from "@angular/core";
import {
  BlueprintService,
  ExportImageOptions,
} from "src/app/module-blueprint/services/blueprint-service";
import { SelectItem } from "primeng/api";
import { Dropdown } from "primeng/dropdown";
import {
  CameraService,
  DrawHelpers,
  Vector2,
  Overlay,
} from "../../../../../../../lib/index";

@Component({
  selector: "app-dialog-export-images",
  templateUrl: "./dialog-export-images.component.html",
  styleUrls: ["./dialog-export-images.component.css"],
  
})
export class DialogExportImagesComponent implements OnInit {
  blueprintSize: Vector2;

  visible: boolean = false;

  pixelPerTile: SelectItem[];
  overlayOptions: SelectItem[];

  exportOptions: ExportImageOptions;

  get disabled() {
    return !(this.exportOptions.selectedOverlays.length > 0);
  }

  @Output() saveImages = new EventEmitter<ExportImageOptions>();

  get finalSize(): string {
    return this.blueprintSize == null
      ? ""
      : this.blueprintSize.x * this.exportOptions.pixelsPerTile +
          "x" +
          this.blueprintSize.y * this.exportOptions.pixelsPerTile;
  }
  get finalSizeMb(): number {
    return this.blueprintSize == null
      ? 0
      : this.blueprintSize.x *
          this.exportOptions.pixelsPerTile *
          this.blueprintSize.y *
          this.exportOptions.pixelsPerTile *
          this.exportOptions.selectedOverlays.length *
          0.00000068120021446078431372549;
  }

  private cameraService: CameraService;

  constructor(private blueprintService: BlueprintService) {
    this.cameraService = CameraService.cameraService;
    this.pixelPerTile = [16, 24, 32, 48, 64, 96, 128].map((px) => ({
      label: $localize`${px} pixels per tile`,
      value: px,
    }));

    this.exportOptions = {
      //selectedOverlays: [Overlay.Base],
      selectedOverlays: [
        Overlay.Base,
        Overlay.Power,
        Overlay.Liquid,
        Overlay.Gas,
        Overlay.Automation,
        Overlay.Conveyor,
      ],
      pixelsPerTile: this.pixelPerTile[2].value,
      gridLines: false,
    };
  }

  ngOnInit() {
    let overlayList: Overlay[] = [
      Overlay.Base,
      Overlay.Power,
      Overlay.Liquid,
      Overlay.Gas,
      Overlay.Automation,
      Overlay.Conveyor,
    ];

    this.overlayOptions = [];
    overlayList.map((overlay) => {
      this.overlayOptions.push({
        label: DrawHelpers.overlayString[overlay],
        value: overlay,
      });
    });
  }

  getOverlayUrl(overlay: Overlay) {
    return DrawHelpers.getOverlayUrl(overlay);
  }

  overlayString(overlay: Overlay) {
    return DrawHelpers.overlayString[overlay];
  }

  downloadImages() {
    this.saveImages.emit(this.exportOptions);
    this.hideDialog();
  }

  hideDialog() {
    this.visible = false;
  }

  showDialog() {
    this.visible = true;

    let boundingBox = this.blueprintService.blueprint.getBoundingBox();
    let topLeft = boundingBox[0];
    let bottomRight = boundingBox[1];
    this.blueprintSize = new Vector2(
      bottomRight.x - topLeft.x + 3,
      bottomRight.y - topLeft.y + 3
    );
  }
}
