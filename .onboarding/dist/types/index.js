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
exports.StepStatus = exports.DeveloperRole = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["HUMAN_DEVELOPER"] = "human";
    UserType["AI_AGENT"] = "agent";
})(UserType || (exports.UserType = UserType = {}));
var DeveloperRole;
(function (DeveloperRole) {
    DeveloperRole["FRONTEND"] = "frontend";
    DeveloperRole["BACKEND"] = "backend";
    DeveloperRole["DEVOPS"] = "devops";
    DeveloperRole["FULLSTACK"] = "fullstack";
})(DeveloperRole || (exports.DeveloperRole = DeveloperRole = {}));
var StepStatus;
(function (StepStatus) {
    StepStatus["LOCKED"] = "locked";
    StepStatus["AVAILABLE"] = "available";
    StepStatus["IN_PROGRESS"] = "in_progress";
    StepStatus["COMPLETED"] = "completed";
    StepStatus["SKIPPED"] = "skipped";
    StepStatus["FAILED"] = "failed";
})(StepStatus || (exports.StepStatus = StepStatus = {}));
// Error types are defined in errors/index.ts
// Re-export types from other modules
__exportStar(require("./content-validation"), exports);
__exportStar(require("./link-tracking"), exports);
__exportStar(require("./executable-examples"), exports);
//# sourceMappingURL=index.js.map