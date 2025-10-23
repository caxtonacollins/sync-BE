import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        console.log('Redis Config:', {
          host: process.env.REDISHOST,
          port: process.env.REDISPORT,
          hasPassword: !!process.env.REDISPASSWORD,
        });

        const store = await redisStore({
          socket: {
            host: process.env.REDISHOST || 'localhost',
            port: parseInt(process.env.REDISPORT || '6379'),
          },
          password: process.env.REDISPASSWORD,
          username: process.env.REDISUSER || 'default',
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
