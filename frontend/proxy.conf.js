// BACKEND_PORT lets several checkouts run side by side, each with its own
// backend (`PORT` in the root .env) — `BACKEND_PORT=3001 npm start`. Unset,
// this is the same proxy the old proxy.conf.json declared.
const backendPort = process.env.BACKEND_PORT || 3000;

module.exports = {
  '/api/**': {
    target: `http://localhost:${backendPort}`,
    secure: false,
    logLevel: 'debug',
    changeOrigin: true,
  },
};
