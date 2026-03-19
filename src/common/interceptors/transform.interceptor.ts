import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse {
  success: boolean;
  message: string;
  data: unknown;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse> {
    return next.handle().pipe(
      map((payload: { message?: string; data?: unknown }) => ({
        success: true,
        message: payload?.message ?? 'Request successful',
        data: payload?.data !== undefined ? payload.data : payload,
      })),
    );
  }
}
