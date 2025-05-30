import { Body, Controller, Get, Param, Post, Response } from '@nestjs/common';
import { ChatWidgetService } from './chatWidget.service';
import { SendMessageDTO } from './dto/sendMessage.dto';

@Controller('chatWidget')
export class ChatWidgetController {
  constructor(private readonly chatWidgetService: ChatWidgetService) {
    //
  }

  @Get('/demo')
  async renderDemoPage(@Response() res) {
    res.sendFile('webinar_demo.html', {
      root: './public',
    });
  }

  @Post('trigger-session-closing/:sessionId')
  async triggerSessionClosing(@Param('sessionId') sessionId: string) {
    //
    return this.chatWidgetService.triggerSessionClosing(sessionId);
  }

  @Post('trigger-session-follow-up/:sessionId')
  async triggerSessionFollowUP(@Param('sessionId') sessionId: string) {
    //
    return this.chatWidgetService.triggerSessionFollowUp(sessionId);
  }

  @Post('chat')
  async sendMessage(@Body() data: SendMessageDTO) {
    //
    return this.chatWidgetService.startChat(data);
  }

  @Get('get-conversation/:id')
  async getConversation(@Param('id') id: string) {
    //
    return this.chatWidgetService.getConversation(id);
  }
}
