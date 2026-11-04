import { Request } from 'express'

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  isAdmin: boolean
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}
