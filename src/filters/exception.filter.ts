import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message
        : (exception as any)?.message || 'Unexpected error occurred';

    const stack = (exception as any)?.stack || null;

    this.logger.error(`Exception thrown: ${JSON.stringify(message)}\n${stack}`);

    response.status(status).json({
      message,
      error: {
        message: message,
        error: exception,
        path: request.url,
        statusCode: status,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
