export declare const RAW_SOURCE_FORMATS: readonly ["bpv2-json", "bpv2-sharestring"];
export type RawSourceFormat = (typeof RAW_SOURCE_FORMATS)[number];
export declare function looksLikeBniShareString(text: string): boolean;
export declare function decodeBniShareString(shareString: string): Promise<string>;
export declare function encodeBniShareString(json: string): Promise<string>;
//# sourceMappingURL=bni-share-string.d.ts.map