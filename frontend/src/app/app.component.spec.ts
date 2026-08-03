import { TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { of } from "rxjs";
import { AppComponent } from "./app.component";
import { ThemeService } from "./module-blueprint/services/theme.service";
import { AuthenticationService } from "./module-blueprint/services/authentification-service";

describe("AppComponent", () => {
  let themeService: {
    initFromLocal: ReturnType<typeof vi.fn>;
    loadForUser: ReturnType<typeof vi.fn>;
  };
  let loggedIn: boolean;

  beforeEach(async () => {
    loggedIn = false;
    themeService = {
      initFromLocal: vi.fn(),
      loadForUser: vi.fn().mockReturnValue(of("steam")),
    };

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ThemeService, useValue: themeService },
        {
          provide: AuthenticationService,
          useValue: { isLoggedIn: () => loggedIn },
        },
      ],
    }).compileComponents();
  });

  it("should create the app", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'blueprintnotincluded'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app.title).toEqual("blueprintnotincluded");
  });

  // The local theme must be applied before any network call, so the first
  // paint is never the wrong palette.
  it("applies the locally stored theme on init", () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(themeService.initFromLocal).toHaveBeenCalled();
  });

  it("does not fetch the account theme for a logged-out visitor", () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(themeService.loadForUser).not.toHaveBeenCalled();
  });

  it("fetches the account theme once a session exists", () => {
    loggedIn = true;
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(themeService.loadForUser).toHaveBeenCalled();
  });
});
