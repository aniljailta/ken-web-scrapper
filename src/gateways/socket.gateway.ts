import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { Server, Socket } from 'socket.io';
import { OnePagerService } from 'src/one-pager/one-pager.service';
import { TopicJSON } from 'src/one-pager/type';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/socket',
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private connectedClients = new Map<string, string>();

  constructor(private readonly onePagerService: OnePagerService) {}

  private readonly logger = new Logger(SocketGateway.name);

  handleConnection(client: Socket) {
    const userID = client.handshake.query.userID as string;

    if (userID) {
      this.connectedClients.set(userID, client.id);
      this.logger.log(
        `⚡ User ${userID} connected with Socket ID: ${client.id}`,
      );
    } else {
      this.logger.log(
        `⚡ Anonymous user connected with Socket ID: ${client.id}`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userID, socketID] of this.connectedClients.entries()) {
      if (socketID === client.id) {
        this.connectedClients.delete(userID);
        break;
      }
    }
  }

  askUserForEmail(userID: string) {
    const socketID = this.connectedClients.get(userID);
    if (socketID) {
      const socket = this.server.sockets.sockets.get(socketID);
      if (socket) {
        socket.emit('intent-email', {});
      }
    }
  }

  sendMessageToUser(userID: string, message: ChatCompletionChunk.Choice) {
    const socketID = this.connectedClients.get(userID);
    if (socketID) {
      const socket = this.server.sockets.sockets.get(socketID);
      if (socket) {
        socket.emit('stream-chat', { message });
      }
    }
  }

  @SubscribeMessage('one-pager/process')
  async processOnePager(
    client: Socket,
    {
      id,
      branding = {},
      isTesting = false,
      userId,
      pagerJsonPrompt = null,
      topicClusterPrompt = null,
    }: {
      id: string;
      branding: any;
      userId: string;
      isTesting?: boolean;
      topicClusterPrompt?: string;
      pagerJsonPrompt?: string;
    },
  ) {
    const socketID = this.connectedClients.get(userId);
    const socket = this.server.sockets.sockets.get(socketID);

    try {
      const { data: response } =
        await this.onePagerService.generateAllOnePagers({
          pagerId: id,
          branding,
          userId,
          isTesting,
          pagerJsonPrompt,
          topicClusterPrompt,
        });

      this.logger.debug('Emitting processed content back to user');

      socket.emit('one-pager/processed', { data: response });
    } catch (error) {
      this.logger.error('❌ Error processing one pager:', error);

      socket.emit('one-pager/processed', {
        data: null,
        error: error.message,
      });
    }
  }

  @SubscribeMessage('one-pager/edit')
  async triggerPagerEdit(
    client: Socket,
    {
      id,
      userId,
      content,
      topicIndex,
    }: {
      id: string;
      userId: string;
      topicIndex: number;
      content: TopicJSON;
    },
  ) {
    const socketID = this.connectedClients.get(userId);
    const socket = this.server.sockets.sockets.get(socketID);

    try {
      const response = await this.onePagerService.editPagerContent({
        id,
        userId,
        content,
        topicIndex,
      });

      this.logger.debug('Triggering Pager Page Update!');
      socket?.emit('one-pager/processed', { data: response });
    } catch (error) {
      this.logger.error('❌ Error Editing one pager:', error);

      socket.emit('one-pager/processed', {
        data: null,
        error: error.message,
      });
    }
  }
  @SubscribeMessage('one-pager/text-enhance')
  async triggerEnhancements(
    client: Socket,
    {
      initialValue,
      sectionType,
    }: {
      sectionType: string;
      initialValue: string;
    },
  ) {
    try {
      this.logger.debug('Triggering Fragment Enhancement!');

      const response = await this.onePagerService.enhanceTextSection({
        initialValue,
        sectionType,
      });

      if (!response) {
        return {
          data: null,
          error: 'Failed to Generate Variation Try After sometime!',
        };
      }

      return {
        data: response,
      };
    } catch (error) {
      this.logger.error('❌ Error Failed to generate Variation!:', error);
      return {
        data: null,
        error: error.message,
      };
    }
  }
}
