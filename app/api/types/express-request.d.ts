// express-jwt's expressjwt middleware is configured with requestProperty:
// 'user' (app/routes.ts), attaching the decoded JWT payload here at runtime.
// This augmentation used to arrive as a side effect of @types/passport
// (removed with the dead passport auth path); every call site already casts
// this to UserJwt, so `unknown` is enough to make the property visible.
declare namespace Express {
  interface Request {
    user?: unknown;
  }
}
