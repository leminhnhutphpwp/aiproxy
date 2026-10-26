module.exports = {
  name: 'aiproxy',
  cwd: __dirname,
  script: 'server.js',
  env: { NODE_ENV: 'production' },
  max_restarts: 10,
  restart_delay: 3000,
  watch: false,
};
