import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { AuditService } from '../services/audit.service';
import {
  AUDIT_METADATA_KEY,
  type AuditMetadata,
} from '../decorators/auditable.decorator';
import { extractClientIp } from 'src/shared/utils/network.utils';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata | undefined>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );

    if (metadata === undefined) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    const entityId = this.extractEntityId(request, metadata.entityIdParam);

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.logAudit(metadata, entityId, user, request, result);
        },
        error: () => {},
      }),
    );
  }

  private extractEntityId(
    request: AuthenticatedRequest,
    paramName?: string,
  ): string {
    if (paramName) {
      const paramValue = request.params[paramName];
      return typeof paramValue === 'string' ? paramValue : 'unknown';
    }
    return 'unknown';
  }

  private async logAudit(
    metadata: AuditMetadata,
    entityId: string,
    user: { id: string } | undefined,
    request: AuthenticatedRequest,
    result: unknown,
  ): Promise<void> {
    const finalEntityId = this.resolveEntityId(entityId, result);

    const entityName = this.resolveEntityName(result);

    await this.auditService.log(
      {
        eventType: metadata.eventType,
        entityType: metadata.entityType,
        entityId: finalEntityId,
        entityName,
        action: metadata.action,
        newValues:
          metadata.captureNewValues && result
            ? this.sanitizeValues(result)
            : null,
      },
      {
        actorId: user?.id ?? null,
        actorIp: extractClientIp(request),
        actorUserAgent: this.extractUserAgent(request),
      },
    );
  }

  private resolveEntityName(result: unknown): string | null {
    if (!result || typeof result !== 'object') {
      return null;
    }
    const obj = result as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.email === 'string') return obj.email;
    if (typeof obj.certificateNumber === 'string') return obj.certificateNumber;
    return null;
  }

  private resolveEntityId(entityId: string, result: unknown): string {
    if (entityId !== 'unknown') {
      return entityId;
    }
    if (result && typeof result === 'object' && 'id' in result) {
      return String((result as { id: unknown }).id);
    }
    return entityId;
  }

  private extractUserAgent(request: AuthenticatedRequest): string | null {
    const userAgent = request.headers['user-agent'];
    return typeof userAgent === 'string' ? userAgent : null;
  }

  private sanitizeValues(obj: unknown): Record<string, unknown> | null {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'secret',
      'accessToken',
      'refreshToken',
    ];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (sensitiveFields.includes(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeValues(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
