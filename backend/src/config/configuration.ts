export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  // admin is identified by a configured user id (demo-grade auth — see README)
  adminUserId: process.env.ADMIN_USER_ID ?? 'admin123',
  sale: {
    productName: process.env.SALE_PRODUCT_NAME ?? 'Limited Edition Item',
    totalStock: parseInt(process.env.SALE_TOTAL_STOCK ?? '100', 10),
    // window derived at seed time: start = now + offset, end = start + duration
    startOffsetMinutes: parseInt(process.env.SALE_START_OFFSET_MINUTES ?? '0', 10),
    durationMinutes: parseInt(process.env.SALE_DURATION_MINUTES ?? '60', 10),
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    enabled: (process.env.RATE_LIMIT_ENABLED ?? 'true') === 'true',
  },
});
