import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map, shareReplay } from "rxjs/operators";

export interface ModIndexEntry {
  id: string;
  title: string;
  buildings: string[];
}

@Injectable({ providedIn: "root" })
export class ModsService {
  private mods$?: Observable<ModIndexEntry[]>;

  constructor(private http: HttpClient) {}

  getMods(): Observable<ModIndexEntry[]> {
    this.mods$ ??= this.http.get<{ mods: ModIndexEntry[] }>("/api/mods").pipe(
      map((response) => response.mods),
      shareReplay(1),
    );
    return this.mods$;
  }
}
