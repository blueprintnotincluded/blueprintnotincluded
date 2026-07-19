import { Component, OnInit } from "@angular/core";
import { ModIndexEntry, ModsService } from "../../services/mods-service";

@Component({
  selector: "app-supported-mods-page",
  templateUrl: "./supported-mods-page.component.html",
  styleUrls: ["./supported-mods-page.component.css"],
  standalone: false,
})
export class SupportedModsPageComponent implements OnInit {
  mods: ModIndexEntry[] = [];

  constructor(private modsService: ModsService) {}

  ngOnInit(): void {
    this.modsService.getMods().subscribe((mods) => (this.mods = mods));
  }
}
