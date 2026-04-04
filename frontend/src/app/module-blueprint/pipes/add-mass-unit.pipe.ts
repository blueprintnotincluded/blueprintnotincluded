import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "addMassUnit",
  standalone: false,
})
export class AddMassUnitPipe implements PipeTransform {
  transform(value: any, ..._args: any[]): any {
    if (value < 5) return (value * 1000).toFixed(0) + $localize` Grams`;
    if (value < 5000) return parseFloat(value.toFixed(1)) + $localize` Kg`;
    else return parseFloat((value / 1000).toFixed(1)) + $localize` Tons`;
  }
}
