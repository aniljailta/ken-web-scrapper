import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChatWidgetService } from './chatWidget.service';
import { SendMessageDTO } from './dto/sendMessage.dto';

@Controller('chatWidget')
export class ChatWidgetController {
  constructor(private readonly chatWidgetService: ChatWidgetService) {
    //
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
