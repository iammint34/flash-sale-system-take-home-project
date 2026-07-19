import 'dotenv/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { FULFILLMENT_QUEUE } from './fulfillment/fulfillment.constants';

// Standalone load generator + invariant checker. Deliberately NOT a Nest app —
// it drives the running cluster over HTTP and inspects redis/postgres directly,
// so it never becomes a fulfillment worker itself. Point it at the PM2 cluster
// (or a single instance) and it proves: no oversell, one-item-per-user, durable
// order count == stock.
//
// Run a fresh seed first isn't required — the script hard-resets the current
// sale's runtime state so it's re-runnable on its own.

const TARGET = process.env.STRESS_TARGET ?? 'http://localhost:3000';
const ADMIN_ID = process.env.ADMIN_USER_ID ?? 'admin123';
const STOCK = Number(process.env.STRESS_STOCK ?? 1000);
const BUYERS = Number(process.env.STRESS_BUYERS ?? 5000);
const DUPES = Number(process.env.STRESS_DUPES ?? 500);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY ?? 150);

type Result = 'success' | 'already_purchased' | 'sold_out' | 'not_active' | 'error';

async function purchase(userId: string): Promise<Result> {
  try {
    const r = await fetch(`${TARGET}/sale/purchase`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!r.ok) return 'error';
    return (await r.json()).result as Result;
  } catch {
    return 'error';
  }
}

async function adminPatch(path: string, body: unknown) {
  const r = await fetch(`${TARGET}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_ID },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// bounded-concurrency runner — keeps `limit` requests in flight at once
async function runPool(
  tasks: (() => Promise<void>)[],
  limit: number,
  onProgress: (done: number) => void,
) {
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      await tasks[i]();
      onProgress(++done);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
}

async function count(pool: Pool, sql: string, params: unknown[]) {
  return Number((await pool.query(sql, params)).rows[0].count);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new Redis(process.env.REDIS_URL as string);

  console.log(
    `[setup] target=${TARGET} stock=${STOCK} buyers=${BUYERS} dupes=${DUPES} concurrency=${CONCURRENCY}`,
  );

  const sale = await pool.query(
    'SELECT id FROM sales ORDER BY created_at DESC LIMIT 1',
  );
  if (sale.rowCount === 0) {
    throw new Error('no sale found — run `npm run seed` once to create one');
  }
  const saleId = sale.rows[0].id as string;

  // hard reset so a re-run starts clean: drop this sale's orders, the redis
  // buyers set, and any leftover fulfillment jobs.
  await pool.query('DELETE FROM orders WHERE sale_id = $1', [saleId]);
  await redis.del(`sale:${saleId}:buyers`);
  const queue = new Queue(FULFILLMENT_QUEUE, {
    connection: { url: process.env.REDIS_URL as string },
  });
  await queue.obliterate({ force: true });

  // make the sale unambiguously active with exactly STOCK, throttling off
  await adminPatch('/admin/sale/rate-limit', { enabled: false });
  const summary = await adminPatch('/admin/sale', {
    startTime: new Date(Date.now() - 60_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
    totalStock: STOCK,
  });
  console.log('[setup] sale is now', summary.status, `remaining=${summary.remaining}`);

  // build the attempt list: BUYERS unique + DUPES duplicates of the first users
  const attempts: string[] = [];
  for (let i = 0; i < BUYERS; i++) attempts.push(`u${i}`);
  for (let i = 0; i < DUPES; i++) attempts.push(`u${i}`);
  // deterministic shuffle so duplicates interleave with fresh buyers
  for (let i = attempts.length - 1; i > 0; i--) {
    const j = (i * 2654435761) % (i + 1);
    [attempts[i], attempts[j]] = [attempts[j], attempts[i]];
  }

  const tally: Record<Result, number> = {
    success: 0,
    already_purchased: 0,
    sold_out: 0,
    not_active: 0,
    error: 0,
  };
  const t0 = Date.now();
  await runPool(
    attempts.map((u) => async () => {
      tally[await purchase(u)]++;
    }),
    CONCURRENCY,
    (d) => {
      if (d % 1000 === 0) console.log(`  ...${d}/${attempts.length}`);
    },
  );
  const elapsed = (Date.now() - t0) / 1000;
  console.log(
    `[load] ${attempts.length} requests in ${elapsed.toFixed(1)}s (~${Math.round(
      attempts.length / elapsed,
    )} req/s)`,
  );
  console.log('[load] results:', tally);

  const expected = Math.min(BUYERS, STOCK);

  // fulfillment is async — wait for the worker(s) to persist every winner
  let confirmed = 0;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    confirmed = await count(
      pool,
      `SELECT count(*) FROM orders WHERE sale_id = $1 AND status = 'confirmed'`,
      [saleId],
    );
    if (confirmed >= expected) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // deterministic edge checks against the sold-out sale
  const winner = (
    await pool.query('SELECT user_id FROM orders WHERE sale_id = $1 LIMIT 1', [
      saleId,
    ])
  ).rows[0]?.user_id as string | undefined;
  const dupOfWinner = winner ? await purchase(winner) : 'error';
  const lateBuyer = await purchase(`late-${Date.now()}`);

  // final state from the sources of truth
  const redisRemaining = Number(await redis.get(`sale:${saleId}:stock`));
  const buyersSet = Number(await redis.scard(`sale:${saleId}:buyers`));
  const totalOrders = await count(
    pool,
    'SELECT count(*) FROM orders WHERE sale_id = $1',
    [saleId],
  );
  const distinctUsers = await count(
    pool,
    'SELECT count(DISTINCT user_id) FROM orders WHERE sale_id = $1',
    [saleId],
  );

  const checks: [string, boolean, string][] = [
    ['HTTP successes == stock', tally.success === expected, `${tally.success} / ${expected}`],
    ['zero not_active', tally.not_active === 0, `${tally.not_active}`],
    ['zero request errors', tally.error === 0, `${tally.error}`],
    ['redis remaining == 0', redisRemaining === STOCK - expected, `${redisRemaining}`],
    ['redis buyers set == stock', buyersSet === expected, `${buyersSet} / ${expected}`],
    ['confirmed orders == stock', confirmed === expected, `${confirmed} / ${expected}`],
    ['no duplicate user orders', totalOrders === distinctUsers, `${totalOrders} orders, ${distinctUsers} users`],
    ['dup of a winner rejected', dupOfWinner === 'already_purchased', dupOfWinner],
    ['late buyer sold out', lateBuyer === 'sold_out', lateBuyer],
  ];

  console.log('\n=== invariants ===');
  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    ok &&= pass;
  }
  console.log(`\n${ok ? '✅ ALL INVARIANTS HELD' : '❌ INVARIANT VIOLATION'}`);

  await queue.close();
  await pool.end();
  redis.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
