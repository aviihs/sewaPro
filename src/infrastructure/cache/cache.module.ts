import { Global, Module } from '@nestjs/common';
import { Cache } from '../../common/ports/cache.port.js';
import { InMemoryCache } from './in-memory.cache.js';

@Global()
@Module({
  providers: [{ provide: Cache, useFactory: (): Cache => new InMemoryCache() }],
  exports: [Cache],
})
export class CacheModule {}
