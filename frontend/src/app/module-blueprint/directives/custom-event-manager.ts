/* eslint-disable @typescript-eslint/no-unsafe-function-type -- must match Angular's EventManager.addEventListener signature */
import { Injectable, Inject, NgZone } from "@angular/core";
import { EVENT_MANAGER_PLUGINS, EventManager } from "@angular/platform-browser";

@Injectable()
export class CustomEventManager extends EventManager {
  constructor(
    @Inject(EVENT_MANAGER_PLUGINS) plugins: any[],
    private zone: NgZone,
  ) {
    super(plugins, zone);
  }

  // Performance optimisation
  addEventListener(
    element: HTMLElement,
    eventName: string,
    handler: Function,
  ): Function {
    if (eventName.endsWith("out-zone")) {
      eventName = eventName.split(".")[0];
      return this.zone.runOutsideAngular(() =>
        super.addEventListener(element, eventName, handler),
      );
    }

    return super.addEventListener(element, eventName, handler);
  }
}
