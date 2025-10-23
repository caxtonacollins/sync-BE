import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        let redisConfig;

        if (process.env.REDISHOST && process.env.REDISPORT) {
          redisConfig = {
            socket: {
              host: process.env.REDISHOST,
              port: parseInt(process.env.REDISPORT),
            },
            password: process.env.REDISPASSWORD,
            username: process.env.REDISUSER || 'default',
          };
        } else {
          redisConfig = {
            socket: {
              host: 'localhost',
              port: 6379,
            },
          };
        }

        const store = await redisStore({
          ...redisConfig,
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
