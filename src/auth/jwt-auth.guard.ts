import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from '../models/user.model.js'
import { AuthenticatedRequest } from './authenticated-request.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = this.readBearerToken(request.headers.authorization)
    if (!token) throw new UnauthorizedException('Bearer token is required')

    let payload: { sub?: string }
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string }>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired access token')
    }
    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) throw new UnauthorizedException('Invalid access token')
    const user = await this.users.findById(payload.sub).select('name email isAdmin').lean()
    if (!user) throw new UnauthorizedException('Invalid access token')
    request.user = { id: String(user._id), name: user.name, email: user.email, isAdmin: Boolean(user.isAdmin) }
    return true
  }

  protected readBearerToken(authorization?: string) {
    if (!authorization) return undefined
    const match = /^Bearer\s+(.+)$/i.exec(authorization)
    return match?.[1]
  }
}
