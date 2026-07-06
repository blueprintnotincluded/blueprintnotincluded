import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { BlueprintDetailsResponse } from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";

@Component({
  selector: "app-blueprint-details-page",
  templateUrl: "./blueprint-details-page.component.html",
  styleUrls: ["./blueprint-details-page.component.css"],
  standalone: false,
})
export class BlueprintDetailsPageComponent implements OnInit {
  details: BlueprintDetailsResponse | null = null;
  blueprintId: string | null = null;
  loading = true;
  notFound = false;

  constructor(
    private route: ActivatedRoute,
    private blueprintService: BlueprintService,
    public authService: AuthenticationService
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get("id");
      if (id != null) this.load(id);
    });
  }

  private load(id: string) {
    this.loading = true;
    this.notFound = false;
    this.details = null;
    this.blueprintId = null;
    this.blueprintService.getBlueprintDetails(id).subscribe({
      next: (details) => {
        this.details = details;
        this.blueprintId = details.id;
        this.loading = false;
      },
      error: () => {
        this.notFound = true;
        this.loading = false;
      },
    });
  }

  get loggedIn() {
    return this.authService.isLoggedIn();
  }

  hasRealThumbnail(): boolean {
    return (
      this.details != null &&
      this.details.thumbnail !== "svg" &&
      this.details.thumbnail !== "svg_nothing"
    );
  }
}
