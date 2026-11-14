module.exports = {
  apps: [{
    name: 'tiktok-printer',
    script: 'server.mjs',
    cwd: __dirname,
    env: { PORT: 2050 },
    max_restarts: 10,
    restart_delay: 3000,
  }],
};
