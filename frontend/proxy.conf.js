// Where the dev server sends /api. BACKEND_HOST and BACKEND_PORT let several
// checkouts run side by side, each with its own backend, and let the dev
// server live in a different container from the backend (`BACKEND_HOST=api`,
// the compose service name). Unset, this is the same proxy the old
// proxy.conf.json declared.
const backendHost = process.env.BACKEND_HOST || 'localhost';
const backendPort = process.env.BACKEND_PORT || 3000;

module.exports = {
  '/api/**': {
    target: `http://${backendHost}:${backendPort}`,
    secure: false,
    logLevel: 'debug',
    changeOrigin: true,
  },
};
