import { Pipe, PipeTransform } from "@angular/core";
import { ElementReportDataItem } from "../common/tools/element-report";

@Pipe({
  name: "filterElementLiquid",
  standalone: false,
})
export class FilterElementLiquidPipe implements PipeTransform {
  transform(value: any, ..._args: any[]): any {
    const dataItems = value as ElementReportDataItem[];

    // TODO boolean in export
    return dataItems.filter((d) => {
      return d.buildableElement.hasTag("Liquid");
    });
  }
}
