import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { extractClientIp } from 'src/shared/utils';

/** Extracts real client IP from proxy headers. Bypasses throttling in dev mode. */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ThrottlerBehindProxyGuard.name);

  protected override getTracker(req: Request): Promise<string> {
    return Promise.resolve(extractClientIp(req) ?? 'unknown');
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') {
      try {
        await super.canActivate(context);
      } catch (err) {
        if (err instanceof ThrottlerException) {
          const req = context.switchToHttp().getRequest<Request>();
          this.logger.warn(
            `[DEV] Rate limit would be exceeded for ${req.method} ${req.url} ` +
              `from IP ${req.ip} - bypassed in development mode`,
          );
        }
      }
      return true;
    }

    return super.canActivate(context);
  }
}
