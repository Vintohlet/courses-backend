import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from '../models/user.model.js'
import { Enrollment, EnrollmentDocument } from '../models/enrollment.model.js'
import { AuthService } from './auth.service.js'

export interface UpdateProfileInput { name?: string; email?: string; interests?: string[] }

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    private readonly auth: AuthService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.users.findById(userId).select('-passwordHash').lean()
    if (!user) throw new NotFoundException('User not found')
    const enrollments = await this.enrollments.find({ userId: new Types.ObjectId(userId) }).populate('courseId', 'title category ratingAvg ratingCount lessons').lean()
    return {
      ...user,
      courses: enrollments.map((enrollment: any) => ({
        course: enrollment.courseId,
        status: enrollment.status,
        progress: enrollment.courseId?.lessons?.length
          ? Math.round((enrollment.completedLessons.length / enrollment.courseId.lessons.length) * 100)
          : 0,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
      })),
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const update: Record<string, unknown> = {}
    if (input.name !== undefined) update.name = input.name.trim()
    if (input.email !== undefined) update.email = input.email.trim().toLowerCase()
    if (input.interests !== undefined) update.interests = await this.auth.validateInterests(input.interests)
    try {
      const user = await this.users.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true }).select('-passwordHash')
      if (!user) throw new NotFoundException('User not found')
      return user
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictException('Email is already registered')
      throw error
    }
  }
}
