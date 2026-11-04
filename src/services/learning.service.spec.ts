import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common'
import { Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { Interaction, InteractionDocument, InteractionType } from '../models/interaction.model.js'
import { LearningService } from './learning.service.js'

const courseId = '650000000000000000000001'
const userId = '651000000000000000000001'
const lessonIds = ['653000000000000000000001', '653000000000000000000002']

function setup() {
  const course = {
    _id: new Types.ObjectId(courseId),
    lessons: lessonIds.map((_id) => ({ _id: new Types.ObjectId(_id) })),
  }
  const courseQuery = { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(course) }
  const courses = {
    findById: vi.fn().mockReturnValue(courseQuery),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    exists: vi.fn().mockResolvedValue(true),
  }
  const enrollments = {
    findOne: vi.fn(),
    create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: EnrollmentStatus.Active }),
    updateOne: vi.fn(),
    findById: vi.fn(),
  }
  const interactions = { create: vi.fn().mockResolvedValue({}) }
  const service = new LearningService(
    courses as unknown as import('mongoose').Model<CourseDocument>,
    enrollments as unknown as import('mongoose').Model<EnrollmentDocument>,
    interactions as unknown as import('mongoose').Model<InteractionDocument>,
  )
  return { service, courses, enrollments, interactions, course }
}

describe('LearningService', () => {
  it('does not allow enrollment into a course without lessons', async () => {
    const { service, courses } = setup()
    courses.findById.mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ _id: courseId, lessons: [] }) })

    await expect(service.enroll(courseId, userId)).rejects.toBeInstanceOf(UnprocessableEntityException)
  })

  it('rejects a repeated enrollment with a useful conflict', async () => {
    const { service, enrollments, interactions } = setup()
    enrollments.findOne.mockResolvedValue({ status: EnrollmentStatus.Active })

    await expect(service.enroll(courseId, userId)).rejects.toBeInstanceOf(ConflictException)
    expect(enrollments.create).not.toHaveBeenCalled()
    expect(interactions.create).not.toHaveBeenCalled()
  })

  it('requires enrollment before completing a lesson', async () => {
    const { service, enrollments } = setup()
    enrollments.findOne.mockResolvedValue(null)

    await expect(service.completeLesson(courseId, lessonIds[0], userId)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('marks the course completed automatically at 100% progress', async () => {
    const { service, enrollments, interactions } = setup()
    const enrollmentId = new Types.ObjectId()
    const enrollment = { _id: enrollmentId, status: EnrollmentStatus.Active }
    enrollments.findOne.mockResolvedValue(enrollment)
    enrollments.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 1 })
    enrollments.findById.mockResolvedValue({
      _id: enrollmentId,
      status: EnrollmentStatus.Active,
      completedLessons: lessonIds.map((value) => new Types.ObjectId(value)),
    })

    const result = await service.completeLesson(courseId, lessonIds[1], userId)

    expect(result.progress).toBe(100)
    expect(result.enrollment.status).toBe(EnrollmentStatus.Completed)
    expect(interactions.create).toHaveBeenCalledWith(expect.objectContaining({ type: InteractionType.LessonComplete }))
    expect(interactions.create).toHaveBeenCalledWith(expect.objectContaining({ type: InteractionType.CourseComplete }))
  })

  it('does not log a duplicate lesson completion', async () => {
    const { service, enrollments, interactions } = setup()
    const enrollmentId = new Types.ObjectId()
    enrollments.findOne.mockResolvedValue({ _id: enrollmentId, status: EnrollmentStatus.Active })
    enrollments.updateOne.mockResolvedValue({ modifiedCount: 0 })
    enrollments.findById.mockResolvedValue({
      _id: enrollmentId,
      status: EnrollmentStatus.Active,
      completedLessons: [new Types.ObjectId(lessonIds[0])],
    })

    const result = await service.completeLesson(courseId, lessonIds[0], userId)

    expect(result.alreadyCompleted).toBe(true)
    expect(interactions.create).not.toHaveBeenCalled()
  })
})
