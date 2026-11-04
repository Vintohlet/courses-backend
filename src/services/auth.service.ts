import { ConflictException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { Model } from 'mongoose'
import { compare, hash } from 'bcryptjs'
import { User, UserDocument } from '../models/user.model.js'
import { Topic, TopicDocument } from '../models/topic.model.js'

export interface RegisterInput { name: string; email: string; password: string; interests?: string[] }
export interface LoginInput { email: string; password: string }

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Topic.name) private readonly topics: Model<TopicDocument>,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const email = this.normalizeEmail(input.email)
    const interests = await this.validateInterests(input.interests ?? [])
    if (await this.users.exists({ email })) throw new ConflictException('Email is already registered')
    try {
      const user = await this.users.create({ name: input.name.trim(), email, passwordHash: await hash(input.password, 12), interests })
      return { user: this.publicUser(user), accessToken: await this.issueToken(user) }
    } catch (error) {
      if (this.isDuplicateKey(error)) throw new ConflictException('Email is already registered')
      throw error
    }
  }

  async login(input: LoginInput) {
    const user = await this.users.findOne({ email: this.normalizeEmail(input.email) }).select('+passwordHash')
    if (!user || !(await compare(input.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password')
    return { user: this.publicUser(user), accessToken: await this.issueToken(user) }
  }

  async validateInterests(values: string[]) {
    const slugs = [...new Set(values.map((value) => value.trim().toLowerCase()))]
    if (!slugs.length) return slugs
    const valid = await this.topics.find({ slug: { $in: slugs }, isActive: true }).distinct('slug')
    if (valid.length !== slugs.length) throw new UnprocessableEntityException('One or more interests are unknown or inactive')
    return slugs
  }

  private normalizeEmail(email: string) { return email.trim().toLowerCase() }
  private async issueToken(user: UserDocument) { return this.jwt.signAsync({ sub: user.id }) }
  private publicUser(user: UserDocument) {
    return { id: user.id, name: user.name, email: user.email, interests: user.interests, isAdmin: user.isAdmin }
  }
  private isDuplicateKey(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000 }
}
