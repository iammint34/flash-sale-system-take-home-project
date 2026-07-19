import * as Joi from 'joi';

// fail fast at boot if required env is missing or malformed
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  ADMIN_USER_ID: Joi.string().default('admin123'),
  SALE_PRODUCT_NAME: Joi.string().default('Limited Edition Item'),
  SALE_TOTAL_STOCK: Joi.number().integer().min(0).default(100),
  SALE_START_OFFSET_MINUTES: Joi.number().integer().default(0),
  SALE_DURATION_MINUTES: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_TTL: Joi.number().default(60),
  RATE_LIMIT_MAX: Joi.number().default(100),
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
});
