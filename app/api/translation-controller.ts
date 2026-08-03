import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BlueprintModel } from './models/blueprint';
import { CommentModel } from './models/comment';
import { UserJwt } from './models/user';
import { TranslationService, TranslationBudgetExceeded } from './services/translation-service';
import { apiError } from './utils/apiError';
import { canViewBlueprint } from './utils/blueprint-visibility';
import { segmentBody } from './services/comment-body';
import { resolveReferenceNames } from './comment-controller';
import {
  isTranslationTargetLang,
  MAX_TRANSLATE_BATCH,
  TranslateBlueprintRequest,
  TranslateBlueprintResponse,
  TranslateCommentsRequest,
  TranslateCommentsResponse,
  TRANSLATION_BUDGET_EXCEEDED_CODE,
} from '../../lib/index';

// Translate endpoints (spec/user-content-translation-impl.md §4.4):
//   POST /api/blueprints/:id/translate
//   POST /api/blueprints/:id/comments/translate
//
// Auth required on both — this is the only surface on the site that spends
// real money per call, and anonymous access would make the monthly budget a
// public resource. Method is POST despite being read-shaped: it has a spend
// side effect and must never be cached or prefetched by Cloudflare.
export class TranslationController {
  constructor() {
    this.translateBlueprint = this.translateBlueprint.bind(this);
    this.translateComments = this.translateComments.bind(this);
  }

  private service(): TranslationService {
    return TranslationService.instance;
  }

  public async translateBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const service = this.service();
      if (!service.isConfigured()) {
        res.status(503).json(apiError(503, 'Translation is not configured'));
        return;
      }

      const blueprintId = String(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const { lang } = req.body as TranslateBlueprintRequest;
      if (!isTranslationTargetLang(lang)) {
        res.status(400).json(apiError(400, 'Unsupported target language'));
        return;
      }

      const user = req.user as UserJwt;
      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner isPublished description sourceLang');
      if (!blueprint || !canViewBlueprint(blueprint, user)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      if (!blueprint.description) {
        res.status(400).json(apiError(400, 'This blueprint has no description to translate'));
        return;
      }

      const result = await service.translateOne(
        {
          sourceText: blueprint.description,
          sourceLang: blueprint.sourceLang ?? null,
          targetLang: lang,
        },
        user._id
      );

      const response: TranslateBlueprintResponse = {
        description: result.translatedText,
        sourceLang: result.sourceLang,
        cached: result.cached,
        ...(result.degraded ? { degraded: true } : {}),
      };
      res.json(response);
    } catch (err) {
      this.handleError(err, res, 'translate blueprint');
    }
  }

  public async translateComments(req: Request, res: Response): Promise<void> {
    try {
      const service = this.service();
      if (!service.isConfigured()) {
        res.status(503).json(apiError(503, 'Translation is not configured'));
        return;
      }

      const blueprintId = String(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const { lang, ids } = req.body as TranslateCommentsRequest;
      if (!isTranslationTargetLang(lang)) {
        res.status(400).json(apiError(400, 'Unsupported target language'));
        return;
      }
      if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => !mongoose.Types.ObjectId.isValid(id))) {
        res.status(400).json(apiError(400, 'ids must be a non-empty array of comment ids'));
        return;
      }
      if (ids.length > MAX_TRANSLATE_BATCH) {
        res.status(400).json(apiError(400, `Cannot translate more than ${MAX_TRANSLATE_BATCH} comments at once`));
        return;
      }

      const user = req.user as UserJwt;
      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner isPublished')
        .lean();
      if (!blueprint || !canViewBlueprint(blueprint, user)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const comments = await CommentModel.model.find({
        _id: { $in: ids },
        blueprintId,
        deletedAt: null,
      });

      const inputs = comments.map(comment => ({
        sourceText: comment.body,
        sourceLang: comment.sourceLang ?? null,
        targetLang: lang,
        hasReferenceTokens: true,
      }));

      const results = await service.translateMany(inputs, user._id);

      // Translated bodies carry the same {{blueprint:id}}/{{user:id}} tokens
      // as the source (restored verbatim by translation-token-safety), so
      // they need the same name resolution as an ordinary comment body
      // before they can be rendered as segments — never expose raw tokens.
      const names = await resolveReferenceNames(results.map(r => r.translatedText));

      const response: TranslateCommentsResponse = {
        translations: comments.map((comment, i) => ({
          id: (comment._id as mongoose.Types.ObjectId).toString(),
          segments: segmentBody(results[i].translatedText, names),
          sourceLang: results[i].sourceLang,
          cached: results[i].cached,
          ...(results[i].degraded ? { degraded: true } : {}),
        })),
      };
      res.json(response);
    } catch (err) {
      this.handleError(err, res, 'translate comments');
    }
  }

  private handleError(err: unknown, res: Response, action: string): void {
    if (err instanceof TranslationBudgetExceeded) {
      res.status(429).json({ ...apiError(429, err.message), code: TRANSLATION_BUDGET_EXCEEDED_CODE });
      return;
    }
    console.log(`${action} error`);
    console.log(err);
    res.status(500).json(apiError(500, `Failed to ${action}`));
  }
}
