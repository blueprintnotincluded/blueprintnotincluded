import { Component, Input } from "@angular/core";
import { Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { BlueprintVersionService } from "../../services/blueprint-version.service";

@Component({
  selector: "app-fork-button",
  templateUrl: "./fork-button.component.html",
  styleUrls: ["./fork-button.component.css"],
  standalone: false,
})
export class ForkButtonComponent {
  @Input() blueprintId!: string;
  @Input() disabled!: boolean;

  forking = false;

  get forkTitle() {
    return this.disabled
      ? $localize`Log in to fork`
      : $localize`Create your own editable copy of this blueprint`;
  }

  constructor(
    private blueprintVersionService: BlueprintVersionService,
    private router: Router,
    private messageService: MessageService
  ) {}

  fork() {
    if (this.forking) return;
    this.forking = true;
    this.blueprintVersionService.fork(this.blueprintId).subscribe({
      next: (response) => {
        this.forking = false;
        this.router.navigate(["/b", response.id]);
      },
      error: () => {
        this.forking = false;
        this.messageService.add({
          severity: "error",
          summary: $localize`:forkButton.error:Could not fork this blueprint`,
          detail: $localize`Please try again.`,
        });
      },
    });
  }
}
