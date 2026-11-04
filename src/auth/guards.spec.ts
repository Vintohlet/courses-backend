import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UserDocument } from '../models/user.model.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { AdminGuard } from './admin.guard.js'

function context(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = { headers: { authorization } }
  const execution = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { execution, request }
}

describe('Authentication guards', () => {
  it('rejects a missing bearer token', async () => {
    const jwt = { verifyAsync: vi.fn() }
    const users = { findById: vi.fn() }
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, users as unknown as import('mongoose').Model<UserDocument>)
    const { execution } = context()

    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(jwt.verifyAsync).not.toHaveBeenCalled()
  })

  it('uses current user data from the database after verifying JWT', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: '651000000000000000000001' }) }
    const user = { _id: '651000000000000000000001', name: 'Admin', email: 'admin@example.com', isAdmin: true }
    const users = { findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(user) }) }) }
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, users as unknown as import('mongoose').Model<UserDocument>)
    const { execution, request } = context('Bearer valid-token')

    await expect(guard.canActivate(execution)).resolves.toBe(true)
    expect(request.user).toEqual({ id: user._id, name: user.name, email: user.email, isAdmin: true })
  })

  it('rejects an invalid or expired token', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('expired')) }
    const users = { findById: vi.fn() }
    const guard = new JwtAuthGuard(jwt as unknown as JwtService, users as unknown as import('mongoose').Model<UserDocument>)

    await expect(guard.canActivate(context('Bearer expired-token').execution)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('allows only a current administrator', () => {
    const guard = new AdminGuard()
    const { execution, request } = context()
    expect(() => guard.canActivate(execution)).toThrow(UnauthorizedException)

    request.user = { id: 'id', name: 'Student', email: 'student@example.com', isAdmin: false }
    expect(() => guard.canActivate(execution)).toThrow(ForbiddenException)

    request.user = { id: 'id', name: 'Admin', email: 'admin@example.com', isAdmin: true }
    expect(guard.canActivate(execution)).toBe(true)
  })
})
