import { ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { CourseDocument } from '../models/course.model.js'
import { EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { InteractionDocument, InteractionType } from '../models/interaction.model.js'
import { ReviewDocument } from '../models/review.model.js'
import { ReviewService } from './review.service.js'

const courseId = '650000000000000000000001'
const userId = '651000000000000000000001'

function setup() {
  const courses = { exists: vi.fn().mockResolvedValue(true), updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) }
  const enrollments = { findOne: vi.fn() }
  const reviews = {
    findOneAndUpdate: vi.fn().mockResolvedValue({ rating: 5, text: 'Great course' }),
    aggregate: vi.fn().mockResolvedValue([{ ratingAvg: 4.5, ratingCount: 2 }]),
  }
  const interactions = { create: vi.fn().mockResolvedValue({}) }
  const service = new ReviewService(
    courses as unknown as import('mongoose').Model<CourseDocument>,
    enrollments as unknown as import('mongoose').Model<EnrollmentDocument>,
    reviews as unknown as import('mongoose').Model<ReviewDocument>,
    interactions as unknown as import('mongoose').Model<InteractionDocument>,
  )
  return { service, courses, enrollments, reviews, interactions }
}

describe('ReviewService', () => {
  it('requires a completed enrollment before accepting a review', async () => {
    const { service, enrollments, reviews } = setup()
    enrollments.findOne.mockResolvedValue(null)

    await expect(service.upsert(courseId, userId, 5, 'Great course')).rejects.toBeInstanceOf(ForbiddenException)
    expect(reviews.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('upserts one review and refreshes the course rating aggregates', async () => {
    const { service, enrollments, reviews, courses, interactions } = setup()
    enrollments.findOne.mockResolvedValue({ status: EnrollmentStatus.Completed })

    await service.upsert(courseId, userId, 5, '  Great course  ')

    expect(reviews.findOneAndUpdate).toHaveBeenCalledWith(
      { courseId, userId },
      { $set: { rating: 5, text: 'Great course' } },
      expect.objectContaining({ upsert: true, new: true, runValidators: true }),
    )
    expect(courses.updateOne).toHaveBeenCalledWith({ _id: courseId }, { $set: { ratingAvg: 4.5, ratingCount: 2 } })
    expect(interactions.create).toHaveBeenCalledWith(expect.objectContaining({ type: InteractionType.Rating, rating: 5, reviewText: 'Great course' }))
  })

  it('writes zero aggregates when the course has no reviews', async () => {
    const { service, enrollments, reviews, courses } = setup()
    enrollments.findOne.mockResolvedValue({ status: EnrollmentStatus.Completed })
    reviews.aggregate.mockResolvedValue([])

    await service.upsert(courseId, userId, 4, '')

    expect(courses.updateOne).toHaveBeenCalledWith({ _id: courseId }, { $set: { ratingAvg: 0, ratingCount: 0 } })
  })
})
