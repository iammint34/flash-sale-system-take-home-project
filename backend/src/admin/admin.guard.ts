import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

// admin is just a configured user id — the caller proves it by sending that id
// in x-user-id. deliberately demo-grade (well-known id, no secret); a real
// system would use proper authn/z + roles. see README "Admin auth".
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const userId = req.headers['x-user-id'];
    if (userId !== this.config.getOrThrow<string>('adminUserId')) {
      throw new UnauthorizedException('admin access required');
    }
    return true;
  }
}
