import { Component, EventEmitter, Output } from "@angular/core";
import { AuthenticationService } from "../../services/authentification-service";
import { BrowseData } from "../user-menu/user-menu.component";

@Component({
  selector: "app-site-nav",
  templateUrl: "./site-nav.component.html",
  styleUrls: ["./site-nav.component.css"],
  standalone: false,
})
export class SiteNavComponent {
  @Output() about = new EventEmitter<void>();
  @Output() sendFeedback = new EventEmitter<void>();
  @Output() myBlueprintsRequested = new EventEmitter<BrowseData>();

  constructor(public authService: AuthenticationService) {}
}
