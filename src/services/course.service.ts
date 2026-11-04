import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Course, CourseDocument, CourseLevel } from '../models/course.model.js'
import { User, UserDocument } from '../models/user.model.js'
import { Enrollment, EnrollmentDocument } from '../models/enrollment.model.js'
import { Topic, TopicDocument } from '../models/topic.model.js'

export interface CourseInput {
  title: string; shortDescription: string; fullDescription: string; category: string
  tags?: string[]; level?: CourseLevel; lessons: Array<{ title: string; description: string; order: number }>
}
export interface CourseQuery { search?: string; category?: string; tags?: string[]; level?: CourseLevel; sort?: 'rating' | 'popular' | 'newest'; page?: number; limit?: number }

@Injectable()
export class CourseService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Enrollment.name) private readonly enrollments: Model<EnrollmentDocument>,
    @InjectModel(Topic.name) private readonly topics: Model<TopicDocument>,
  ) {}

  async list(query: CourseQuery, userId?: string) {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.min(50, Math.max(1, query.limit ?? 12))
    const filter: Record<string, any> = { isActive: true }
    if (query.category) filter.category = query.category.toLowerCase()
    if (query.level) filter.level = query.level
    if (query.tags?.length) filter.tags = { $in: query.tags.map((tag) => tag.toLowerCase()) }
    if (query.search?.trim()) filter.$or = [
      { title: { $regex: this.escapeRegex(query.search.trim()), $options: 'i' } },
      { shortDescription: { $regex: this.escapeRegex(query.search.trim()), $options: 'i' } },
    ]
    const sort: Record<string, 1 | -1> = query.sort === 'popular' ? { enrollCount: -1, ratingAvg: -1 } : query.sort === 'newest' ? { createdAt: -1 } : { ratingAvg: -1, ratingCount: -1, enrollCount: -1 }
    const [items, total] = await Promise.all([
      this.courses.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).select('-fullDescription -lessons').lean(),
      this.courses.countDocuments(filter),
    ])
    let enriched = items
    if (userId && items.length) {
      const ids = items.map((item) => item._id)
      const enrolled = await this.enrollments.find({ userId, courseId: { $in: ids } }).select('courseId status completedLessons').lean()
      const map = new Map(enrolled.map((item: any) => [String(item.courseId), item]))
      enriched = items.map((item: any) => {
        const enrollment: any = map.get(String(item._id))
        return { ...item, isEnrolled: Boolean(enrollment), progress: enrollment ? this.progress(enrollment.completedLessons, item.lessons?.length ?? 0) : 0 }
      })
    }
    return { items: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
  }

  async getPublic(courseId: string) {
    const course = await this.courses.findOne({ _id: courseId, isActive: true }).select('-fullDescription -lessons').lean()
    if (!course) throw new NotFoundException('Course not found')
    return course
  }

  async getContent(courseId: string, userId: string) {
    const [course, enrollment] = await Promise.all([
      this.courses.findOne({ _id: courseId, isActive: true }).lean(),
      this.enrollments.findOne({ courseId, userId }).lean(),
    ])
    if (!course) throw new NotFoundException('Course not found')
    if (!enrollment) throw new ForbiddenException('Enroll in the course to access its content')
    return { fullDescription: course.fullDescription, lessons: course.lessons, enrollment, progress: this.progress(enrollment.completedLessons, course.lessons.length) }
  }

  async create(input: CourseInput, actorId: string) {
    await this.assertAdmin(actorId)
    await this.assertCourseTopics(input.category, input.tags ?? [])
    if (!input.lessons.length) throw new UnprocessableEntityException('A course must contain at least one lesson')
    return this.courses.create(this.normalizeCourse(input))
  }

  async update(courseId: string, input: Partial<CourseInput>, actorId: string) {
    await this.assertAdmin(actorId)
    if (input.category || input.tags) {
      const current = await this.courses.findById(courseId).select('category tags')
      if (!current) throw new NotFoundException('Course not found')
      await this.assertCourseTopics(input.category ?? current.category, input.tags ?? current.tags)
    }
    if (input.lessons && input.lessons.length === 0) throw new UnprocessableEntityException('A course must contain at least one lesson')
    const course = await this.courses.findByIdAndUpdate(courseId, { $set: this.normalizeCourse(input) }, { new: true, runValidators: true })
    if (!course) throw new NotFoundException('Course not found')
    if (input.lessons) await this.reconcileEnrollmentProgress(course)
    return course
  }

  async remove(courseId: string, actorId: string) {
    await this.assertAdmin(actorId)
    const course = await this.courses.findOneAndUpdate({ _id: courseId, isActive: true }, { $set: { isActive: false } }, { new: true })
    if (!course) throw new NotFoundException('Course not found')
    return { deleted: true }
  }

  async listTopics() { return this.topics.find({ isActive: true }).sort({ name: 1 }).select('slug name').lean() }

  async createTopic(slug: string, name: string, actorId: string) {
    await this.assertAdmin(actorId)
    return this.topics.create({ slug: slug.trim().toLowerCase(), name: name.trim() })
  }

  private async assertCourseTopics(category: string, tags: string[]) {
    const slugs = [...new Set([category, ...tags].map((value) => value.trim().toLowerCase()))]
    const found = await this.topics.find({ slug: { $in: slugs }, isActive: true }).distinct('slug')
    if (found.length !== slugs.length) throw new UnprocessableEntityException('Category and tags must use active topic slugs')
  }
  private async assertAdmin(userId: string) {
    if (!(await this.users.exists({ _id: userId, isAdmin: true }))) throw new ForbiddenException('Administrator privileges required')
  }
  private normalizeCourse(input: Partial<CourseInput>) {
    const result: Record<string, unknown> = { ...input }
    if (input.title !== undefined) result.title = input.title.trim()
    if (input.shortDescription !== undefined) result.shortDescription = input.shortDescription.trim()
    if (input.fullDescription !== undefined) result.fullDescription = input.fullDescription.trim()
    if (input.category !== undefined) result.category = input.category.trim().toLowerCase()
    if (input.tags !== undefined) result.tags = [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()))]
    return result
  }
  private progress(done: unknown[], total: number) { return total ? Math.min(100, Math.round((done.length / total) * 100)) : 0 }
  private escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  private async reconcileEnrollmentProgress(course: CourseDocument) {
    const validIds = new Set(course.lessons.map((lesson: any) => String(lesson._id)))
    const records = await this.enrollments.find({ courseId: course._id })
    for (const record of records) {
      record.completedLessons = record.completedLessons.filter((id) => validIds.has(String(id)))
      if (record.completedLessons.length === course.lessons.length) {
        record.status = 'completed' as any
        record.completedAt ??= new Date()
      } else {
        record.status = 'active' as any
        record.completedAt = undefined
      }
      await record.save()
    }
  }
}
