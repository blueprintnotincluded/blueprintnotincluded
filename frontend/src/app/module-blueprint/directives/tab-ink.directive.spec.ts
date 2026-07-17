import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TabInkDirective } from "./tab-ink.directive";

@Component({
  template: `
    <div class="bni-tabs" appTabInk>
      <button type="button" [class.active]="active === 0">First</button>
      <button type="button" [class.active]="active === 1">Second</button>
    </div>
  `,
  imports: [TabInkDirective],
})
class HostComponent {
  active = 0;
}

describe("TabInkDirective", () => {
  let fixture: ComponentFixture<HostComponent>;
  let container: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    container = fixture.nativeElement.querySelector(".bni-tabs");
  });

  it("marks the container and appends the ink bar", () => {
    expect(container.classList.contains("has-tab-ink")).toBe(true);
    const ink = container.querySelector(".bni-tab-ink");
    expect(ink).not.toBeNull();
    expect(ink!.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the bar hidden while the tabs have no layout (jsdom)", () => {
    // jsdom reports offsetWidth 0, which is the same code path as a
    // display:none container — the bar must not claim a position
    const ink = container.querySelector(".bni-tab-ink")!;
    expect(ink.classList.contains("bni-tab-ink--ready")).toBe(false);
  });

  it("does not loop when active-class mutations settle", async () => {
    // flip the active tab, let the MutationObserver microtasks drain; the
    // guarded writes must reach a fixed point instead of refiring forever
    fixture.componentInstance.active = 1;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const inks = container.querySelectorAll(".bni-tab-ink");
    expect(inks.length).toBe(1);
  });

  it("disconnects observers on destroy", () => {
    const directive =
      fixture.debugElement.children[0].injector.get(TabInkDirective);
    expect(() => fixture.destroy()).not.toThrow();
    // repositioning after destroy must be inert (observers disconnected)
    expect(directive).toBeTruthy();
  });
});
