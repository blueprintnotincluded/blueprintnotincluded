import { Pipe, PipeTransform } from "@angular/core";
import { ElementReportDataItem } from "../common/tools/element-report";

@Pipe({
  name: "filterElementSolid",
  
})
export class FilterElementSolidPipe implements PipeTransform {
  transform(value: any, ...args: any[]): any {
    let dataItems = value as ElementReportDataItem[];

    return dataItems.filter((d) => {
      return d.buildableElement.hasTag("BuildableAny");
    });
  }
}
