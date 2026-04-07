// lib/server.ts
// initialize configuration
import dotenv from 'dotenv';
dotenv.config();
console.log(process.env.ENV_NAME);

import app from './app';

const PORT = 3000;
const server = app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: port ${PORT} is already in use. Is another server or Docker container running?`);
    process.exit(1);
  }
  throw err;
});
