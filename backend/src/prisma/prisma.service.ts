import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    // prisma 7 connects through a driver adapter instead of a schema url
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('databaseUrl'),
      }),
    });
  }

  async onModuleInit() {
    // warm the pool, but don't crash the app if pg is down — /health reports it
    try {
      await this.$connect();
    } catch (err) {
      this.log.warn(`postgres unavailable at boot: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
