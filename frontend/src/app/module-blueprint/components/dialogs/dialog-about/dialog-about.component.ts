import { Component, OnInit, ViewChild, ElementRef } from "@angular/core";
import { VersionService } from "../../../../services/version.service";

@Component({
  selector: "app-dialog-about",
  templateUrl: "./dialog-about.component.html",
  styleUrls: ["./dialog-about.component.css"],
})
export class DialogAboutComponent implements OnInit {
  visible: boolean;
  versionString: string = "Loading...";
  detailedVersionInfo: string = "";

  constructor(private versionService: VersionService) {}

  ngOnInit() {
    this.loadVersionInfo();
  }

  private loadVersionInfo() {
    this.versionService.getVersionString().then((version) => {
      this.versionString = version;
    });

    this.versionService.getDetailedVersionInfo().then((details) => {
      this.detailedVersionInfo = details;
    });
  }

  toggleDialog() {
    this.visible = !this.visible;
  }

  close() {
    this.visible = false;
  }
}
