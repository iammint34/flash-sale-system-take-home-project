import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// prisma 7 no longer auto-loads .env or reads package.json#prisma
export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  // used by cli commands (migrate, studio); runtime uses the client's adapter
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
