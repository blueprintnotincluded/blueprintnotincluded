// lib/server.ts
// initialize configuration
import dotenv from 'dotenv';
dotenv.config();
console.log(process.env.ENV_NAME);

import app from './app';

const PORT = 3000;
app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));
