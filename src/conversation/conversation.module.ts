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
import { SocketGateway } from 'src/gateways/socket.gateway';
import { OnePagerService } from 'src/one-pager/one-pager.service';
import { Pager } from 'src/one-pager/entities/pager.entity';
import { SystemPrompts } from 'src/one-pager/entities/system-prompts.entity';
import { PagerChunks } from 'src/one-pager/entities/pager-chunks.entity';
import { PagerPage } from 'src/one-pager/entities/pager-page.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      RequestTracker,
      Pager,
      SystemPrompts,
      PagerChunks,
      PagerPage,
    ]),
    UsersModule,
    ProductsModule,
    MixpanelModule,
  ],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    OnePagerService,
    ProductsModule,
    RequestTrackerService,
    SocketGateway,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
