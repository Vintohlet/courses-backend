import { CourseSchema } from './course.model.js'
import { EnrollmentSchema } from './enrollment.model.js'
import { InteractionSchema } from './interaction.model.js'
import { ReviewSchema } from './review.model.js'

describe('Mongo reference schema types', () => {
  it('uses BSON ObjectId paths for enrollment references and completed lessons', () => {
    expect(EnrollmentSchema.path('userId').instance).toBe('ObjectId')
    expect(EnrollmentSchema.path('courseId').instance).toBe('ObjectId')
    expect(EnrollmentSchema.path('completedLessons').instance).toBe('Array')
  })

  it('uses BSON ObjectId paths for review and interaction references', () => {
    expect(ReviewSchema.path('userId').instance).toBe('ObjectId')
    expect(ReviewSchema.path('courseId').instance).toBe('ObjectId')
    expect(InteractionSchema.path('userId').instance).toBe('ObjectId')
    expect(InteractionSchema.path('courseId').instance).toBe('ObjectId')
  })

  it('keeps course lessons as embedded subdocuments', () => {
    expect(CourseSchema.path('lessons').instance).toBe('Array')
  })
})
