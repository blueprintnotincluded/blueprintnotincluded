import { Blueprint } from '../models/blueprint';
import { Vector2, MdbBlueprint } from '../../../lib/index';

export class BatchUtils {
  static UpdateBasedOn(suspect: Blueprint, blueprints: Blueprint[], indexMax: number) {
    let suspectData = suspect.data as MdbBlueprint;

    suspect.isCopy = undefined;
    suspect.copyOf = undefined;

    let isCopy: boolean = false;
    for (let indexOriginal = 0; indexOriginal < indexMax; indexOriginal++) {
      //console.log('====> Comparing with blueprint : ' + blueprints[indexOriginal].name);
      let originalData = blueprints[indexOriginal].data as MdbBlueprint;

      let nbPresent = 0;
      for (
        let indexOriginalBuilding = 0;
        indexOriginalBuilding < originalData.blueprintItems.length;
        indexOriginalBuilding++
      ) {
        let originalBuilding = originalData.blueprintItems[indexOriginalBuilding];

        for (let suspectBuilding of suspectData.blueprintItems) {
          if (
            suspectBuilding.id == originalBuilding.id &&
            Vector2.compare(suspectBuilding.position, originalBuilding.position)
          ) {
            nbPresent++;
            break;
          }
        }
      }

      if (
        originalData.blueprintItems.length > 15 &&
        nbPresent >= 0.75 * originalData.blueprintItems.length
      ) {
        isCopy = true;
        console.log(
          '====> Probably a copy of  : ' + indexOriginal + ' : ' + blueprints[indexOriginal].name
        );
        suspect.isCopy = true;
        suspect.copyOf = blueprints[indexOriginal].id;
        suspect
          .save()
          .then(() => {})
          .catch(() => {
            console.log('====> Save Error ');
          });
      }

      //console.log('====> ' + nbPresent);
      if (isCopy) break;
    }
  }

  static UpdatePositionCorrection(toCorrect: Blueprint) {
    console.log('Analysing blueprints : ' + toCorrect.name);

    let toCorrectData = toCorrect.data as MdbBlueprint;

    let save = false;
    for (let building of toCorrectData.blueprintItems) {
      if (building.position != null && building.position.x > 8000) {
        building.position.x = building.position.x - 9999;
        save = true;
      }

      if (building.position != null && building.position.y < -8000) {
        building.position.y = building.position.y + 9999;
        save = true;
      }
    }

    if (save) {
      toCorrect.data = toCorrectData;
      toCorrect.markModified('data');
      toCorrect
        .save()
        .then(() => {
          console.log('Save OK : ' + toCorrect.name);
        })
        .catch(() => {
          console.log('====> Save Error ');
        });
    }
  }
}
