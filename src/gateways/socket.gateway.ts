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
      userId,
    }: { id: string; branding: any; userId: string },
  ) {
    const socketID = this.connectedClients.get(userId);
    const socket = this.server.sockets.sockets.get(socketID);

    try {
      const { data: response } =
        await this.onePagerService.generateAllOnePagers(id, branding, userId);

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
}
