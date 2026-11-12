import { NotFoundException } from '@nestjs/common'
import { Model, Types } from 'mongoose'
import { CourseDocument } from '../models/course.model.js'
import { EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { UserDocument } from '../models/user.model.js'
import { RecommendationService } from './recommendation.service.js'

const oid = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))
const ids = (list: { _id: Types.ObjectId }[]) => list.map((item) => item._id.toString())
const idSet = (filter: unknown) => new Set(((filter as { $nin?: Types.ObjectId[] })?.$nin ?? []).map(String))

const course = (n: number) => ({
  _id: oid(n),
  title: `Course ${n}`,
  ratingAvg: 4,
  ratingCount: 10,
  enrollCount: 5,
  category: 'x',
  tags: [] as string[],
})

/** Thenable chain standing in for a mongoose query. */
function query<T>(compute: (state: { limit?: number }) => T) {
  const state: { limit?: number } = {}
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'sort', 'lean']) q[name] = vi.fn(() => q)
  q.limit = vi.fn((n: number) => {
    state.limit = n
    return q
  })
  q.then = (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(compute(state)).then(resolve, reject)
  return q
}

interface World {
  user?: { interests?: string[] } | null
  history?: { courseId: Types.ObjectId; status: EnrollmentStatus }[]
  neighbors?: { userId: Types.ObjectId; courseId: Types.ObjectId }[]
  neighborEnrollments?: { userId: Types.ObjectId; courseId: Types.ObjectId; status: EnrollmentStatus }[]
  catalog: ReturnType<typeof course>[] // all active courses in popularity order
  contentMatches?: ReturnType<typeof course>[]
}

function setup(world: World) {
  const popularFilters: { _id?: unknown }[] = []
  const popularLimits: (number | undefined)[] = []
  const courses = {
    findById: vi.fn(),
    find: vi.fn((filter: { _id?: { $in?: Types.ObjectId[]; $nin?: Types.ObjectId[] } }) => {
      if (filter._id?.$in) {
        const wanted = new Set(filter._id.$in.map(String))
        return query(() => world.catalog.filter((c) => wanted.has(c._id.toString())))
      }
      popularFilters.push(filter)
      return query((state) => {
        popularLimits.push(state.limit)
        const excluded = idSet(filter._id)
        return world.catalog.filter((c) => !excluded.has(c._id.toString())).slice(0, state.limit)
      })
    }),
    aggregate: vi.fn(async (pipeline: { $match?: { _id?: unknown }; $limit?: number }[]) => {
      const excluded = idSet(pipeline[0].$match?._id)
      const limit = pipeline.find((stage) => stage.$limit)!.$limit!
      return (world.contentMatches ?? [])
        .filter((c) => !excluded.has(c._id.toString()))
        .slice(0, limit)
        .map((c) => ({ ...c, recommendationScore: 7 }))
    }),
  }
  const enrollments = {
    find: vi.fn((filter: { userId?: unknown; courseId?: { $in?: unknown } }) => {
      if (filter.courseId?.$in) return query(() => world.neighbors ?? [])
      if ((filter.userId as { $in?: unknown })?.$in) return query(() => world.neighborEnrollments ?? [])
      return query(() => world.history ?? [])
    }),
  }
  const users = { findById: vi.fn(() => query(() => (world.user === undefined ? { interests: [] } : world.user))) }
  const service = new RecommendationService(
    courses as unknown as Model<CourseDocument>,
    enrollments as unknown as Model<EnrollmentDocument>,
    users as unknown as Model<UserDocument>,
  )
  return { service, courses, enrollments, users, popularFilters, popularLimits }
}

type Item = { _id: Types.ObjectId; recommendation: Record<string, unknown> & { strategy: string } }

const userId = oid(900).toString()
const strategies = (result: unknown) => (result as Item[]).map((item) => item.recommendation.strategy)

describe('RecommendationService.forUser', () => {
  const catalog = [1, 2, 3, 4, 5, 6, 7].map(course)

  it('returns only popular courses for guests, within the limit', async () => {
    const { service, users } = setup({ catalog })
    const result = await service.forUser(undefined, 3)
    expect(result).toHaveLength(3)
    expect(strategies(result)).toEqual(['popular', 'popular', 'popular'])
    expect(users.findById).not.toHaveBeenCalled()
  })

  it('returns collaborative recommendations with basedOnCourse when enough are found', async () => {
    const seed = oid(1)
    const { service } = setup({
      catalog,
      history: [{ courseId: seed, status: EnrollmentStatus.Active }],
      neighbors: [{ userId: oid(50), courseId: seed }],
      neighborEnrollments: [
        { userId: oid(50), courseId: oid(2), status: EnrollmentStatus.Completed },
        { userId: oid(50), courseId: oid(3), status: EnrollmentStatus.Active },
      ],
    })
    const result = (await service.forUser(userId, 2)) as unknown as Item[]
    expect(ids(result)).toEqual([oid(2).toString(), oid(3).toString()])
    expect(strategies(result)).toEqual(['collaborative', 'collaborative'])
    expect(result[0].recommendation.score).toBe(2)
    expect(result[0].recommendation.basedOnCourse).toEqual({ id: seed, title: 'Course 1' })
  })

  it('tops up with content-based and then popular_fallback without duplicates or history courses', async () => {
    const seed = oid(1)
    const { service, popularFilters } = setup({
      catalog,
      user: { interests: ['sql'] },
      history: [{ courseId: seed, status: EnrollmentStatus.Active }],
      neighbors: [{ userId: oid(50), courseId: seed }],
      neighborEnrollments: [{ userId: oid(50), courseId: oid(2), status: EnrollmentStatus.Active }],
      contentMatches: [course(1), course(2), course(3)],
    })
    const result = (await service.forUser(userId, 4)) as unknown as Item[]

    expect(ids(result)).toEqual([oid(2), oid(3), oid(4), oid(5)].map(String))
    expect(strategies(result)).toEqual(['collaborative', 'content_based', 'popular_fallback', 'popular_fallback'])
    expect(new Set(ids(result)).size).toBe(result.length)
    expect(ids(result)).not.toContain(seed.toString())
    expect(idSet(popularFilters[0]._id)).toEqual(new Set([seed, oid(2), oid(3)].map(String)))
  })

  it('uses content-based recommendations without history and fills the rest with popular', async () => {
    const { service } = setup({ catalog, user: { interests: ['sql'] }, contentMatches: [course(3), course(4)] })
    const result = await service.forUser(userId, 3)
    expect(strategies(result)).toEqual(['content_based', 'content_based', 'popular_fallback'])
  })

  it('uses popular when the user has neither history nor interests', async () => {
    const { service } = setup({ catalog, user: { interests: [] } })
    const result = await service.forUser(userId, 3)
    expect(strategies(result)).toEqual(['popular', 'popular', 'popular'])
  })

  it('throws NotFoundException for an unknown user', async () => {
    const { service } = setup({ catalog, user: null })
    await expect(service.forUser(userId, 3)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('clamps the limit to the 1..20 range', async () => {
    const low = setup({ catalog })
    expect(await low.service.forUser(undefined, 0)).toHaveLength(1)
    expect(low.popularLimits).toEqual([1])

    const many = setup({ catalog: Array.from({ length: 30 }, (_, i) => course(i + 1)) })
    expect(await many.service.forUser(undefined, 50)).toHaveLength(20)
    expect(many.popularLimits).toEqual([20])
  })
})
