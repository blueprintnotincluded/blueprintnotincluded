import { Request, Response } from 'express';
import { apiError } from './apiError';

export function parseOlderThan(req: Request, res: Response): Date | null {
  if (!req.query.olderthan || req.query.olderthan === '') {
    res.status(400).json(apiError(400, 'Missing required parameter: olderthan'));
    return null;
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
