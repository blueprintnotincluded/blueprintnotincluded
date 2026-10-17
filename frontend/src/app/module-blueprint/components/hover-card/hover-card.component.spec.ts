import { describe, it, expect, beforeEach } from "vitest";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CommonModule } from "@angular/common";
import { HoverCardComponent } from "./hover-card.component";
import {
  HoverCardService,
  HoverCardView,
} from "../../services/hover-card.service";

describe("HoverCardComponent", () => {
  let fixture: ComponentFixture<HoverCardComponent>;
  let listener: (view: HoverCardView | null) => void;

  const view = (overrides: Partial<HoverCardView> = {}): HoverCardView => ({
    cards: [
      {
        header: "Conductive Wire",
        material: "Copper",
        bullets: [{ text: "Element: ", accent: "Oxygen" }],
        selected: false,
      },
      { header: "Dig", bullets: [], selected: true },
    ],
    more: 0,
    cellRect: { left: 100, top: 100, width: 32, height: 32 },
    ...overrides,
  });

  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [HoverCardComponent],
      providers: [
        {
          provide: HoverCardService,
          useValue: {
            connect: (fn: (view: HoverCardView | null) => void) => {
              listener = fn;
              return () => {};
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(HoverCardComponent);
    fixture.detectChanges();
  });

  it("renders nothing until told", () => {
    expect(host().querySelectorAll(".hover-card")).toHaveLength(0);
  });

  it("renders a card per entry the moment it is told, outside any tick", () => {
    listener(view());

    const cards = host().querySelectorAll(".hover-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".hover-card-name")!.textContent).toBe(
      "Conductive Wire",
    );
    expect(
      cards[0].querySelector(".hover-card-material")!.textContent,
    ).toContain("(Copper)");
    expect(cards[0].querySelector(".hover-card-accent")!.textContent).toBe(
      "Oxygen",
    );
    expect(cards[1].querySelector(".hover-card-material")).toBe(null);
    expect(cards[1].querySelector("ul")).toBe(null);
  });

  it("borders only the selected card", () => {
    listener(view());
    const cards = host().querySelectorAll(".hover-card");
    expect(cards[0].classList.contains("hover-card-selected")).toBe(false);
    expect(cards[1].classList.contains("hover-card-selected")).toBe(true);
  });

  it("counts what did not fit", () => {
    listener(view({ more: 3 }));
    expect(host().querySelector(".hover-card-more")!.textContent).toContain(
      "+3 more",
    );
  });

  it("places itself beside the cell and clears on hide", () => {
    listener(view());
    expect(host().style.transform).toMatch(/^translate\(/);

    listener(null);
    expect(host().querySelectorAll(".hover-card")).toHaveLength(0);
  });
});
