export interface ClusterItem {
    id: string;
    x: number;
    y: number;
    orientation?: number;
}
/**
 * Canonical string form of a blueprint's contents: sorted
 * `id:x:y:orientation` tuples, translated so the lowest placed cell sits at
 * the origin. Translation makes the same build match itself regardless of
 * where on the map it was selected; sorting makes it independent of the
 * order the editor happened to store items in.
 *
 * Exported for tests and debugging — callers want `contentClusterKey`.
 */
export declare function clusterCanonicalForm(items: ClusterItem[]): string | null;
/**
 * Content cluster key, or null for a blueprint with nothing placed — an
 * empty blueprint is not "the same build" as another empty one, and
 * clustering them would collapse unrelated drafts into one result.
 */
export declare function contentClusterKey(items: ClusterItem[]): string | null;
/**
 * Read-time canonical election (§2.5): the member a collapsed cluster shows.
 * Highest engagement wins, falling back to the earliest createdAt — the
 * probable original, which is the right answer for the "everyone saved a
 * copy of one build" case this exists for. Deterministic on id at the very
 * end so a page never reshuffles between requests.
 *
 * Callers pass only members that survived the authoritative visibility
 * filter, so collapse can never hide a visible blueprint behind a deleted or
 * draft canonical.
 */
export interface ClusterMember {
    id: string;
    ratingAverage?: number;
    ratingCount?: number;
    downloadCount?: number;
    forkCount?: number;
    createdAt?: Date | null;
}
export declare function electClusterCanonical(members: ClusterMember[]): ClusterMember | null;
//# sourceMappingURL=cluster-key.d.ts.map