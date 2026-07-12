import { Pipe, PipeTransform } from "@angular/core";
import { ElementReportDataItem } from "../common/tools/element-report";

@Pipe({
  name: "filterElementSolid",
  standalone: false,
})
export class FilterElementSolidPipe implements PipeTransform {
  transform(value: any, ..._args: any[]): any {
    const dataItems = value as ElementReportDataItem[];

    return dataItems.filter((d) => {
      return d.buildableElement.hasTag("BuildableAny");
    });
  }
}
