import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { UsersModule } from 'src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from 'src/products/products.module';
import { RequestTracker } from 'src/request-tracker/entities/request_tracker.entity';
import { RequestTrackerService } from 'src/request-tracker/request-tracker.service';
import { MixpanelModule } from 'src/mixpanel/mixpanel.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, RequestTracker]),
    UsersModule,
    ProductsModule,
    MixpanelModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService, ProductsModule, RequestTrackerService],
  exports: [ConversationService],
})
export class ConversationModule {}
