import { SearchQueryModel } from '../models/search-query';

// Fire-and-forget telemetry write for the query pipeline (phase 4). Never
// awaited by a caller — a search response must not wait on it, same
// rationale as syncSearchRowStatus. Failure is logged, never fatal.
export function recordSearchQuery(
  normalizedQuery: string,
  sourceLang: string | null,
  translated: boolean
): void {
  if (normalizedQuery.length === 0) return;
  SearchQueryModel.model
    .updateOne(
      { normalizedQuery, sourceLang },
      { $set: { translated, lastSeenAt: new Date() }, $inc: { hitCount: 1 } },
      { upsert: true }
    )
    .catch(err => {
      console.log('search query telemetry error');
      console.log(err);
    });
}
