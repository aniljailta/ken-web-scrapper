import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ADMIN_USER_VALUES } from 'src/products/constants';
import { RequestTrackerService } from 'src/request-tracker/request-tracker.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class LifetimeRequestGuard extends AuthGuard('jwt') {
  constructor(
    private readonly requestTrackerService: RequestTrackerService,
    private readonly userService: UsersService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Attempt to validate the token and populate request.user
      await super.canActivate(context);
    } catch {}

    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    // Check if the user is authenticated (skip limit for authenticated users)
    if (request.user) {
      return true;
    }

    // Track the request and get the current count
    const requestCount = await this.requestTrackerService.trackRequest(ip);

    const userPerDayRequestData = await this.userService.findUserValueByName(
      ADMIN_USER_VALUES.FREE_REQUEST_PER_DAY,
    );

    const userPerDayRequestCount = Number(userPerDayRequestData?.text) || 10;
    // Block if the request count exceeds the daily limit
    if (requestCount > userPerDayRequestCount) {
      throw new ForbiddenException({
        message:
          "You've reached the limit for the number of questions in this chat. Please log in to continue and access more information.",
        code: 'FORBIDDEN',
      });
    }

    return true;
  }

  /**
   * Override handleRequest to match the expected public signature.
   * This prevents the default behavior of throwing an error when
   * authentication fails.
   */
  public handleRequest<TUser = any>(_: any, user: any): TUser {
    return user;
  }
}
