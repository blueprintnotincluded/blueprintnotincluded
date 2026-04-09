import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentification-service";

const MAX_ERRORS = 20;
const recentConsoleErrors: string[] = [];

// Intercept console.error and window.onerror to collect recent errors for feedback
const _originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const msg = args
    .map((a) => (a instanceof Error ? a.stack || a.message : String(a)))
    .join(" ");
  recentConsoleErrors.push(msg.slice(0, 500));
  if (recentConsoleErrors.length > MAX_ERRORS) recentConsoleErrors.shift();
  _originalConsoleError(...args);
};

window.addEventListener("error", (event: ErrorEvent) => {
  const msg =
    event.error?.stack ||
    `${event.message} at ${event.filename}:${event.lineno}`;
  recentConsoleErrors.push(msg.slice(0, 500));
  if (recentConsoleErrors.length > MAX_ERRORS) recentConsoleErrors.shift();
});

export function getRecentConsoleErrors(): string[] {
  return [...recentConsoleErrors];
}

@Injectable()
export class FeedbackService {
  constructor(private http: HttpClient, private auth: AuthenticationService) {}

  public submit(message: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      "/api/feedback",
      {
        message,
        url: window.location.href,
        userAgent: navigator.userAgent,
        consoleErrors: getRecentConsoleErrors(),
      },
      { headers: { Authorization: `Bearer ${this.auth.getToken()}` } }
    );
  }
}
