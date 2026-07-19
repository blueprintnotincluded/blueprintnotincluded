import { Injectable } from "@angular/core";
import { Location } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { AuthenticationService } from "./authentification-service";
import { of } from "rxjs";
import { catchError, map, switchMap, tap } from "rxjs/operators";
import {
  decodeBniShareString,
  RawSourceFormat,
  Blueprint,
  IObsBlueprintChange,
  BlueprintItem,
  Overlay,
  Display,
  BniBlueprint,
  MdbBlueprint,
  OniTemplate,
  BlueprintListItem,
  BlueprintRate,
  BlueprintRateResponse,
  BlueprintResponse,
  BlueprintDetailsResponse,
  RelatedBlueprintsResponse,
  BlueprintDelete,
} from "../../../../../lib/index";
import * as yaml from "js-yaml";
import sanitize from "sanitize-filename";

export type BlueprintSort =
  | "recent"
  | "trending"
  | "popular"
  | "mostForked"
  | "mostViewed"
  | "mostDownloaded";

@Injectable({ providedIn: "root" })
export class BlueprintService implements IObsBlueprintChange {
  static baseUrl: string = window.location.origin;

  id!: string | null;
  name!: string;
  // TODO observable when modified, to be subscribed by the canvas
  // TODO not sure getter setters are useful
  blueprint_!: Blueprint;
  get blueprint() {
    return this.blueprint_;
  }
  set blueprint(value: Blueprint) {
    this.blueprint_ = value;
    //this.observersBlueprintChanged.map((observer) => { observer.blueprintChanged(this.blueprint_); })
  }
  thumbnail!: string;
  thumbnailStyle: Display;

  get savedBlueprint() {
    return this.id != null;
  }

  static blueprintService: BlueprintService;

  // TODO camera service does not need to be injected
  constructor(
    private http: HttpClient,
    private authService: AuthenticationService,
    private location: Location,
  ) {
    this.blueprint = new Blueprint();

    // Undo / Redo stuff
    this.blueprint.subscribeBlueprintChanged(this);
    this.resetUndoStates();

    this.observersBlueprintChanged = [];

    this.thumbnailStyle = Display.solid;

    BlueprintService.blueprintService = this;

    this.reset();
  }

  observersBlueprintChanged: IObsBlueprintChanged[];
  subscribeBlueprintChanged(observer: IObsBlueprintChanged) {
    this.observersBlueprintChanged.push(observer);
  }
  unsubscribeBlueprintChanged(observer: IObsBlueprintChanged) {
    const index = this.observersBlueprintChanged.indexOf(observer);
    if (index !== -1) this.observersBlueprintChanged.splice(index, 1);
  }

  // File-upload import failures happen in a FileReader callback where no
  // caller can catch them — surface them so the UI can toast (the paste
  // dialog handles its own errors via the returned promise)
  private importErrorObservers: ((error: unknown) => void)[] = [];
  subscribeImportError(observer: (error: unknown) => void) {
    this.importErrorObservers.push(observer);
  }
  unsubscribeImportError(observer: (error: unknown) => void) {
    const index = this.importErrorObservers.indexOf(observer);
    if (index !== -1) this.importErrorObservers.splice(index, 1);
  }
  private emitImportError(error: unknown) {
    this.importErrorObservers.map((observer) => observer(error));
  }

  openBlueprintFromUpload(fileType: BlueprintFileType, fileList: FileList) {
    if (fileList.length > 0) {
      this.reset();

      if (fileType == BlueprintFileType.YAML)
        this.openYamlBlueprint(fileList[0]);
      else if (fileType == BlueprintFileType.JSON)
        this.openJsonBlueprint(fileList[0]);
      else if (fileType == BlueprintFileType.BSON)
        this.openBsonBlueprint(fileList[0]);

      this.resetUndoStates();
    }
  }

  private openYamlBlueprint(file: File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      this.loadYamlBlueprint(reader.result as string);
    };
    reader.readAsText(file);
  }

  private loadYamlBlueprint(yamlString: string) {
    const templateYaml: OniTemplate = yaml.load(yamlString) as OniTemplate;

    const newBlueprint = new Blueprint();
    this.name = templateYaml.name;
    newBlueprint.importFromOni(templateYaml);

    this.observersBlueprintChanged.map((observer) => {
      observer.blueprintChanged(newBlueprint);
    });
  }

  private openJsonBlueprint(file: File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      this.loadJsonBlueprint(reader.result as string).catch((error) => {
        console.error("Blueprint import failed", error);
        this.emitImportError(error);
      });
    };
    reader.readAsText(file);
  }

  // Parses either BlueprintsV2 transport: .blueprint JSON file text, or the
  // mod's clipboard share-string (base64 + 4-byte length header + gzip).
  // Throws when the text is neither.
  private static async parseBniText(
    text: string,
  ): Promise<{ bni: BniBlueprint; format: RawSourceFormat }> {
    try {
      return { bni: JSON.parse(text), format: "bpv2-json" };
    } catch {
      return {
        bni: JSON.parse(await decodeBniShareString(text)),
        format: "bpv2-sharestring",
      };
    }
  }

  // The original text is kept verbatim (rawSource) so a save can offer the
  // byte-exact file back to downloaders.
  private async loadJsonBlueprint(template: string) {
    const { bni: templateJson, format } =
      await BlueprintService.parseBniText(template);

    const newBlueprint = new Blueprint();
    this.name = templateJson.friendlyname;
    newBlueprint.importFromBni(templateJson);

    this.rawSource = template;
    this.rawSourceFormat = format;
    // Canonical serialization of the imported content: the raw text is only
    // sent with a save while the blueprint still serializes to exactly this
    // (edits invalidate the original file, which must never disagree with
    // the stored data).
    this.rawSourceMdbJson = JSON.stringify(newBlueprint.toMdbBlueprint());

    // The mod's user description maps onto our description metadata
    if (templateJson.userdesc && !this.metadata.description)
      this.metadata.description = String(templateJson.userdesc).slice(0, 500);

    this.observersBlueprintChanged.map((observer) => {
      observer.blueprintChanged(newBlueprint);
    });
  }

  // Paste-import of the mod's copy-to-clipboard share-string (also tolerates
  // raw .blueprint JSON, mirroring the mod's own tolerant import)
  async openBlueprintFromShareString(text: string) {
    // Validate before touching any state: an invalid paste must leave the
    // currently open blueprint and its metadata untouched
    await BlueprintService.parseBniText(text);
    this.reset();
    await this.loadJsonBlueprint(text);
    this.resetUndoStates();
  }

  private openBsonBlueprint(file: File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      this.loadBsonBlueprint(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  }

  private loadBsonBlueprint(template: ArrayBuffer) {
    const newBlueprint = new Blueprint();
    newBlueprint.importFromBinary(template);

    this.observersBlueprintChanged.map((observer) => {
      observer.blueprintChanged(newBlueprint);
    });
  }

  public loadUrlBlueprint(url: string) {
    this.http.get(url).subscribe((value) => {
      console.warn(value);
    });
  }

  newBlueprint() {
    this.name = "new blueprint";
    this.reset();
    const newBlueprint = new Blueprint();
    this.location.replaceState("/");
    this.observersBlueprintChanged.map((observer) => {
      observer.blueprintChanged(newBlueprint);
    });
    this.resetUndoStates();
    // TODO firing the observable and then restting the states is duplicated. fix this
  }

  reset() {
    this.id = null;
    this.myRating = null;
    this.rating = 0;
    this.nbRatings = 0;
    this.metadata = {};
    this.clearRawSource();
  }

  // Verbatim BlueprintsV2 import text (file or share-string) held for the
  // next save; see loadJsonBlueprint. serverHasRawSource mirrors whether the
  // currently open saved blueprint has a stored raw on the server.
  rawSource: string | null = null;
  rawSourceFormat: RawSourceFormat | null = null;
  private rawSourceMdbJson: string | null = null;
  serverHasRawSource = false;
  private serverRawSourceFormat: string | null = null;
  private serverRawSourceMdbJson: string | null = null;

  private clearRawSource() {
    this.rawSource = null;
    this.rawSourceFormat = null;
    this.rawSourceMdbJson = null;
    this.serverHasRawSource = false;
    this.serverRawSourceFormat = null;
    this.serverRawSourceMdbJson = null;
  }

  // The held raw text, provided the open blueprint still serializes to
  // exactly the import it came from — null once the user edits anything.
  // Exact string equality, not a hash: a collision must never let a stale
  // original ship with edited data.
  getValidRawSource(): { text: string; format: RawSourceFormat } | null {
    if (this.rawSource == null || this.rawSourceFormat == null) return null;
    if (
      this.rawSourceMdbJson !== JSON.stringify(this.blueprint.toMdbBlueprint())
    )
      return null;
    return { text: this.rawSource, format: this.rawSourceFormat };
  }

  // Download filename extension for a stored raw-source format
  static rawSourceExtension(format: string | null | undefined): string {
    return format === "bpv2-sharestring" ? ".txt" : ".blueprint";
  }

  suppressChanges!: boolean;
  undoStates!: MdbBlueprint[];
  undoIndex!: number;
  undo() {
    const tempUndoIndex = this.undoIndex - 1;

    if (tempUndoIndex < 0 || tempUndoIndex >= this.undoStates.length) return;

    this.undoIndex = tempUndoIndex;
    this.reloadUndoIndex();
  }

  redo() {
    const tempUndoIndex = this.undoIndex + 1;

    if (tempUndoIndex >= this.undoStates.length) return;

    this.undoIndex = tempUndoIndex;
    this.reloadUndoIndex();
  }

  reloadUndoIndex() {
    const newBlueprint = new Blueprint();
    newBlueprint.importFromMdb(this.undoStates[this.undoIndex]);

    this.suppressChanges = true;
    this.blueprint.destroyAndCopyItems(newBlueprint);
    this.blueprint.refreshOverlayInfo();
    this.suppressChanges = false;
  }

  resetUndoStates() {
    this.suppressChanges = false;
    this.undoStates = [];
    this.undoIndex = 0;

    this.blueprintChanged();
  }

  itemDestroyed() {}
  itemAdded(_blueprintItem: BlueprintItem) {}
  blueprintChanged() {
    // We don't want to add a state if the changes come from the undo / redo action
    if (this.suppressChanges) return;

    // If we are in the middle of the states, doing anythings scraps the further redos
    if (this.undoIndex < this.undoStates.length - 1)
      this.undoStates.splice(this.undoIndex + 1);

    const newState = this.blueprint.toMdbBlueprint();
    /*if (this.undoStates.length > 0) {
      let oldState = this.undoStates[this.undoStates.length - 1];
      let oldHash = this.hashMdb(oldState);
      let newHash = this.hashMdb(newState);
      if (oldHash != newHash) this.undoStates.push(newState);
    }
    else */ this.undoStates.push(newState);

    while (this.undoStates.length > 50) this.undoStates.splice(0, 1);

    this.undoIndex = this.undoStates.length - 1;
  }

  hashMdb(mdb: MdbBlueprint) {
    const s = JSON.stringify(mdb);
    let hash = 0,
      i,
      chr;
    if (s.length === 0) return hash;
    for (i = 0; i < s.length; i++) {
      chr = s.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  // TODO return observable here so we can close the browse window on success?
  openBlueprintFromId(id: string) {
    this.location.replaceState(`/b/${id}`);
    this.getBlueprint(id).subscribe({
      next: this.handleGetBlueprint.bind(this),
      error: this.handleGetBlueprintError.bind(this),
    });
  }

  handleGetBlueprint(blueprint: Blueprint | undefined) {
    if (!blueprint) return;
    this.observersBlueprintChanged.map((observer) => {
      observer.blueprintChanged(blueprint);
    });
    this.resetUndoStates();
  }

  handleGetBlueprintError(error: any) {
    // TODO toast here
    console.error(error);
  }

  getBlueprint(id: string) {
    // Token is optional but required to open your own drafts — the backend
    // 404s draft blueprints for anonymous viewers
    const request = this.http
      .get<BlueprintResponse>(
        `/api/getblueprint/${id}`,
        this.authService.isLoggedIn()
          ? {
              headers: {
                Authorization: `Bearer ${this.authService.getToken()}`,
              },
            }
          : {},
      )
      .pipe(
        map((response: BlueprintResponse) => {
          if (response.data) {
            const blueprint = new Blueprint();

            this.id = response.id;
            this.name = response.name;
            this.nbRatings = response.nbRatings;
            this.rating = response.rating;
            this.myRating = response.myRating;
            this.isPublished = response.isPublished;
            this.clearRawSource();
            this.serverHasRawSource = response.hasRawSource === true;
            this.serverRawSourceFormat = response.rawSourceFormat ?? null;
            this.metadata = {
              gameVersion: response.gameVersion ?? null,
              category: response.category ?? null,
              subcategory: response.subcategory ?? null,
              description: response.description ?? null,
              modded: response.modded ?? null,
            };
            blueprint.importFromMdb(response.data);
            // Serialize the opened content through the same serializer the
            // editor uses, so the Download menu can tell "unedited since
            // open" and serve the server's byte-exact raw copy
            if (this.serverHasRawSource)
              this.serverRawSourceMdbJson = JSON.stringify(
                blueprint.toMdbBlueprint(),
              );
            return blueprint;
          }
          return undefined;
        }),
      );

    return request;
  }

  // Downloads the game-ready .blueprint (json) file for a saved blueprint
  // without disturbing the editor's currently-open blueprint state — used by
  // the details page, which never opens the blueprint into the editor.
  // When the server holds the verbatim uploaded file it is served byte-exact
  // (spec/blueprintsv2-import-spec.md §8); otherwise the file is generated
  // from the parsed data as before.
  downloadBlueprintFile(id: string, friendlyName: string) {
    return this.http
      .get<BlueprintResponse>(
        `/api/getblueprint/${id}`,
        this.authService.isLoggedIn()
          ? {
              headers: {
                Authorization: `Bearer ${this.authService.getToken()}`,
              },
            }
          : {},
      )
      .pipe(
        switchMap((response: BlueprintResponse) => {
          const generate = () => {
            const blueprint = new Blueprint();
            blueprint.importFromMdb(response.data);
            const bniBlueprint = blueprint.toBniBlueprint(friendlyName);

            BlueprintService.saveTextFile(
              JSON.stringify(bniBlueprint),
              sanitize(friendlyName) + ".blueprint",
            );

            this.trackDownload(id);
          };

          if (response.hasRawSource)
            return this.http
              .get(`/api/blueprints/${id}/raw`, { responseType: "text" })
              .pipe(
                tap((raw: string) => {
                  BlueprintService.saveTextFile(
                    raw,
                    sanitize(friendlyName) +
                      BlueprintService.rawSourceExtension(
                        response.rawSourceFormat,
                      ),
                  );
                  // The raw endpoint records the download server-side —
                  // no beacon needed
                }),
                // The raw copy may have vanished (e.g. concurrent edit) —
                // still deliver a generated file rather than failing
                catchError(() => {
                  generate();
                  return of(response);
                }),
              );

          generate();
          return of(response);
        }),
      );
  }

  // Editor "Download → Blueprint (json)": serve byte-exact raw when the open
  // blueprint is an unedited import (local raw text, or the server's stored
  // raw for a blueprint opened by id); otherwise generate from the parsed
  // model as before.
  exportBlueprintFile(friendlyName: string) {
    const localRaw = this.getValidRawSource();
    if (localRaw != null) {
      BlueprintService.saveTextFile(
        localRaw.text,
        sanitize(friendlyName) +
          BlueprintService.rawSourceExtension(localRaw.format),
      );
      if (this.id != null) this.trackDownload(this.id);
      return;
    }

    const generate = () => {
      const bniBlueprint = this.blueprint.toBniBlueprint(friendlyName);
      BlueprintService.saveTextFile(
        JSON.stringify(bniBlueprint),
        sanitize(friendlyName) + ".blueprint",
      );
      if (this.id != null) this.trackDownload(this.id);
    };

    if (
      this.id != null &&
      this.serverHasRawSource &&
      this.serverRawSourceMdbJson != null &&
      this.serverRawSourceMdbJson ===
        JSON.stringify(this.blueprint.toMdbBlueprint())
    ) {
      const extension = BlueprintService.rawSourceExtension(
        this.serverRawSourceFormat,
      );
      this.http
        .get(`/api/blueprints/${this.id}/raw`, { responseType: "text" })
        .subscribe({
          next: (raw) => {
            // Raw endpoint records the download server-side
            BlueprintService.saveTextFile(
              raw,
              sanitize(friendlyName) + extension,
            );
          },
          // The raw copy may have vanished (e.g. concurrent edit) — fall
          // back to the generated file rather than failing the download
          error: () => generate(),
        });
      return;
    }

    generate();
  }

  static saveTextFile(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], {}));
    const a = document.createElement("a");
    document.body.append(a);
    a.download = filename;
    a.href = url;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Meta only (no blueprint data) — for the details page. Token is optional;
  // the backend uses it to personalize myRating/ownedByMe.
  getBlueprintDetails(id: string) {
    return this.http.get<BlueprintDetailsResponse>(
      `/api/blueprints/${id}`,
      this.authService.isLoggedIn()
        ? {
            headers: {
              Authorization: `Bearer ${this.authService.getToken()}`,
            },
          }
        : {},
    );
  }

  // "You might also like" shelf for the details page. Token is optional; the
  // backend uses it to personalize myRating/ownedByMe on the returned cards.
  getRelatedBlueprints(id: string) {
    return this.http.get<RelatedBlueprintsResponse>(
      `/api/blueprints/${id}/related`,
      this.authService.isLoggedIn()
        ? {
            headers: {
              Authorization: `Bearer ${this.authService.getToken()}`,
            },
          }
        : {},
    );
  }

  getBlueprints(
    olderThan: Date | null,
    filterUserId: string | null,
    filterName: string | null,
    filterGameVersion?: string | null,
    filterCategory?: string | null,
    filterSubcategory?: string | null,
    sort?: BlueprintSort,
    skip?: number,
    filterModded?: boolean | null,
    filterForkedFrom?: string | null,
    filterRatedBy?: string | null,
    filterRooms?: string | null,
  ) {
    // olderthan is a cache-buster when it isn't doing real work, so send it
    // only where it is the pagination cursor: the recent sort past page 1
    // (null = first page = "older than now", the server default). Count
    // sorts paginate via skip and ignore it entirely. Stable URLs let the
    // CDN actually serve anonymous browse requests from the edge.
    const usesCursor = sort == null || sort === "recent";
    const parameterOlderThan =
      usesCursor && olderThan != null
        ? "olderthan=" + olderThan.getTime().toString()
        : "";

    let parameterFilterUserId = "";
    if (filterUserId != null)
      parameterFilterUserId = "&filterUserId=" + filterUserId;

    let parameterFilterName = "";
    if (filterName != null) parameterFilterName = "&filterName=" + filterName;

    let parameterGameVersion = "";
    if (filterGameVersion != null)
      parameterGameVersion = "&gameVersion=" + filterGameVersion;

    let parameterCategory = "";
    if (filterCategory != null)
      parameterCategory = "&category=" + filterCategory;

    let parameterSubcategory = "";
    if (filterSubcategory != null)
      parameterSubcategory = "&subcategory=" + filterSubcategory;

    let parameterSort = "";
    if (sort != null && sort !== "recent") {
      parameterSort = "&sort=" + sort;
      if (skip != null) parameterSort += "&skip=" + skip;
    }

    let parameterModded = "";
    if (filterModded != null) parameterModded = "&modded=" + filterModded;

    let parameterForkedFrom = "";
    if (filterForkedFrom != null)
      parameterForkedFrom = "&forkedFrom=" + filterForkedFrom;

    let parameterRatedBy = "";
    if (filterRatedBy != null) parameterRatedBy = "&ratedBy=" + filterRatedBy;

    let parameterRooms = "";
    if (filterRooms != null) parameterRooms = "&rooms=" + filterRooms;

    const parameters = (
      parameterOlderThan +
      parameterFilterUserId +
      parameterFilterName +
      parameterGameVersion +
      parameterCategory +
      parameterSubcategory +
      parameterSort +
      parameterModded +
      parameterForkedFrom +
      parameterRatedBy +
      parameterRooms
    ).replace(/^&/, "");

    // General browsing is a public, viewer-independent feed — always hit the
    // anonymous endpoint (no token) so Cloudflare serves it from the edge for
    // logged-in users too. The secure endpoint is only for lists that depend
    // on who is asking: a specific user's list (own/admin view includes
    // drafts) and the private rated-by-me list.
    const needsAuth = filterUserId != null || filterRatedBy != null;
    const request =
      needsAuth && this.authService.isLoggedIn()
        ? this.http.get("/api/getblueprintsSecure?" + parameters, {
            headers: { Authorization: `Bearer ${this.authService.getToken()}` },
          })
        : this.http.get("/api/getblueprints?" + parameters);

    request.pipe(
      map((response: any) => {
        const blueprintListItems = response as BlueprintListItem[];
        return blueprintListItems;
      }),
    );

    return request;
  }

  deleteBlueprint(id: string) {
    const body: BlueprintDelete = { blueprintId: id };

    return this.http.post("/api/deleteblueprint", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }

  metadata: Partial<
    Pick<
      SaveBlueprintMessage,
      "gameVersion" | "category" | "subcategory" | "description" | "modded"
    >
  > = {};

  saveBlueprint(overwrite: boolean, publish?: boolean | null) {
    const saveBlueprint = this.blueprint.toMdbBlueprint();

    const body = new SaveBlueprintMessage();
    body.overwrite = overwrite;
    body.name = this.name;
    body.blueprint = saveBlueprint;
    body.thumbnail = this.thumbnail;
    // publish: true publishes in the same save; null/undefined keeps the
    // current state (new blueprints start as drafts server-side)
    if (publish != null) body.publish = publish;
    // Copy-as-fork attribution: when the editor started from an existing
    // blueprint, name it as the source — the server records forkedFrom when
    // the save creates a copy because the requester isn't the owner
    if (this.id != null) body.sourceBlueprintId = this.id;
    // Byte-exact round-trip: send the verbatim imported file only while the
    // saved content still matches it; an edited blueprint saves without raw
    // (the server clears any previously stored raw on such saves)
    const validRaw = this.getValidRawSource();
    if (validRaw != null) {
      body.rawSource = validRaw.text;
      body.rawSourceFormat = validRaw.format;
    }
    Object.assign(body, this.metadata);
    const request = this.http
      .post("/api/uploadblueprint", body, {
        headers: { Authorization: `Bearer ${this.authService.getToken()}` },
      })
      .pipe(
        map((response: any) => {
          if (response.id) {
            const isNewBlueprint = this.id == null;
            this.id = response.id;
            this.location.replaceState(`/b/${this.id}`);
            if (publish === true) this.isPublished = true;
            else if (isNewBlueprint) this.isPublished = false;
            // The save either stored the raw import verbatim or cleared any
            // previously stored raw (edited content)
            this.serverHasRawSource = validRaw != null;
            this.serverRawSourceFormat = validRaw?.format ?? null;
            this.serverRawSourceMdbJson =
              validRaw != null ? this.rawSourceMdbJson : null;
          }
          return response;
        }),
      );

    return request;
  }

  // Publish state of the currently loaded blueprint (undefined until loaded)
  isPublished?: boolean;

  // Returns the observable: callers need success/error to update their UI
  // (rateBlueprint does the same)
  setPublished(blueprintId: string, publish: boolean) {
    const action = publish ? "publish" : "unpublish";
    return this.http
      .post<{ isPublished: boolean }>(
        `/api/blueprints/${blueprintId}/${action}`,
        {},
        { headers: { Authorization: `Bearer ${this.authService.getToken()}` } },
      )
      .pipe(
        map((response) => {
          if (blueprintId === this.id) this.isPublished = response.isPublished;
          return response;
        }),
      );
  }

  // Fire-and-forget beacon: the .blueprint file export is client-side only,
  // so the server can't see it — report it for the download counter. Works
  // logged out (the endpoint is anonymous) and must never bother the user
  // on failure.
  trackDownload(blueprintId: string) {
    this.http
      .post(
        `/api/blueprints/${blueprintId}/downloads`,
        {},
        this.authService.isLoggedIn()
          ? {
              headers: {
                Authorization: `Bearer ${this.authService.getToken()}`,
              },
            }
          : {},
      )
      .subscribe({ error: () => {} });
  }

  nbRatings!: number;
  rating!: number;
  myRating!: number | null;
  rateBlueprint(blueprintId: string, rating: number) {
    const body: BlueprintRate = {
      blueprintId: blueprintId,
      rating: rating,
    };

    // Response carries the fresh aggregate so widgets can update in place
    return this.http.post<BlueprintRateResponse>("/api/rateblueprint", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }
}

export class SaveBlueprintMessage {
  overwrite!: boolean;
  name!: string;
  blueprint!: MdbBlueprint;
  thumbnail!: string;
  // true = publish with this save; omitted = keep current publish state
  publish?: boolean;
  // id of the blueprint the editor was opened from; the server records
  // forkedFrom when the save creates a copy (requester isn't the owner)
  sourceBlueprintId?: string;
  gameVersion?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  modded?: boolean | null;
  // Verbatim BlueprintsV2 import text, present only when the saved data still
  // equals the imported content (byte-exact round-trip, §8)
  rawSource?: string;
  rawSourceFormat?: RawSourceFormat;
}

export enum BlueprintFileType {
  YAML,
  JSON,
  BSON,
}

export interface IObsBlueprintChanged {
  blueprintChanged(blueprint: Blueprint): void;
}

export interface ExportImageOptions {
  gridLines: boolean;
  selectedOverlays: Overlay[];
  pixelsPerTile: number;
}
