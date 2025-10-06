"use strict";
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
//# sourceMappingURL=index.js.map