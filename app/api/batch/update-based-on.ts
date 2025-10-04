import dotenv from 'dotenv';
import { Database } from '../db';
import { BlueprintModel, Blueprint } from '../models/blueprint';
import { BatchUtils } from './batch-utils';

export class UpdateBasedOn {
  public db: Database;

  constructor() {
    console.log('Running batch UpdateBasedOn');

    // initialize configuration
    dotenv.config();
    console.log(process.env.ENV_NAME);

    // initialize database and authentication middleware
    this.db = new Database();

    setTimeout(this.updateBaseOn, 3000);
  }

  updateBaseOn() {
    BlueprintModel.model
      .find({})
      .sort({ createdAt: 1 })
      .then(blueprints => {
        for (let indexSuspect = blueprints.length - 1; indexSuspect >= 0; indexSuspect--) {
          console.log(
            '==> Analysing blueprint : ' + indexSuspect + ' : ' + blueprints[indexSuspect].name
          );

          BatchUtils.UpdateBasedOn(blueprints[indexSuspect], blueprints, indexSuspect);
        }
      });
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new UpdateBasedOn();
}
