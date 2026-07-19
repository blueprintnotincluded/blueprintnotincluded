import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { ModsService } from "./mods-service";

describe("ModsService", () => {
  let service: ModsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ModsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ModsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("caches the mod index for multiple subscribers", () => {
    const first = vi.fn();
    const second = vi.fn();

    service.getMods().subscribe(first);
    service.getMods().subscribe(second);

    const request = httpMock.expectOne("/api/mods");
    request.flush({
      mods: [{ id: "123", title: "Test Mod", buildings: ["TestBuilding"] }],
    });

    expect(first).toHaveBeenCalledWith([
      { id: "123", title: "Test Mod", buildings: ["TestBuilding"] },
    ]);
    expect(second).toHaveBeenCalledWith([
      { id: "123", title: "Test Mod", buildings: ["TestBuilding"] },
    ]);
    httpMock.expectNone("/api/mods");
  });
});
