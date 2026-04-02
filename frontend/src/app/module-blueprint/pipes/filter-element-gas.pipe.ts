import { Pipe, PipeTransform } from "@angular/core";
import { ElementReportDataItem } from "../common/tools/element-report";

@Pipe({
  name: "filterElementGas",
  standalone: false,
})
export class FilterElementGasPipe implements PipeTransform {
  transform(value: any, ...args: any[]): any {
    let dataItems = value as ElementReportDataItem[];

    // TODO boolean in export
    return dataItems.filter((d) => {
      return d.buildableElement.hasTag("Gas");
    });
  }
}
