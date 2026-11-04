import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { User, UserDocument } from '../models/user.model.js'

@Injectable()
export class RecommendationService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async similar(courseId: string, limit = 6) {
    const source = await this.courses.findById(courseId).select('category tags').lean()
    if (!source) throw new NotFoundException('Course not found')
    limit = Math.min(20, Math.max(1, limit))
    return this.courses.aggregate([
      { $match: { isActive: true, _id: { $ne: new Types.ObjectId(courseId) }, $or: [{ category: source.category }, { tags: { $in: source.tags } }] } },
      { $addFields: { tagOverlap: { $size: { $setIntersection: ['$tags', source.tags] } }, popularity: { $ln: { $add: ['$enrollCount', 1] } } } },
      { $addFields: { recommendationScore: { $add: [{ $multiply: ['$tagOverlap', 2] }, { $multiply: ['$ratingAvg', 0.8] }, { $multiply: ['$popularity', 0.3] }] } } },
      { $sort: { recommendationScore: -1, ratingCount: -1 } }, { $limit: limit }, { $project: { fullDescription: 0, lessons: 0 } },
    ])
  }

  async forUser(userId?: string, limit = 6) {
    limit = Math.min(20, Math.max(1, limit))
    if (!userId) return this.courses.find({ isActive: true }).sort({ ratingAvg: -1, ratingCount: -1, enrollCount: -1 }).limit(limit).select('-fullDescription -lessons').lean()
    const user = await this.users.findById(userId).select('interests').lean()
    if (!user) throw new NotFoundException('User not found')
    const done = await this.enrollments.find({ userId, status: { $in: [EnrollmentStatus.Active, EnrollmentStatus.Completed] } }).distinct('courseId')
    return this.courses.aggregate([
      { $match: { isActive: true, _id: { $nin: done }, $or: [{ category: { $in: user.interests } }, { tags: { $in: user.interests } }] } },
      { $addFields: { interestMatch: { $size: { $setIntersection: [{ $concatArrays: [['$category'], '$tags'] }, user.interests] } }, popularity: { $ln: { $add: ['$enrollCount', 1] } } } },
      { $addFields: { recommendationScore: { $add: [{ $multiply: ['$interestMatch', 2] }, { $multiply: ['$ratingAvg', 0.8] }, { $multiply: ['$popularity', 0.3] }] } } },
      { $sort: { recommendationScore: -1, ratingCount: -1 } }, { $limit: limit }, { $project: { fullDescription: 0, lessons: 0 } },
    ])
  }
}
