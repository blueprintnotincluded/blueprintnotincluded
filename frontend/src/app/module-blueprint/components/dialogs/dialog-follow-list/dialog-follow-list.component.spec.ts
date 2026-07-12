import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";
import { RouterTestingModule } from "@angular/router/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { DialogModule } from "primeng/dialog";
import { of, throwError } from "rxjs";

import { DialogFollowListComponent } from "./dialog-follow-list.component";
import { UserService } from "src/app/module-blueprint/services/user-service";

function makeResponse(
  users: { id: string; username: string; followedByMe: boolean }[] = [],
  remaining = 0,
) {
  return { users, oldest: new Date("2026-01-01").toISOString(), remaining };
}

describe("DialogFollowListComponent", () => {
  let component: DialogFollowListComponent;
  let fixture: ComponentFixture<DialogFollowListComponent>;
  let userService: any;

  beforeEach(async () => {
    userService = {
      getFollowers: vi.fn().mockReturnValue(of(makeResponse())),
      getFollowing: vi.fn().mockReturnValue(of(makeResponse())),
    };

    await TestBed.configureTestingModule({
      declarations: [DialogFollowListComponent],
      imports: [
        RouterTestingModule.withRoutes([]),
        DialogModule,
        NoopAnimationsModule,
      ],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: UserService, useValue: userService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogFollowListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  it("loads followers and shows the dialog", () => {
    userService.getFollowers.mockReturnValue(
      of(
        makeResponse([
          { id: "u1", username: "alice", followedByMe: true },
          { id: "u2", username: "bob", followedByMe: false },
        ]),
      ),
    );

    component.showDialog("carol", "followers");

    expect(userService.getFollowers).toHaveBeenCalledWith(
      "carol",
      expect.any(Date),
    );
    expect(component.visible).toBe(true);
    expect(component.entries).toHaveLength(2);
    expect(component.title).toContain("Followers");
  });

  it("loads following instead when mode is 'following'", () => {
    component.showDialog("carol", "following");
    expect(userService.getFollowing).toHaveBeenCalledWith(
      "carol",
      expect.any(Date),
    );
    expect(component.title).toContain("Following");
  });

  it("renders a mutual-follow tag only for rows the viewer already follows", () => {
    userService.getFollowers.mockReturnValue(
      of(
        makeResponse([
          { id: "u1", username: "alice", followedByMe: true },
          { id: "u2", username: "bob", followedByMe: false },
        ]),
      ),
    );
    component.showDialog("carol", "followers");
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css(".follow-list-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0].query(By.css(".follow-list-mutual"))).toBeTruthy();
    expect(rows[1].query(By.css(".follow-list-mutual"))).toBeNull();
  });

  it("paginates on scroll and stops once remaining is 0", () => {
    userService.getFollowers
      .mockReturnValueOnce(
        of(
          makeResponse(
            [{ id: "u1", username: "alice", followedByMe: false }],
            1,
          ),
        ),
      )
      .mockReturnValueOnce(
        of(
          makeResponse([{ id: "u2", username: "bob", followedByMe: false }], 0),
        ),
      );

    component.showDialog("carol", "followers");
    expect(component.entries).toHaveLength(1);
    expect(component.noMore).toBe(false);

    component.loadMore();
    expect(component.entries).toHaveLength(2);
    expect(component.noMore).toBe(true);
  });

  it("flags loadError on failure", () => {
    userService.getFollowers.mockReturnValue(
      throwError(() => new Error("network")),
    );
    component.showDialog("carol", "followers");
    expect(component.loadError).toBe(true);
    expect(component.working).toBe(false);
  });
});
