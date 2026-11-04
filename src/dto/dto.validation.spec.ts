import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { LoginDto, RegisterDto } from './auth.dto.js'
import { CourseQueryDto, CreateCourseDto } from './course.dto.js'
import { UpsertReviewDto } from './review.dto.js'

describe('Request DTO validation', () => {
  it('normalizes registration email and interests', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: 'Test Student',
      email: '  STUDENT@example.com ',
      password: 'DemoPass123!',
      interests: [' FRONTEND '],
    })

    expect(await validate(dto)).toHaveLength(0)
    expect(dto.email).toBe('student@example.com')
    expect(dto.interests).toEqual(['frontend'])
  })

  it('rejects malformed login credentials', async () => {
    const dto = plainToInstance(LoginDto, { email: 'not-an-email', password: '' })
    const errors = await validate(dto)
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['email', 'password']))
  })

  it('converts and validates catalogue query values', async () => {
    const dto = plainToInstance(CourseQueryDto, { page: '2', limit: '12', tags: 'FRONTEND,backend' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.page).toBe(2)
    expect(dto.tags).toEqual(['frontend', 'backend'])
  })

  it('rejects a course without lessons and a rating outside 1 to 5', async () => {
    const course = plainToInstance(CreateCourseDto, {
      title: 'Course title', shortDescription: 'Short description', fullDescription: 'Full description',
      category: 'frontend', lessons: [],
    })
    const rating = plainToInstance(UpsertReviewDto, { rating: 6 })

    expect((await validate(course)).map((error) => error.property)).toContain('lessons')
    expect((await validate(rating)).map((error) => error.property)).toContain('rating')
  })
})
