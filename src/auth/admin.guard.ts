import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthenticatedRequest } from './authenticated-request.js'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.user) throw new UnauthorizedException('Authentication is required')
    if (!request.user.isAdmin) throw new ForbiddenException('Administrator privileges required')
    return true
  }
}
