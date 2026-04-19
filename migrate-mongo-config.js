require('dotenv').config();

module.exports = {
  mongodb: {
    url: process.env.DB_URI || 'mongodb://localhost:27017/bpni',
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'migrations',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
