import { Component } from "@angular/core";
import { NgIf } from "@angular/common";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { QueuedPreviewDirective } from "./queued-preview.directive";

@Component({
  template: `
    <img
      id="a"
      *ngIf="showA"
      [appQueuedPreview]="urlA"
      [previewFallback]="fallbackA"
    />
    <img id="b" *ngIf="showB" [appQueuedPreview]="urlB" />
  `,
  standalone: true,
  imports: [NgIf, QueuedPreviewDirective],
})
class HostComponent {
  showA = true;
  showB = true;
  urlA = "/api/blueprints/a/preview/card.webp?v=1";
  urlB = "/api/blueprints/b/preview/card.webp?v=1";
  fallbackA = "data:image/png;base64,aaa";
}

describe("QueuedPreviewDirective", () => {
  let fixture: ComponentFixture<HostComponent>;

  const img = (id: string) =>
    fixture.debugElement.query(By.css(`#${id}`)).nativeElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it("loads one preview at a time", () => {
    expect(img("a").getAttribute("src")).toBe(
      "/api/blueprints/a/preview/card.webp?v=1"
    );
    expect(img("b").getAttribute("src")).toBeNull();

    img("a").dispatchEvent(new Event("load"));

    expect(img("b").getAttribute("src")).toBe(
      "/api/blueprints/b/preview/card.webp?v=1"
    );
  });

  it("swaps to the fallback on error and frees the slot", () => {
    img("a").dispatchEvent(new Event("error"));

    expect(img("a").getAttribute("src")).toBe("data:image/png;base64,aaa");
    expect(img("b").getAttribute("src")).toBe(
      "/api/blueprints/b/preview/card.webp?v=1"
    );
  });

  it("does not loop when the fallback itself errors", () => {
    img("a").dispatchEvent(new Event("error"));
    img("a").dispatchEvent(new Event("error"));

    expect(img("a").getAttribute("src")).toBe("data:image/png;base64,aaa");
  });

  it("frees the slot when the active image is destroyed", () => {
    // b is waiting behind a; destroying a mid-load must not strand it.
    expect(img("b").getAttribute("src")).toBeNull();
    fixture.componentInstance.showA = false;
    fixture.detectChanges();

    expect(img("b").getAttribute("src")).toBe(
      "/api/blueprints/b/preview/card.webp?v=1"
    );
  });
});
