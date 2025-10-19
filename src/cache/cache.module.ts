import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        const store = await redisStore({
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
          },
          password: process.env.REDIS_PASSWORD || undefined,
          database: parseInt(process.env.REDIS_DB || '0'),
          ttl: parseInt(process.env.REDIS_TTL || '60'), // Default TTL in seconds
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
