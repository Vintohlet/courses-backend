import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, PipelineStage, Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { User, UserDocument } from '../models/user.model.js'

const ACTIVE_STATUSES = [EnrollmentStatus.Active, EnrollmentStatus.Completed]
const COMPLETED_WEIGHT = 2

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
    limit = this.clampLimit(limit)
    return this.courses.aggregate([
      { $match: { isActive: true, _id: { $ne: new Types.ObjectId(courseId) }, $or: [{ category: source.category }, { tags: { $in: source.tags } }] } },
      { $addFields: { tagOverlap: { $size: { $setIntersection: ['$tags', source.tags] } }, popularity: { $ln: { $add: ['$enrollCount', 1] } } } },
      { $addFields: { recommendationScore: { $add: [{ $multiply: ['$tagOverlap', 2] }, { $multiply: ['$ratingAvg', 0.8] }, { $multiply: ['$popularity', 0.3] }] } } },
      { $sort: { recommendationScore: -1, ratingCount: -1, _id: 1 } }, { $limit: limit }, { $project: { fullDescription: 0, lessons: 0 } },
    ])
  }

  async forUser(userId?: string, requestedLimit = 6) {
    const limit = this.clampLimit(requestedLimit)
    if (!userId) return this.popular(limit, 'popular')

    const userObjectId = new Types.ObjectId(userId)
    const user = await this.users.findById(userObjectId).select('interests').lean()
    if (!user) throw new NotFoundException('User not found')

    const history = await this.enrollments
      .find({ userId: userObjectId, status: { $in: ACTIVE_STATUSES } })
      .select('courseId')
      .lean()
    const seenCourseIds = history.map((enrollment) => enrollment.courseId)

    if (seenCourseIds.length) {
      const collaborative = await this.collaborativeForUser(userObjectId, seenCourseIds, limit)
      if (collaborative.length) return collaborative
    }

    if (user.interests?.length) {
      const contentBased = await this.contentBasedForUser(user.interests, seenCourseIds, limit)
      if (contentBased.length) return contentBased
    }

    return this.popular(limit, seenCourseIds.length ? 'popular_fallback' : 'popular')
  }

  async explainCollaborativeForUser(userId: string) {
    const userObjectId = new Types.ObjectId(userId)
    const seenCourseIds = await this.enrollments
      .find({ userId: userObjectId, status: { $in: ACTIVE_STATUSES } })
      .distinct('courseId')
    if (!seenCourseIds.length) throw new Error('The selected user has no active or completed enrollments to explain.')
    return this.enrollments
      .aggregate(this.collaborativePipeline(userObjectId, seenCourseIds, 6))
      .explain('executionStats')
  }

  private async collaborativeForUser(userId: Types.ObjectId, seenCourseIds: Types.ObjectId[], limit: number) {
    return this.enrollments.aggregate(this.collaborativePipeline(userId, seenCourseIds, limit))
  }

  private collaborativePipeline(userId: Types.ObjectId, seenCourseIds: Types.ObjectId[], limit: number): PipelineStage[] {
    return [
      { $match: { userId, status: { $in: ACTIVE_STATUSES } } },
      {
        $set: {
          seedWeight: { $cond: [{ $eq: ['$status', EnrollmentStatus.Completed] }, COMPLETED_WEIGHT, 1] },
        },
      },
      {
        $lookup: {
          from: this.enrollments.collection.name,
          let: { seedCourseId: '$courseId', currentUserId: '$userId' },
          pipeline: [
            {
              $match: {
                status: { $in: ACTIVE_STATUSES },
                $expr: {
                  $and: [
                    { $eq: ['$courseId', '$$seedCourseId'] },
                    { $ne: ['$userId', '$$currentUserId'] },
                  ],
                },
              },
            },
            { $project: { userId: 1, status: 1 } },
          ],
          as: 'neighbors',
        },
      },
      { $unwind: '$neighbors' },
      {
        $group: {
          _id: '$neighbors.userId',
          seedCourses: {
            $addToSet: {
              courseId: '$courseId',
              weight: '$seedWeight',
            },
          },
        },
      },
      {
        $lookup: {
          from: this.enrollments.collection.name,
          let: { neighborUserId: '$_id' },
          pipeline: [
            {
              $match: {
                status: { $in: ACTIVE_STATUSES },
                courseId: { $nin: seenCourseIds },
                $expr: { $eq: ['$userId', '$$neighborUserId'] },
              },
            },
            { $project: { courseId: 1, status: 1 } },
          ],
          as: 'neighborCourses',
        },
      },
      { $unwind: '$neighborCourses' },
      { $unwind: '$seedCourses' },
      {
        $set: {
          contribution: {
            $multiply: [
              '$seedCourses.weight',
              { $cond: [{ $eq: ['$neighborCourses.status', EnrollmentStatus.Completed] }, COMPLETED_WEIGHT, 1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { candidateCourseId: '$neighborCourses.courseId', seedCourseId: '$seedCourses.courseId' },
          score: { $sum: '$contribution' },
        },
      },
      { $sort: { score: -1 } },
      {
        $group: {
          _id: '$_id.candidateCourseId',
          score: { $sum: '$score' },
          bestSeedCourseId: { $first: '$_id.seedCourseId' },
        },
      },
      {
        $lookup: {
          from: this.courses.collection.name,
          localField: '_id',
          foreignField: '_id',
          pipeline: [
            { $match: { isActive: true } },
            { $project: { fullDescription: 0, lessons: 0 } },
          ],
          as: 'course',
        },
      },
      { $unwind: '$course' },
      {
        $lookup: {
          from: this.courses.collection.name,
          localField: 'bestSeedCourseId',
          foreignField: '_id',
          pipeline: [{ $project: { title: 1 } }],
          as: 'basedOn',
        },
      },
      { $unwind: '$basedOn' },
      { $sort: { score: -1, 'course.ratingAvg': -1, 'course.ratingCount': -1 } },
      { $limit: limit },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$course',
              {
                recommendation: {
                  strategy: 'collaborative',
                  score: '$score',
                  reason: 'Users who enrolled in this course also enrolled in the recommended course.',
                  basedOnCourse: { id: '$basedOn._id', title: '$basedOn.title' },
                },
              },
            ],
          },
        },
      },
    ]
  }

  private async contentBasedForUser(interests: string[], seenCourseIds: Types.ObjectId[], limit: number) {
    const courses = await this.courses.aggregate([
      { $match: { isActive: true, _id: { $nin: seenCourseIds }, $or: [{ category: { $in: interests } }, { tags: { $in: interests } }] } },
      { $addFields: { interestMatch: { $size: { $setIntersection: [{ $concatArrays: [['$category'], '$tags'] }, interests] } }, popularity: { $ln: { $add: ['$enrollCount', 1] } } } },
      { $addFields: { recommendationScore: { $add: [{ $multiply: ['$interestMatch', 2] }, { $multiply: ['$ratingAvg', 0.8] }, { $multiply: ['$popularity', 0.3] }] } } },
      { $sort: { recommendationScore: -1, ratingCount: -1, _id: 1 } },
      { $limit: limit },
      { $project: { fullDescription: 0, lessons: 0 } },
    ])

    return courses.map((course) => ({
      ...course,
      recommendation: {
        strategy: 'content_based',
        score: course.recommendationScore,
        reason: 'The course matches topics in your interests.',
      },
    }))
  }

  private async popular(limit: number, strategy: 'popular' | 'popular_fallback') {
    const courses = await this.courses
      .find({ isActive: true })
      .sort({ ratingAvg: -1, ratingCount: -1, enrollCount: -1, _id: 1 })
      .limit(limit)
      .select('-fullDescription -lessons')
      .lean()

    return courses.map((course) => ({
      ...course,
      recommendation: {
        strategy,
        score: course.ratingAvg * 0.8 + Math.log(course.enrollCount + 1) * 0.3,
        reason: 'Popular courses ranked by rating and enrollment count.',
      },
    }))
  }

  private clampLimit(limit: number) {
    return Math.min(20, Math.max(1, limit))
  }
}
