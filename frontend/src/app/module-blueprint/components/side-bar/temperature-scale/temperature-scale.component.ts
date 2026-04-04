import { Component } from "@angular/core";
import {
  CameraService,
  DrawHelpers,
  TemperatureThreshold,
  Visualization,
} from "../../../../../../../lib/index";
import { GameStringService } from "../../../services/game-string-service";

@Component({
  selector: "app-temperature-scale",
  templateUrl: "./temperature-scale.component.html",
  styleUrls: ["./temperature-scale.component.css"],
  standalone: false,
})
export class TemperatureScaleComponent {
  temperatureData: TemperatureThreshold[];

  private cameraService: CameraService;

  constructor(public gameStringService: GameStringService) {
    this.cameraService = CameraService.cameraService;

    this.temperatureData = [];
    for (let i = DrawHelpers.temperatureThresholds.length - 2; i >= 0; i--)
      this.temperatureData.push(DrawHelpers.temperatureThresholds[i]);
  }

  temperatureColor(index: number) {
    return DrawHelpers.colorToHex(this.temperatureData[index].color);
  }

  temperatureRange(index: number) {
    const celsius = (this.temperatureData[index].temperature - 273.15).toFixed(
      0
    );
    if (index == 0) return $localize`(Above ${celsius}°C)`;
    else {
      const celsiusNext = (
        this.temperatureData[index - 1].temperature - 273.15
      ).toFixed(0);
      return $localize`(${celsius}°C ~ ${celsiusNext}°C)`;
    }
  }

  temperatureLabel(index: number) {
    const msgctxt = `STRINGS.UI.OVERLAYS.TEMPERATURE.${this.temperatureData[index].code}`;
    return this.gameStringService.dict[msgctxt];
  }

  close() {
    this.cameraService.visualization = Visualization.none;
  }
}
