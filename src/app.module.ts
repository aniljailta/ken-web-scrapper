import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScraperModule } from './scraper/scraper.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

import { RequestTrackerService } from './request-tracker/request-tracker.service';
import { RequestTracker } from './request-tracker/entities/request_tracker.entity';
import { LifetimeRequestGuard } from './guards/lifetime-request.guard';
import { ConversationModule } from './conversation/conversation.module';
import { MixpanelModule } from './mixpanel/mixpanel.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
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
    ScraperModule,
    ProductsModule,
    UsersModule,
    AuthModule,
    TypeOrmModule.forFeature([RequestTracker]),
    ConversationModule,
    MixpanelModule,
  ],
  controllers: [AppController],
  providers: [AppService, RequestTrackerService, LifetimeRequestGuard],
})
export class AppModule {}
