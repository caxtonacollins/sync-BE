import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
          console.warn('REDIS_URL not set, using in-memory cache');
          return {
            ttl: parseInt(process.env.REDIS_TTL || '60'),
          };
        }

        try {
          const store = await redisStore({
            url: redisUrl,
            ttl: parseInt(process.env.REDIS_TTL || '60'),
          });

          return {
            store: store as any,
            ttl: parseInt(process.env.REDIS_TTL || '60'),
          };
        } catch (error) {
          console.error('Failed to connect to Redis, falling back to in-memory cache:', error);
          return {
            ttl: parseInt(process.env.REDIS_TTL || '60'),
          };
        }
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule { }
