// Generates frontend/src/assets/database/database-2024.zip from the committed
// database-2024.json. The loose JSON is the source of truth in git (readable diffs);
// this zip is a gitignored build derivative the Angular app fetches and unpacks with
// JSZip. Wired as the frontend `prebuild` + `prestart` so the zip exists before
// `ng build` (prod/CI) and `ng serve` (dev). Skips work when the zip is already newer
// than the JSON, so repeat runs are instant.
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const dbDir = path.join(__dirname, "..", "src", "assets", "database");
const jsonPath = path.join(dbDir, "database-2024.json");
const zipPath = path.join(dbDir, "database-2024.zip");

function mtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return -Infinity;
  }
}

async function main() {
  if (!fs.existsSync(jsonPath)) {
    console.error(
      `[build-database-zip] missing ${path.relative(
        process.cwd(),
        jsonPath
      )} — ` + "run `npm run import:2024` from the repo root first."
    );
    process.exit(1);
  }

  if (mtimeMs(zipPath) >= mtimeMs(jsonPath)) {
    console.log("[build-database-zip] zip up to date, skipping");
    return;
  }

  const json = fs.readFileSync(jsonPath);
  const zip = new JSZip();
  // Entry MUST be named "database.json": the app reads zipped.files["database.json"].
  // Fixed date keeps the output reproducible (it is gitignored, but tidy regardless).
  zip.file("database.json", json, { date: new Date(0) });
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  fs.writeFileSync(zipPath, buf);
  console.log(
    `[build-database-zip] wrote ${path.relative(process.cwd(), zipPath)} (${
      buf.length
    } bytes)`
  );
}

main().catch((err) => {
  console.error("[build-database-zip] failed:", err);
  process.exit(1);
});
