import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private server: Server;
  private connectedClients = new Map<string, string>();

  setServer(server: Server) {
    this.server = server;
  }

  registerClient(clientId: string, userId: string) {
    this.connectedClients.set(clientId, userId);
  }

  deleteClient(userId: string) {
    this.connectedClients.delete(userId);
  }

  async sendProgress({
    userId,
    progress,
    finished = false,
  }: {
    userId: string;
    progress: number;
    finished?: boolean;
  }) {
    const normalizedUserId = String(userId);

    const entries = [...this.connectedClients.entries()].filter(
      ([_, uid]) => String(uid) === normalizedUserId,
    );

    // Get the last connection for that user
    const [socketID] = entries.length > 0 ? entries[entries.length - 1] : [];
    const socket = this.server.sockets.sockets.get(socketID);

    try {
      if (socketID) {
        socket.emit('one-pager/progress', {
          data: {
            progress,
            finished,
          },
        });
      }
    } catch (error) {
      this.logger.error('❌ Error While Sending Progress', error);

      socket.emit('one-pager/progress', {
        data: {
          progress: 100,
          finished: true,
        },
        error: error.message,
      });
    }
  }
}
