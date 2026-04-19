import { Component, EventEmitter, OnInit, Output } from "@angular/core";
import { MenuItem } from "primeng/api";
import { AuthenticationService } from "../../services/authentification-service";
import { BrowseData } from "../user-menu/user-menu.component";

@Component({
  selector: "app-site-nav",
  templateUrl: "./site-nav.component.html",
  styleUrls: ["./site-nav.component.css"],
  standalone: false,
})
export class SiteNavComponent implements OnInit {
  @Output() about = new EventEmitter<void>();
  @Output() sendFeedback = new EventEmitter<void>();
  @Output() myBlueprintsRequested = new EventEmitter<BrowseData>();

  navItems!: MenuItem[];

  constructor(public authService: AuthenticationService) {}

  ngOnInit() {
    this.navItems = [
      {
        label: $localize`More`,
        items: [
          {
            label: $localize`About`,
            icon: "pi pi-info-circle",
            command: () => this.about.emit(),
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
    ];
  }
}
