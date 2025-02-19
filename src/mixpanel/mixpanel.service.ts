import { Injectable, Logger } from '@nestjs/common';
import * as mixpanel from 'mixpanel';

@Injectable()
export class MixpanelService {
  private mixpanel;
  private readonly logger = new Logger(MixpanelService.name);
  constructor() {
    const token = process.env.MIXPANEL_TOKEN;

    if (!token) {
      this.logger.warn(
        'Mixpanel token is missing! Please set MIXPANEL_TOKEN in your environment variables.',
      );
      return;
    }

    this.mixpanel = mixpanel.init(token);
  }

  track(event: string, data: Record<string, any>) {
    try {
      if (!this.mixpanel) {
        this.logger.warn(
          `Mixpanel event "${event}" not tracked. Missing token.`,
        );
        return;
      }
      this.mixpanel.track(event, data);
    } catch (error) {
      this.logger.error('Mixpanel tracking error:', error?.message);
    }
  }
}
