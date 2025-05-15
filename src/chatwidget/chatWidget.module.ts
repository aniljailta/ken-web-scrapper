import { Module } from '@nestjs/common';
import { ChatWidgetController } from './chatWidget.controller';
import { ChatWidgetService } from './chatWidget.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebinarChat } from './entities/webinar_chat.entity';
import { WebinarConversation } from './entities/webinar_conversation.entity';
import { WebinarSession } from './entities/webinar_session.entity';

@Module({
  controllers: [ChatWidgetController],
  imports: [
    TypeOrmModule.forFeature([
      WebinarChat,
      WebinarConversation,
      WebinarSession,
    ]),
  ],
  providers: [ChatWidgetService],
})
export class ChatWidgetModule {}
