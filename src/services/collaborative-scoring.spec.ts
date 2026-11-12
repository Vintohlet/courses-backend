import { Types } from 'mongoose'
import { EnrollmentStatus } from '../models/enrollment.model.js'
import {
  CandidateEnrollment,
  CollaborativeCandidate,
  HistoryEnrollment,
  NeighborSeedEnrollment,
  scoreCollaborativeCandidates,
} from './collaborative-scoring.js'

const oid = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))
const A = EnrollmentStatus.Active
const C = EnrollmentStatus.Completed

function byCourse(result: CollaborativeCandidate[]) {
  return new Map(result.map((item) => [item.courseId.toString(), { score: item.score, seed: item.bestSeedCourseId.toString() }]))
}

describe('scoreCollaborativeCandidates', () => {
  it('matches a hand-computed example with 2x2, 2x1 and 1x1 weights', () => {
    // seeds: S1 completed (weight 2), S2 active (weight 1)
    const history: HistoryEnrollment[] = [
      { courseId: oid(1), status: C },
      { courseId: oid(2), status: A },
    ]
    // u10 is on S1 and S2, u11 is only on S1
    const neighbors: NeighborSeedEnrollment[] = [
      { userId: oid(10), courseId: oid(1) },
      { userId: oid(10), courseId: oid(2) },
      { userId: oid(11), courseId: oid(1) },
    ]
    const candidates: CandidateEnrollment[] = [
      { userId: oid(10), courseId: oid(100), status: C }, // X via u10: S1 2*2=4, S2 1*2=2
      { userId: oid(11), courseId: oid(100), status: A }, // X via u11: S1 2*1=2
      { userId: oid(11), courseId: oid(101), status: A }, // Y via u11: S1 2*1=2
      { userId: oid(10), courseId: oid(102), status: A }, // Z via u10: S1 2*1=2, S2 1*1=1
    ]
    const result = byCourse(scoreCollaborativeCandidates(history, neighbors, candidates))

    // X: pair(S1)=6, pair(S2)=2 -> score 8, best S1
    expect(result.get(oid(100).toString())).toEqual({ score: 8, seed: oid(1).toString() })
    // Y: pair(S1)=2 -> score 2
    expect(result.get(oid(101).toString())).toEqual({ score: 2, seed: oid(1).toString() })
    // Z: pair(S1)=2, pair(S2)=1 -> score 3
    expect(result.get(oid(102).toString())).toEqual({ score: 3, seed: oid(1).toString() })
    expect(result.size).toBe(3)
  })

  it('breaks bestSeed ties by the smaller _id', () => {
    const history: HistoryEnrollment[] = [
      { courseId: oid(7), status: A },
      { courseId: oid(3), status: A },
    ]
    const neighbors: NeighborSeedEnrollment[] = [
      { userId: oid(10), courseId: oid(7) },
      { userId: oid(10), courseId: oid(3) },
    ]
    const candidates: CandidateEnrollment[] = [{ userId: oid(10), courseId: oid(100), status: A }]
    const [only] = scoreCollaborativeCandidates(history, neighbors, candidates)
    expect(only.score).toBe(2)
    expect(only.bestSeedCourseId.toString()).toBe(oid(3).toString())
  })

  it('ignores users without seed enrollments and candidate enrollments on seed courses', () => {
    const history: HistoryEnrollment[] = [{ courseId: oid(1), status: A }]
    const neighbors: NeighborSeedEnrollment[] = [{ userId: oid(10), courseId: oid(1) }]
    const candidates: CandidateEnrollment[] = [
      { userId: oid(99), courseId: oid(100), status: A },
      { userId: oid(10), courseId: oid(1), status: A },
    ]
    expect(scoreCollaborativeCandidates(history, neighbors, candidates)).toEqual([])
  })
})

/** Reference implementation: direct enumeration of (neighbor, seed, candidate enrollment) triples. */
function bruteForce(history: HistoryEnrollment[], neighbors: NeighborSeedEnrollment[], candidates: CandidateEnrollment[]) {
  const weight = (status: EnrollmentStatus) => (status === C ? 2 : 1)
  const seedWeight = new Map(history.map((item) => [item.courseId.toString(), weight(item.status)]))
  const pair = new Map<string, Map<string, number>>()
  const candidatesByUser = new Map<string, CandidateEnrollment[]>()
  for (const candidate of candidates) {
    const key = candidate.userId.toString()
    candidatesByUser.set(key, [...(candidatesByUser.get(key) ?? []), candidate])
  }
  for (const neighbor of neighbors) {
    const seed = neighbor.courseId.toString()
    if (!seedWeight.has(seed)) continue
    for (const candidate of candidatesByUser.get(neighbor.userId.toString()) ?? []) {
      if (seedWeight.has(candidate.courseId.toString())) continue
      const key = candidate.courseId.toString()
      const perSeed = pair.get(key) ?? new Map<string, number>()
      perSeed.set(seed, (perSeed.get(seed) ?? 0) + seedWeight.get(seed)! * weight(candidate.status))
      pair.set(key, perSeed)
    }
  }
  const out = new Map<string, { score: number; seed: string }>()
  for (const [course, perSeed] of pair) {
    const entries = [...perSeed.entries()].sort((l, r) => r[1] - l[1] || (l[0] < r[0] ? -1 : 1))
    out.set(course, { score: [...perSeed.values()].reduce((a, b) => a + b, 0), seed: entries[0][0] })
  }
  return out
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomDataset(seed: number, userCount: number, courseCount: number, perUser: number) {
  const random = mulberry32(seed)
  const status = () => (random() < 0.4 ? C : A)
  const pickCourses = () => {
    const picked = new Set<number>()
    while (picked.size < Math.min(perUser, courseCount)) picked.add(Math.floor(random() * courseCount) + 1)
    return [...picked]
  }
  const enrollmentsByUser = new Map<number, { course: number; status: EnrollmentStatus }[]>()
  for (let user = 1; user <= userCount; user++) {
    enrollmentsByUser.set(user, pickCourses().map((course) => ({ course, status: status() })))
  }
  const currentUser = 1
  const history = enrollmentsByUser.get(currentUser)!.map((e) => ({ courseId: oid(e.course), status: e.status }))
  const seedSet = new Set(history.map((h) => h.courseId.toString()))
  const neighbors: NeighborSeedEnrollment[] = []
  const candidates: CandidateEnrollment[] = []
  const neighborIds = new Set<number>()
  for (const [user, list] of enrollmentsByUser) {
    if (user === currentUser) continue
    for (const e of list) {
      if (!seedSet.has(oid(e.course).toString())) continue
      neighbors.push({ userId: oid(1000 + user), courseId: oid(e.course) })
      neighborIds.add(user)
    }
  }
  for (const user of neighborIds) {
    for (const e of enrollmentsByUser.get(user)!) {
      if (!seedSet.has(oid(e.course).toString())) candidates.push({ userId: oid(1000 + user), courseId: oid(e.course), status: e.status })
    }
  }
  return { history, neighbors, candidates }
}

describe('scoreCollaborativeCandidates vs brute force', () => {
  it.each([
    [1, 100, 40, 6],
    [2, 600, 60, 20],
    [3, 300, 25, 10],
  ])('matches the reference for seed %i (%i users, %i courses, %i enrollments each)', (seed, users, courses, perUser) => {
    const { history, neighbors, candidates } = randomDataset(seed, users, courses, perUser)
    const actual = byCourse(scoreCollaborativeCandidates(history, neighbors, candidates))
    const expected = bruteForce(history, neighbors, candidates)
    expect(expected.size).toBeGreaterThan(0)
    expect(actual.size).toBe(expected.size)
    for (const [course, value] of expected) expect(actual.get(course)).toEqual(value)
  })
})
