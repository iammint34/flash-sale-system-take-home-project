// PM2 cluster mode simulates a horizontally-scaled tier: N Node workers behind one
// port (3000), load-balanced by the cluster master. this is only correct because the
// app tier is stateless — the reservation gate, buyers set, stock counter, order store
// and rate-limit config all live in redis/postgres, shared by every worker. a per-process
// counter would oversell the moment you add a second instance.
module.exports = {
  apps: [
    {
      name: 'flash-sale-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: Number(process.env.PM2_INSTANCES ?? 4),
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production', PORT: '3000' },
      // BullMQ workers run in every instance (concurrency capped per instance),
      // which is exactly the fan-out we want to exercise under load.
    },
  ],
};
