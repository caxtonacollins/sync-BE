import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        const redisUrl = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL;
        
        const store = await redisStore({
          url: redisUrl || 'redis://localhost:6379',
          isGlobal: true,
          database: parseInt(process.env.REDIS_DB || '0'),
          ttl: parseInt(process.env.REDIS_TTL || '60'),
        });

        return {
          store: store as any,
          ttl: parseInt(process.env.REDIS_TTL || '60'),
        };
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
