// lib/server.ts
// initialize configuration
import dotenv from 'dotenv';
dotenv.config();
console.log(process.env.ENV_NAME);

import app from './app';
import { PreviewImageService } from './api/services/preview-image-service';
import { BlueprintCounterService } from './api/services/blueprint-counter-service';
import { startMemoryHeartbeat } from './api/services/memory-heartbeat';

// Loud, unmissable startup check — avatar endpoints answer 503 until the key
// exists, but the server still boots so a missing key can't take the site down.
if (!process.env.GEMINI_API_KEY) {
  console.error(
    '[avatar] GEMINI_API_KEY is not set — avatar generation DISABLED. ' +
      'Create a key at https://aistudio.google.com/apikey (see agent/AVATARS.md).'
  );
}

const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
  startMemoryHeartbeat('api');
  // Pre-warm the preview render worker so the first preview request after a
  // deploy doesn't pay the ~10s cold start (no-op when rendering is disabled).
  PreviewImageService.instance.warmUp();
});
// Best-effort flush of pending view/download counters on shutdown (DO sends
// SIGTERM on every deploy) — without this each restart drops up to one flush
// interval of counts.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close();
    void BlueprintCounterService.instance.flush().finally(() => process.exit(0));
  });
}

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: port ${PORT} is already in use. Is another server or Docker container running?`);
    process.exit(1);
  }
  throw err;
});
