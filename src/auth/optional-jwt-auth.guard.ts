import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { AuthenticatedRequest } from './authenticated-request.js'

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.headers.authorization) return true
    try {
      return await super.canActivate(context)
    } catch {
      throw new UnauthorizedException('Invalid or expired access token')
    }
  }
}
