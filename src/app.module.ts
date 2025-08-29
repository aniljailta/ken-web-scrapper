import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

import { RequestTrackerService } from './request-tracker/request-tracker.service';
import { RequestTracker } from './request-tracker/entities/request_tracker.entity';
import { LifetimeRequestGuard } from './guards/lifetime-request.guard';
import { MixpanelModule } from './mixpanel/mixpanel.module';
import { OnePagerModule } from './one-pager/one-pager.module';
import { S3Service } from './s3/s3.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/scraper-api',
    }),
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigModule available globally
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'), // Use DATABASE_URL directly
        entities: [join(__dirname, '**', '*.entity.{ts,js}')],
        synchronize: true, // Use only for development
        ssl: {
          rejectUnauthorized: false,
        },
      }),
    }),
    UsersModule,
    AuthModule,
    TypeOrmModule.forFeature([RequestTracker]),
    MixpanelModule,
    OnePagerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestTrackerService,
    LifetimeRequestGuard,
    S3Service,
  ],
})
export class AppModule {}
