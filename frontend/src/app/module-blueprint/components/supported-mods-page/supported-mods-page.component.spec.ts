import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { of } from "rxjs";
import { ModsService } from "../../services/mods-service";
import { SupportedModsPageComponent } from "./supported-mods-page.component";

describe("SupportedModsPageComponent", () => {
  let fixture: ComponentFixture<SupportedModsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SupportedModsPageComponent],
      providers: [
        {
          provide: ModsService,
          useValue: {
            getMods: () =>
              of([
                {
                  id: "1887986467",
                  title: "Smart Pumps",
                  buildings: ["FilteredGasPump", "VacuumPump"],
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupportedModsPageComponent);
    fixture.detectChanges();
  });

  it("renders mod entries and their building icons", () => {
    const card = fixture.debugElement.query(By.css(".mod-card"));
    const link = card.query(By.css("h2 a"));
    const icons = card.queryAll(By.css(".mod-buildings img"));

    expect(link.nativeElement.textContent.trim()).toBe("Smart Pumps");
    expect(link.properties["href"]).toBe(
      "https://steamcommunity.com/sharedfiles/filedetails/?id=1887986467",
    );
    expect(icons.length).toBe(2);
    expect(icons[0].properties["src"]).toBe(
      "assets/ui_image/FilteredGasPump.png",
    );
  });
});
