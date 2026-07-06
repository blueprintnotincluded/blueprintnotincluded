import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { UserJwt } from '../models/user';

// For anonymous routes (no express-jwt middleware) that still personalize
// their response when a valid Bearer token is present — likedByMe, canDelete,
// ownedByMe. Invalid or absent tokens just mean an anonymous viewer.
export function optionalViewer(req: Request): UserJwt | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET as string, { algorithms: ['HS256'] }) as UserJwt;
  } catch {
    return null;
  }
}
