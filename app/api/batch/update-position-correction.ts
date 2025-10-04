import dotenv from 'dotenv';
import { Database } from '../db';
import { BlueprintModel, Blueprint } from '../models/blueprint';
import { BatchUtils } from './batch-utils';

export class UpdatePositionCorrection {
  public db: Database;

  constructor() {
    console.log('Running batch UpdatePositionCorrection');

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
        for (let toCorrect of blueprints) BatchUtils.UpdatePositionCorrection(toCorrect);
      });
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  new UpdatePositionCorrection();
}
