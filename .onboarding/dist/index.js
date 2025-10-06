"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONBOARDING_VERSION = void 0;
// Main entry point for the onboarding system
__exportStar(require("./types"), exports);
__exportStar(require("./types/link-tracking"), exports);
__exportStar(require("./types/content-validation"), exports);
__exportStar(require("./errors"), exports);
__exportStar(require("./utils/logger"), exports);
__exportStar(require("./managers/documentation-manager"), exports);
__exportStar(require("./engines/template-engine"), exports);
__exportStar(require("./validation/link-tracker"), exports);
__exportStar(require("./validation/content-validation-engine"), exports);
__exportStar(require("./orchestrator/onboarding-orchestrator"), exports);
__exportStar(require("./constants"), exports);
exports.ONBOARDING_VERSION = '1.0.0';
//# sourceMappingURL=index.js.map