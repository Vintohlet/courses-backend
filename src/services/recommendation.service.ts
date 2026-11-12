import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Course, CourseDocument } from '../models/course.model.js'
import { Enrollment, EnrollmentDocument, EnrollmentStatus } from '../models/enrollment.model.js'
import { User, UserDocument } from '../models/user.model.js'
import {
  CandidateEnrollment,
  CollaborativeCandidate,
  HistoryEnrollment,
  NeighborSeedEnrollment,
  scoreCollaborativeCandidates,
} from './collaborative-scoring.js'

const ACTIVE_STATUSES = [EnrollmentStatus.Active, EnrollmentStatus.Completed]

export interface ExplainedQuery {
  name: string
  executionTimeMillis: number
  totalKeysExamined: number
  totalDocsExamined: number
  nReturned: number
  indexesUsed: string[]
  collectionScan: boolean
}

type Recommendation = { _id: Types.ObjectId } & Record<string, unknown>

function distinctIds(ids: Types.ObjectId[]) {
  return [...new Map(ids.map((id) => [id.toString(), id])).values()]
}

function collectPlanStages(plan: unknown, stages: Record<string, unknown>[] = []) {
  if (!plan || typeof plan !== 'object') return stages
  const node = plan as Record<string, unknown>
  stages.push(node)
  collectPlanStages(node.inputStage, stages)
  if (Array.isArray(node.inputStages)) node.inputStages.forEach((stage) => collectPlanStages(stage, stages))
  return stages
}

function summarizeExplain(name: string, explain: unknown): ExplainedQuery {
  const result = explain as {
    queryPlanner?: { winningPlan?: unknown }
    executionStats?: { executionTimeMillis?: number; totalKeysExamined?: number; totalDocsExamined?: number; nReturned?: number }
  }
  const stages = collectPlanStages(result.queryPlanner?.winningPlan)
  const stats = result.executionStats ?? {}
  return {
    name,
    executionTimeMillis: stats.executionTimeMillis ?? 0,
    totalKeysExamined: stats.totalKeysExamined ?? 0,
    totalDocsExamined: stats.totalDocsExamined ?? 0,
    nReturned: stats.nReturned ?? 0,
    indexesUsed: [...new Set(stages.flatMap((stage) => (typeof stage.indexName === 'string' ? [stage.indexName] : [])))],
    collectionScan: stages.some((stage) => stage.stage === 'COLLSCAN'),
  }
}

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

    const history = await this.loadHistory(userObjectId)
    const seenCourseIds = history.map((enrollment) => enrollment.courseId)

    const selected: Recommendation[] = seenCourseIds.length ? await this.collaborativeForUser(userObjectId, history, limit) : []

    if (selected.length < limit && user.interests?.length) {
      const excluded = [...seenCourseIds, ...selected.map((item) => item._id)]
      selected.push(...(await this.contentBasedForUser(user.interests, excluded, limit - selected.length)))
    }

    if (selected.length < limit) {
      const excluded = [...seenCourseIds, ...selected.map((item) => item._id)]
      const strategy = seenCourseIds.length || selected.length ? 'popular_fallback' : 'popular'
      selected.push(...(await this.popular(limit - selected.length, strategy, excluded)))
    }

    return selected
  }

  /**
   * Runs the same queries as the collaborative recommender with explain('executionStats').
   * Queries that depend on earlier results are executed for real first to obtain their inputs.
   */
  async explainCollaborativeForUser(userId: string, limit = 6) {
    const userObjectId = new Types.ObjectId(userId)
    limit = this.clampLimit(limit)
    const queries: ExplainedQuery[] = []
    const raw: unknown[] = []
    const run = async (name: string, query: { explain: (verbosity: 'executionStats') => Promise<unknown> }) => {
      const explain = await query.explain('executionStats')
      raw.push({ name, explain })
      queries.push(summarizeExplain(name, explain))
    }

    await run('history', this.historyQuery(userObjectId))
    const history = await this.loadHistory(userObjectId)
    if (!history.length) throw new Error('The selected user has no active or completed enrollments to explain.')
    const seedIds = history.map((enrollment) => enrollment.courseId)

    await run('neighbors', this.neighborsQuery(userObjectId, seedIds))
    const neighbors = (await this.neighborsQuery(userObjectId, seedIds)) as NeighborSeedEnrollment[]
    const neighborIds = distinctIds(neighbors.map((neighbor) => neighbor.userId))

    await run('neighborEnrollments', this.neighborEnrollmentsQuery(neighborIds, seedIds))
    const candidateEnrollments = (await this.neighborEnrollmentsQuery(neighborIds, seedIds)) as CandidateEnrollment[]
    const scored = scoreCollaborativeCandidates(history, neighbors, candidateEnrollments)

    await run('candidateCourses', this.candidateCoursesQuery(scored.map((candidate) => candidate.courseId)))
    const top = await this.rankCandidates(scored, limit)

    const cardIds = this.cardIds(top)
    await run('cards', this.cardsQuery(cardIds))

    const totals = queries.reduce(
      (sum, query) => ({
        executionTimeMillis: sum.executionTimeMillis + query.executionTimeMillis,
        totalKeysExamined: sum.totalKeysExamined + query.totalKeysExamined,
        totalDocsExamined: sum.totalDocsExamined + query.totalDocsExamined,
      }),
      { executionTimeMillis: 0, totalKeysExamined: 0, totalDocsExamined: 0 },
    )
    return { queries, totals, raw }
  }

  /** Collaborative recommendations only (no fallbacks); used by the performance scripts. */
  async collaborativeRecommendationsForUser(userId: string, limit = 6) {
    const userObjectId = new Types.ObjectId(userId)
    const history = await this.loadHistory(userObjectId)
    if (!history.length) return []
    return this.collaborativeForUser(userObjectId, history, this.clampLimit(limit))
  }

  private historyQuery(userId: Types.ObjectId) {
    return this.enrollments.find({ userId, status: { $in: ACTIVE_STATUSES } }).select('courseId status').lean()
  }

  private neighborsQuery(userId: Types.ObjectId, seedIds: Types.ObjectId[]) {
    return this.enrollments
      .find({ courseId: { $in: seedIds }, status: { $in: ACTIVE_STATUSES }, userId: { $ne: userId } })
      .select('userId courseId -_id')
      .lean()
  }

  private neighborEnrollmentsQuery(neighborIds: Types.ObjectId[], seedIds: Types.ObjectId[]) {
    return this.enrollments
      .find({ userId: { $in: neighborIds }, status: { $in: ACTIVE_STATUSES }, courseId: { $nin: seedIds } })
      .select('userId courseId status -_id')
      .lean()
  }

  private candidateCoursesQuery(candidateIds: Types.ObjectId[]) {
    return this.courses.find({ _id: { $in: candidateIds }, isActive: true }).select('_id ratingAvg ratingCount').lean()
  }

  private cardsQuery(ids: Types.ObjectId[]) {
    return this.courses.find({ _id: { $in: ids } }).select('-fullDescription -lessons').lean()
  }

  private async loadHistory(userId: Types.ObjectId) {
    return (await this.historyQuery(userId)) as HistoryEnrollment[]
  }

  private cardIds(top: CollaborativeCandidate[]) {
    return distinctIds([...top.map((candidate) => candidate.courseId), ...top.map((candidate) => candidate.bestSeedCourseId)])
  }

  /** Keeps only active candidate courses and returns the top `limit` ordered by score, rating, rating count, _id. */
  private async rankCandidates(scored: CollaborativeCandidate[], limit: number) {
    if (!scored.length) return []
    const activeCourses = await this.candidateCoursesQuery(scored.map((candidate) => candidate.courseId))
    const meta = new Map(activeCourses.map((course) => [course._id.toString(), course]))
    return scored
      .filter((candidate) => meta.has(candidate.courseId.toString()))
      .sort((left, right) => {
        const leftCourse = meta.get(left.courseId.toString())!
        const rightCourse = meta.get(right.courseId.toString())!
        if (right.score !== left.score) return right.score - left.score
        if (rightCourse.ratingAvg !== leftCourse.ratingAvg) return rightCourse.ratingAvg - leftCourse.ratingAvg
        if (rightCourse.ratingCount !== leftCourse.ratingCount) return rightCourse.ratingCount - leftCourse.ratingCount
        const leftId = left.courseId.toString()
        const rightId = right.courseId.toString()
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
      })
      .slice(0, limit)
  }

  private async collaborativeForUser(userId: Types.ObjectId, history: HistoryEnrollment[], limit: number) {
    const seedIds = history.map((enrollment) => enrollment.courseId)
    const neighbors = (await this.neighborsQuery(userId, seedIds)) as NeighborSeedEnrollment[]
    if (!neighbors.length) return []
    const neighborIds = distinctIds(neighbors.map((neighbor) => neighbor.userId))
    const candidateEnrollments = (await this.neighborEnrollmentsQuery(neighborIds, seedIds)) as CandidateEnrollment[]
    const scored = scoreCollaborativeCandidates(history, neighbors, candidateEnrollments)
    const top = await this.rankCandidates(scored, limit)
    if (!top.length) return []

    const cards = await this.cardsQuery(this.cardIds(top))
    const byId = new Map(cards.map((card) => [card._id.toString(), card]))

    return top.flatMap((candidate) => {
      const card = byId.get(candidate.courseId.toString())
      if (!card) return []
      const seed = byId.get(candidate.bestSeedCourseId.toString())
      return [
        {
          ...card,
          recommendation: {
            strategy: 'collaborative',
            score: candidate.score,
            reason: 'Users who enrolled in this course also enrolled in the recommended course.',
            basedOnCourse: { id: candidate.bestSeedCourseId, title: seed?.title ?? null },
          },
        },
      ]
    })
  }

  private async contentBasedForUser(interests: string[], excludedIds: Types.ObjectId[], limit: number) {
    const courses = await this.courses.aggregate([
      { $match: { isActive: true, _id: { $nin: excludedIds }, $or: [{ category: { $in: interests } }, { tags: { $in: interests } }] } },
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

  private async popular(limit: number, strategy: 'popular' | 'popular_fallback', excludedIds: Types.ObjectId[] = []) {
    const courses = await this.courses
      .find({ isActive: true, ...(excludedIds.length ? { _id: { $nin: excludedIds } } : {}) })
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
