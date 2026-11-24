import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../config/app-config.service.js';
import { PrismaClient } from './generated/client.js';

/** The single Prisma client (and pg connection pool) for the process. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    const { url, poolMax, idleTimeoutMs } = config.database;
    super({
      adapter: new PrismaPg({
        connectionString: url,
        max: poolMax,
        idleTimeoutMillis: idleTimeoutMs,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
