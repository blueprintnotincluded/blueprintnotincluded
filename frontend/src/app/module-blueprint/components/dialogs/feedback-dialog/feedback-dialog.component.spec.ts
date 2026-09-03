import { of, throwError } from "rxjs";

import { FeedbackDialogComponent } from "./feedback-dialog.component";

describe("FeedbackDialogComponent", () => {
  let component: FeedbackDialogComponent;
  let feedbackService: any;
  let authService: any;
  let router: any;

  beforeEach(() => {
    feedbackService = {
      submit: vi.fn().mockReturnValue(of({ message: "ok" })),
    };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };
    router = { navigate: vi.fn() };
    component = new FeedbackDialogComponent(
      feedbackService,
      authService,
      router,
    );
  });

  it("goToLogin closes the dialog and routes to /login", () => {
    component.visible = true;
    component.goToLogin();
    expect(component.visible).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(["/login"]);
  });

  describe("submit when logged out", () => {
    beforeEach(() => authService.isLoggedIn.mockReturnValue(false));

    it("does not call the feedback service and does not error", () => {
      component.open();
      component.message = "some feedback";
      component.submit();
      expect(feedbackService.submit).not.toHaveBeenCalled();
      expect(component.state).toBe("idle");
    });
  });

  describe("submit when logged in", () => {
    it("submits and reaches the success state", () => {
      component.open();
      component.message = "great site";
      component.submit();
      expect(feedbackService.submit).toHaveBeenCalledWith("great site");
      expect(component.state).toBe("success");
    });

    it("reaches the error state when the request fails", () => {
      feedbackService.submit.mockReturnValue(
        throwError(() => new Error("boom")),
      );
      component.open();
      component.message = "great site";
      component.submit();
      expect(component.state).toBe("error");
    });

    it("ignores an empty message", () => {
      component.open();
      component.message = "   ";
      component.submit();
      expect(feedbackService.submit).not.toHaveBeenCalled();
    });
  });
});
