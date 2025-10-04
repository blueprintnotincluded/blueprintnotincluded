import { Request, Response } from 'express';
import { BlueprintModel, Blueprint } from './models/blueprint';
import {
  MdbBlueprint,
  BlueprintResponse,
  BlueprintListItem,
  BlueprintListResponse,
  BlueprintLike,
  Vector2,
  CameraService,
  Overlay,
  ImageSource,
  BlueprintDelete,
} from '../../lib/index';
import { Blueprint as sharedBlueprint } from '../../lib/index';
import { UserModel, User, UserJwt } from './models/user';
import { UpdateBasedOn } from './batch/update-based-on';
import { BatchUtils } from './batch/batch-utils';
import { use } from 'passport';

export class BlueprintController {
  public uploadBlueprint(req: Request, res: Response) {
    console.log('uploadBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO input checks here

      let user = req.user as UserJwt;
      let ownerId = user._id;
      let name = req.body.name;
      let data = req.body.blueprint;
      let thumbnail = req.body.thumbnail;
      let overwrite = req.body.overwrite;

      let regexp = /^[a-zA-Z0-9-_ ]+$/;
      if (name.search(regexp) == -1 || name.length > 60) {
        console.log('Blueprint name too long or with weird characters');
        res.status(500).json({ saveBlueprintResult: 'ERROR' });
        return;
      }

      BlueprintModel.model
        .find({ owner: ownerId, name: name })
        .then(blueprints => {
          if (blueprints.length > 0) {
            if (overwrite || blueprints[0].deleted)
              BlueprintController.saveBlueprint(
                req,
                res,
                blueprints[0],
                ownerId,
                name,
                data,
                thumbnail,
                false
              );
            else res.json({ overwrite: true });
          } else {
            let blueprint = new BlueprintModel.model();
            blueprint.likes = [ownerId];
            BlueprintController.saveBlueprint(
              req,
              res,
              blueprint,
              ownerId,
              name,
              data,
              thumbnail,
              true
            );
          }
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json({ saveBlueprintResult: 'ERROR' });
        });
    }
  }

  public deleteBlueprint(req: Request, res: Response) {
    console.log('deleteBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      try {
        let user = req.user as UserJwt;
        let blueprintDelete = req.body as BlueprintDelete;

        let ownerId = user._id;

        if (blueprintDelete.blueprintId == null || user == null) {
          res.status(500).json({ likeBlueprint: 'ERROR' });
          return;
        }

        BlueprintModel.model
          .find({ _id: blueprintDelete.blueprintId, owner: ownerId })
          .then(blueprints => {
            if (blueprints.length > 0) {
              let blueprint = blueprints[0];

              blueprint.deleted = true;

              blueprint
                .save()
                .then(() => {
                  res.json({ deleteBlueprint: 'OK' });
                })
                .catch(error => {
                  console.log('deleteBlueprint error');
                  console.log(error);
                  res.status(500).json({ deleteBlueprint: 'ERROR' });
                });
            } else res.status(500).json({ deleteBlueprint: 'ERROR' });
          })
          .catch(err => {
            console.log('deleteBlueprint error');
            console.log(err);
            res.status(500).json({ deleteBlueprint: 'ERROR' });
          });
      } catch {
        res.status(500).json({ deleteBlueprint: 'ERROR' });
      }
    }
  }

  public likeBlueprint(req: Request, res: Response) {
    console.log('likeBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      try {
        let user = req.user as UserJwt;
        let blueprintLike = req.body as BlueprintLike;

        if (blueprintLike.blueprintId == null || blueprintLike.like == null || user == null) {
          res.status(500).json({ likeBlueprint: 'ERROR' });
          return;
        }

        BlueprintModel.model
          .find({ _id: blueprintLike.blueprintId })
          .then(blueprints => {
            if (blueprints.length > 0) {
              let blueprint = blueprints[0];

              if (blueprint.likes == null) blueprint.likes = [];
              if (blueprintLike.like) {
                if (blueprint.likes.indexOf(user._id) == -1) blueprint.likes.push(user._id);
              } else {
                let indexLike = blueprint.likes.indexOf(user._id);
                if (indexLike != -1) blueprint.likes.splice(indexLike, 1);
              }

              blueprint
                .save()
                .then(() => {
                  res.json({ likeBlueprint: 'OK' });
                })
                .catch(error => {
                  console.log('likeBlueprint error');
                  console.log(error);
                  res.status(500).json({ likeBlueprint: 'ERROR' });
                });
            } else res.status(500).json({ likeBlueprint: 'ERROR' });
          })
          .catch(err => {
            console.log('likeBlueprint error');
            console.log(err);
            res.status(500).json({ likeBlueprint: 'ERROR' });
          });
      } catch {
        res.status(500).json({ likeBlueprint: 'ERROR' });
      }
    }
  }

  public getBlueprint(req: Request, res: Response) {
    console.log('getBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
      let userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0) {
            let blueprint = blueprints[0];

            let likedByMe = false;
            if (
              userId != null &&
              blueprint.likes != null &&
              blueprint.likes.indexOf(userId as string) != -1
            )
              likedByMe = true;

            let nbLikes = 0;
            if (blueprint.likes != null) nbLikes = blueprint.likes.length;

            let response: BlueprintResponse = {
              id: (blueprint._id as any).toString(),
              name: blueprint.name,
              data: blueprint.data,
              likedByMe: likedByMe,
              nbLikes: nbLikes,
            };
            res.json(response);
          } else res.status(500).json({ getBlueprint: 'ERROR' });
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json({ getBlueprint: 'ERROR' });
        });
    }
  }

  public getBlueprintMod(req: Request, res: Response) {
    console.log('getBlueprintMod' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
      let userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0) {
            let blueprint = blueprints[0];

            let mdbBlueprint = blueprint.data as MdbBlueprint;
            let angularBlueprint = new sharedBlueprint();
            angularBlueprint.importFromMdb(mdbBlueprint);
            let bniBlueprint = angularBlueprint.toBniBlueprint(blueprint.name);

            res.json(bniBlueprint);
          } else res.status(500).json({ getBlueprint: 'ERROR' });
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json({ getBlueprint: 'ERROR' });
        });
    }
  }

  public getBlueprintThumbnail(req: Request, res: Response) {
    console.log('getBlueprintThumbnail' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
      let userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0) {
            let blueprint = blueprints[0];

            let mdbBlueprint = blueprint.data as MdbBlueprint;
            let angularBlueprint = new sharedBlueprint();
            angularBlueprint.importFromMdb(mdbBlueprint);

            // TODO not sure if I should allow users to regen, or just serve the save thumbnail
            //PixiBackend.pixiBackend.generateThumbnail(angularBlueprint);

            res.json({ status: 'ok' });
          } else res.status(500).json({ getBlueprint: 'ERROR' });
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json({ getBlueprint: 'ERROR' });
        });
    }
  }

  public getBlueprints(req: Request, res: Response) {
    console.log('getBlueprints' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      let filterUserId: string;
      let filterName: string;
      let getDuplicates: boolean;
      let dateFilter: Date = new Date();

      let userId = '';
      let userJwt = req.user as UserJwt;
      if (userJwt != null) userId = userJwt._id;

      try {
        // Check if olderthan parameter exists and is not empty
        if (!req.query.olderthan || req.query.olderthan === '') {
          res.status(400).json({ getBlueprints: 'Invalid olderthan parameter' });
          return;
        }

        let dateInt = parseInt(req.query.olderthan as string);
        if (isNaN(dateInt)) {
          res.status(400).json({ getBlueprints: 'Invalid olderthan parameter' });
          return;
        }

        dateFilter.setTime(dateInt);

        // Validate that the date is valid after setting time
        if (isNaN(dateFilter.getTime())) {
          res.status(400).json({ getBlueprints: 'Invalid date value' });
          return;
        }

        filterUserId = req.query.filterUserId as string;
        filterName = req.query.filterName as string;
        getDuplicates = req.query.getDuplicates as any;
      } catch (error) {
        console.log(error);
        res.status(400).json({ getBlueprints: 'Invalid parameters' });
        return;
      }

      let filter: any = { $and: [{ createdAt: { $lt: dateFilter } }, { deleted: { $ne: true } }] };

      if (filterUserId != null) filter.$and.push({ owner: filterUserId });
      if (filterName != null) filter.$and.push({ name: { $regex: filterName, $options: 'i' } });
      if (!getDuplicates) filter.$and.push({ $or: [{ isCopy: null }, { isCopy: false }] });

      let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
      let query = BlueprintModel.model
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(browseIncrement * 2)
        .populate('owner');

      query
        .then(blueprints => {
          BlueprintController.handleGetBlueprint(req, res, userId, blueprints);
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json({ getBlueprint: 'ERROR' });
        });
    }
  }

  private static handleGetBlueprint(
    req: Request,
    res: Response,
    userId: string,
    blueprints: Blueprint[]
  ) {
    let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);

    let returnValueAny = {};
    let returnValue = returnValueAny as BlueprintListResponse;
    returnValue.blueprints = [];
    returnValue.oldest = new Date();

    if (blueprints.length) {
      returnValue.remaining = blueprints.length - browseIncrement;
      if (returnValue.remaining < 0) returnValue.remaining = 0;

      for (
        let indexBlueprint = 0;
        indexBlueprint < Math.min(browseIncrement, blueprints.length);
        indexBlueprint++
      ) {
        let blueprint = blueprints[indexBlueprint];
        if (blueprint.createdAt < returnValue.oldest) returnValue.oldest = blueprint.createdAt;

        let ownerId = '';
        let username: string = '';
        if (UserModel.isUser(blueprint.owner)) {
          username = blueprint.owner.username as string;
          ownerId = blueprint.owner.id as string;
        }

        let likedByMe = false;
        if (userId != null && blueprint.likes != null && blueprint.likes.indexOf(userId) != -1)
          likedByMe = true;

        let ownedByMe = false;
        if (userId != null && ownerId == userId) ownedByMe = true;
        //console.log(userId + '_' + ownerId)

        let nbLikes = 0;
        if (blueprint.likes != null) nbLikes = blueprint.likes.length;

        returnValue.blueprints.push({
          id: (blueprint._id as any).toString(),
          name: blueprint.name,
          ownerId: ownerId,
          ownerName: username,
          tags: blueprint.tags,
          createdAt: blueprint.createdAt,
          modifiedAt: blueprint.modifiedAt,
          thumbnail: blueprint.thumbnail,
          nbLikes: nbLikes,
          likedByMe: likedByMe,
          ownedByMe: ownedByMe,
        });
      }

      // Long timeout for debug
      //setTimeout(() => { res.json(returnValue); }, 2000)
      res.json(returnValue);
    } else res.json(returnValue);
  }

  private static saveBlueprint(
    req: Request,
    res: Response,
    blueprint: Blueprint,
    ownerId: string,
    name: string,
    data: any,
    thumbnail: string,
    overwriteCreateDate: boolean
  ) {
    blueprint.owner = ownerId;
    blueprint.name = name;
    // TODO tags
    blueprint.data = data;
    blueprint.markModified('data');
    blueprint.thumbnail = thumbnail;
    blueprint.deleted = false;

    if (overwriteCreateDate || blueprint.createdAt == null) blueprint.createdAt = new Date();
    blueprint.modifiedAt = new Date();

    blueprint
      .save()
      .then(newBlueprint => {
        let id = newBlueprint.id;
        res.json({ id: id });

        // Then we identify if the uploaded bleuprint is a duplicate
        BlueprintModel.model
          .find({})
          .sort({ createdAt: 1 })
          .then(blueprints => {
            BatchUtils.UpdateBasedOn(newBlueprint, blueprints, blueprints.length - 1);
            BatchUtils.UpdatePositionCorrection(newBlueprint);
          });
      })
      .catch(error => {
        console.log('Blueprint save error');
        console.log(error);

        res.status(500).json({ saveBlueprintResult: 'ERROR' });
      });
  }
}
