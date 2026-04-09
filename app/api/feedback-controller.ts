import { Request, Response } from 'express';
import { FeedbackModel } from './models/feedback';
import { UserJwt } from './models/user';

const VALID_STATUSES = ['open', 'resolved', 'spam'];

export class FeedbackController {
  constructor() {
    this.submit = this.submit.bind(this);
    this.list = this.list.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
  }

  public submit(req: Request, res: Response): void {
    const user = req.user as UserJwt;
    const { message, url, userAgent, consoleErrors } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    FeedbackModel.model
      .create({
        userId: user._id,
        userEmail: user.email,
        username: user.username,
        message: message.trim().slice(0, 5000),
        url: typeof url === 'string' ? url.slice(0, 500) : '',
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : '',
        consoleErrors: Array.isArray(consoleErrors)
          ? consoleErrors.slice(0, 10).map((e: unknown) => String(e).slice(0, 500))
          : [],
      })
      .then(() => res.status(201).json({ message: 'Feedback received' }))
      .catch(err => {
        console.error('Feedback submit error:', err);
        res.status(500).json({ error: 'Failed to save feedback' });
      });
  }

  public list(req: Request, res: Response): void {
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) {
      filter.status = status;
    }

    Promise.all([
      FeedbackModel.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeedbackModel.model.countDocuments(filter),
    ])
      .then(([items, total]) => res.json({ items, total, page, limit }))
      .catch(err => {
        console.error('Feedback list error:', err);
        res.status(500).json({ error: 'Failed to fetch feedback' });
      });
  }

  public updateStatus(req: Request, res: Response): void {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    FeedbackModel.model
      .findByIdAndUpdate(id, { status }, { new: true })
      .then(item => {
        if (!item) { res.status(404).json({ error: 'Not found' }); return; }
        res.json(item);
      })
      .catch(err => {
        console.error('Feedback update error:', err);
        res.status(500).json({ error: 'Failed to update feedback' });
      });
  }
}
