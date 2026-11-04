import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { Interaction, InteractionDocument, InteractionType } from '../models/interaction.model.js'

@Injectable()
export class LearningService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(Interaction.name) private readonly interactions: Model<InteractionDocument>,
  ) {}

  async enroll(courseId: string, userId: string) {
    const course = await this.courses.findById(courseId).select('_id lessons').lean()
    if (!course) throw new NotFoundException('Course not found')
    if (!course.lessons.length) throw new UnprocessableEntityException('Cannot enroll in a course without lessons')
    const existing = await this.enrollments.findOne({ courseId, userId })
    if (existing) throw new ConflictException(existing.status === EnrollmentStatus.Completed ? 'Course already completed' : 'Course already in progress')
    let enrollment: EnrollmentDocument
    try {
      enrollment = await this.enrollments.create({ courseId, userId })
    } catch (error) {
      if (this.isDuplicateKey(error)) throw new ConflictException('Course already in progress or completed')
      throw error
    }
    await Promise.all([
      this.courses.updateOne({ _id: courseId }, { $inc: { enrollCount: 1 } }),
      this.interactions.create({ courseId, userId, type: InteractionType.Enroll }),
    ])
    return enrollment
  }

  async completeLesson(courseId: string, lessonId: string, userId: string) {
    const course = await this.courses.findById(courseId).select('lessons').lean()
    if (!course) throw new NotFoundException('Course not found')
    const lesson = course.lessons.find((item: any) => String(item._id) === lessonId)
    if (!lesson) throw new NotFoundException('Lesson not found in this course')
    const enrollment = await this.enrollments.findOne({ courseId, userId })
    if (!enrollment) throw new ForbiddenException('Enroll in the course first')
    if (enrollment.status === EnrollmentStatus.Completed) return { enrollment, progress: 100, alreadyCompleted: true }
    const result = await this.enrollments.updateOne({ _id: enrollment._id }, { $addToSet: { completedLessons: new Types.ObjectId(lessonId) } })
    if (result.modifiedCount) await this.interactions.create({ courseId, userId, type: InteractionType.LessonComplete, lessonId })
    const updated = await this.enrollments.findById(enrollment._id)
    if (!updated) throw new NotFoundException('Enrollment not found')
    const progress = Math.min(100, Math.round((updated.completedLessons.length / course.lessons.length) * 100))
    if (progress === 100 && updated.status !== EnrollmentStatus.Completed) {
      const transitioned = await this.enrollments.updateOne({ _id: updated._id, status: EnrollmentStatus.Active }, { $set: { status: EnrollmentStatus.Completed, completedAt: new Date() } })
      if (transitioned.modifiedCount) await this.interactions.create({ courseId, userId, type: InteractionType.CourseComplete })
      updated.status = EnrollmentStatus.Completed
    }
    return { enrollment: updated, progress, alreadyCompleted: result.modifiedCount === 0 }
  }

  async listParticipants(courseId: string, page = 1, limit = 20) {
    if (!(await this.courses.exists({ _id: courseId }))) throw new NotFoundException('Course not found')
    page = Math.max(1, page)
    limit = Math.min(50, Math.max(1, limit))
    const filter = { courseId: new Types.ObjectId(courseId), status: EnrollmentStatus.Active }
    const [items, total] = await Promise.all([
      this.enrollments.find(filter).sort({ enrolledAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name').lean(),
      this.enrollments.countDocuments(filter),
    ])
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  }

  private isDuplicateKey(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000 }
}
