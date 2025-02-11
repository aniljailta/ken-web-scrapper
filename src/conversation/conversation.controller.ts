import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { LifetimeRequestGuard } from 'src/guards/lifetime-request.guard';
import { AuthGuard } from '@nestjs/passport';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('chat')
  @UseGuards(LifetimeRequestGuard)
  async queryFunctionCalling(
    @Req() req,
    @Body('question') question: string,
  ): Promise<{
    data: string | any;
    isAIResponse?: boolean;
    conversationId?: string;
  }> {
    if (!question || typeof question !== 'string') {
      throw new Error('Invalid user query.');
    }

    const userId = req.user?.id;

    const { data, conversationId: conId } =
      await this.conversationService.newConversation({
        userQuery: question,
        userId: userId || null,
      });
    return { data, conversationId: conId };
  }

  @Post('thread')
  @UseGuards(LifetimeRequestGuard)
  async chatThreadCalling(
    @Req() req,
    @Body('question') question: string,
    @Body('conversationId') conversationId?: string,
  ): Promise<{
    data: string | any;
    isAIResponse?: boolean;
    conversationId: string;
  }> {
    if (!question || typeof question !== 'string') {
      throw new Error('Invalid user query.');
    }

    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Not a valid conversation');
    }

    const userId = req.user?.id;

    const { data, conversationId: conId } =
      await this.conversationService.threadConversation({
        userQuery: question,
        userId: userId || null,
        conversationId: conversationId,
      });
    return { data, conversationId: conId };
  }

  @Get('messages')
  @UseGuards(AuthGuard('jwt'))
  async getConversationMessage(
    @Req() req,
    @Query('conversationId') conversationId: string,
  ): Promise<Conversation> {
    const userId = req.user?.id;

    if (!conversationId || !userId) {
      throw new UnauthorizedException('User or Conversation ID is missing.');
    }

    const data = await this.conversationService.getConversationMessages({
      userId,
      conversationId,
    });

    if (!data) {
      throw new NotFoundException('Messages not found');
    }

    return data;
  }

  @Get('all-chat')
  @UseGuards(AuthGuard('jwt'))
  async getAllConversationChat(@Req() req): Promise<Conversation[]> {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User or Conversation ID is missing.');
    }

    const data = await this.conversationService.getAllConversationChat({
      userId,
    });

    if (!data) {
      throw new NotFoundException('Messages not found');
    }

    return data;
  }

  @Post('message/reaction')
  @UseGuards(AuthGuard('jwt'))
  async updateMessageReaction(
    @Body('messageId') messageId: string,
    @Body('reactionStatus') reactionStatus: boolean | null,
  ): Promise<{
    message: string;
    data: Message;
  }> {
    if (!messageId || typeof messageId !== 'string') {
      throw new BadRequestException('Invalid message ID');
    }

    if (
      reactionStatus !== true &&
      reactionStatus !== false &&
      reactionStatus !== null
    ) {
      throw new BadRequestException('Invalid reaction status');
    }

    const updatedMessage = await this.conversationService.updateMessageReaction(
      {
        messageId,
        reactionStatus,
      },
    );

    return { message: 'Reaction updated successfully', data: updatedMessage };
  }

  @Delete('chat/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteConversationChat(@Param('id') chatId: string): Promise<any> {
    if (!chatId) {
      throw new BadRequestException('Chat ID is required');
    }

    await this.conversationService.deleteConversationChat(chatId);

    return { message: 'Chat deleted successfully' };
  }
}
