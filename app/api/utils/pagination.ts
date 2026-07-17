import { Request, Response } from 'express';
import { apiError } from './apiError';

export function parseOlderThan(req: Request, res: Response): Date | null {
  // Absent (or empty) means "everything older than now" — the first-page
  // request. Clients omit it there on purpose: a Date.now() cursor makes
  // every page-1 URL unique, which defeats the edge cache on the feed
  // endpoints. Explicit values (page 2+ cursors) are validated as before.
  if (!req.query.olderthan || req.query.olderthan === '') {
    return new Date();
  }

  const dateInt = parseInt(req.query.olderthan as string);
  if (isNaN(dateInt)) {
    res.status(400).json(apiError(400, 'Invalid olderthan parameter: must be a numeric timestamp'));
    return null;
  }

  const dateFilter = new Date();
  dateFilter.setTime(dateInt);
  if (isNaN(dateFilter.getTime())) {
    res.status(400).json(apiError(400, 'Invalid olderthan parameter: timestamp out of range'));
    return null;
  }

  return dateFilter;
}
