import { Component, EventEmitter, Output } from "@angular/core";
import { AuthenticationService } from "../../services/authentification-service";

@Component({
  selector: "app-site-nav",
  templateUrl: "./site-nav.component.html",
  styleUrls: ["./site-nav.component.css"],
  standalone: false,
})
export class SiteNavComponent {
  @Output() about = new EventEmitter<void>();
  @Output() sendFeedback = new EventEmitter<void>();

  constructor(public authService: AuthenticationService) {}
}
