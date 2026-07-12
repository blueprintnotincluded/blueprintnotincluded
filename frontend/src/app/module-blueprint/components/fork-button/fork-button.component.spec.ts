import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { MessageService } from "primeng/api";
import { TooltipModule } from "primeng/tooltip";

import { ForkButtonComponent } from "./fork-button.component";
import { BlueprintVersionService } from "src/app/module-blueprint/services/blueprint-version.service";

describe("ForkButtonComponent", () => {
  let component: ForkButtonComponent;
  let fixture: ComponentFixture<ForkButtonComponent>;
  let blueprintVersionService: any;
  let router: any;
  let messageService: any;

  beforeEach(async () => {
    blueprintVersionService = {
      fork: vi.fn().mockReturnValue(of({ id: "new-fork-id" })),
    };
    router = { navigate: vi.fn() };
    messageService = { add: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [ForkButtonComponent],
      imports: [TooltipModule],
      providers: [
        { provide: BlueprintVersionService, useValue: blueprintVersionService },
        { provide: Router, useValue: router },
        { provide: MessageService, useValue: messageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForkButtonComponent);
    component = fixture.componentInstance;
    component.blueprintId = "source-id";
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("calls the fork endpoint and navigates to the new blueprint on success", () => {
    component.fork();

    expect(blueprintVersionService.fork).toHaveBeenCalledWith("source-id");
    expect(router.navigate).toHaveBeenCalledWith(["/b", "new-fork-id"]);
    expect(component.forking).toBe(false);
  });

  it("resets forking state and shows a toast on error, without navigating", () => {
    blueprintVersionService.fork.mockReturnValue(
      throwError(() => new Error("fail")),
    );

    component.fork();

    expect(component.forking).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("ignores repeated clicks while a fork request is in flight", () => {
    component.forking = true;
    component.fork();

    expect(blueprintVersionService.fork).not.toHaveBeenCalled();
  });
});
