import { Injectable } from "@angular/core";
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from "@angular/common/http";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentification-service";

/**
 * Attaches the bearer token to same-origin /api/ requests that don't already
 * carry an Authorization header.
 *
 * Services that need to choose between an anonymous and an authenticated
 * variant of an endpoint (blueprint-service, user-service) keep doing that
 * explicitly — this exists for services that only ever call an authenticated
 * endpoint and simply never attached the header at all: theme.service.ts and
 * content-locale.service.ts both 401'd on every request for exactly that
 * reason, invisible until something actually triggered the call. Scoped to
 * `/api/` so a token can never leak onto an absolute, third-party URL.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthenticationService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith("/api/") || req.headers.has("Authorization")) {
      return next.handle(req);
    }
    const token = this.authService.getToken();
    if (!token) return next.handle(req);
    return next.handle(
      req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
    );
  }
}
