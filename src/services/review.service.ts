import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { Interaction, InteractionDocument, InteractionType } from '../models/interaction.model.js'
import { Review, ReviewDocument } from '../models/review.model.js'

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(Review.name) private readonly reviews: Model<ReviewDocument>,
    @InjectModel(Interaction.name) private readonly interactions: Model<InteractionDocument>,
  ) {}

  async upsert(courseId: string, userId: string, rating: number, text = '') {
    if (!(await this.courses.exists({ _id: courseId }))) throw new NotFoundException('Course not found')
    const enrollment = await this.enrollments.findOne({ courseId, userId, status: EnrollmentStatus.Completed })
    if (!enrollment) throw new ForbiddenException('Complete the course before reviewing it')
    const review = await this.reviews.findOneAndUpdate(
      { courseId, userId },
      { $set: { rating, text: text.trim() } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
    const [summary] = await this.reviews.aggregate([
      { $match: { courseId: new Types.ObjectId(courseId) } },
      { $group: { _id: '$courseId', ratingAvg: { $avg: '$rating' }, ratingCount: { $sum: 1 } } },
    ])
    await this.courses.updateOne({ _id: courseId }, { $set: { ratingAvg: summary?.ratingAvg ?? 0, ratingCount: summary?.ratingCount ?? 0 } })
    await this.interactions.create({ courseId, userId, type: InteractionType.Rating, rating, reviewText: text.trim() })
    return review
  }

  async list(courseId: string, page = 1, limit = 20) {
    if (!(await this.courses.exists({ _id: courseId }))) throw new NotFoundException('Course not found')
    page = Math.max(1, page)
    limit = Math.min(50, Math.max(1, limit))
    const [items, total] = await Promise.all([
      this.reviews.find({ courseId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name').lean(),
      this.reviews.countDocuments({ courseId }),
    ])
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  }
}
