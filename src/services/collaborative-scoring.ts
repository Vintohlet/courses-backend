import { Types } from 'mongoose'
import { EnrollmentStatus } from '../models/enrollment.model.js'

export const COMPLETED_WEIGHT = 2

export interface HistoryEnrollment {
  courseId: Types.ObjectId
  status: EnrollmentStatus
}

export interface NeighborSeedEnrollment {
  userId: Types.ObjectId
  courseId: Types.ObjectId
}

export interface CandidateEnrollment {
  userId: Types.ObjectId
  courseId: Types.ObjectId
  status: EnrollmentStatus
}

export interface CollaborativeCandidate {
  courseId: Types.ObjectId
  score: number
  bestSeedCourseId: Types.ObjectId
}

export function enrollmentWeight(status: EnrollmentStatus) {
  return status === EnrollmentStatus.Completed ? COMPLETED_WEIGHT : 1
}

/**
 * Pure collaborative scoring (no I/O).
 *
 * For every triple (neighbor u, seed s u is enrolled in, candidate enrollment of u on course c):
 *   contribution = weight(s) * weight(enrollment of u on c)
 * pairScore(c, s) = sum of contributions, score(c) = sum over s of pairScore(c, s).
 * bestSeed(c) is the seed with the highest pairScore; ties go to the smaller _id (hex string order).
 *
 * Callers pass only active/completed enrollments; candidate enrollments on seed courses are ignored.
 */
export function scoreCollaborativeCandidates(
  history: HistoryEnrollment[],
  neighborEnrollments: NeighborSeedEnrollment[],
  candidateEnrollments: CandidateEnrollment[],
): CollaborativeCandidate[] {
  const seedWeights = new Map<string, number>()
  const seedIds = new Map<string, Types.ObjectId>()
  for (const { courseId, status } of history) {
    const key = courseId.toString()
    seedWeights.set(key, enrollmentWeight(status))
    seedIds.set(key, courseId)
  }

  // neighbor -> distinct seed courses the neighbor is enrolled in
  const neighborSeeds = new Map<string, Set<string>>()
  for (const { userId, courseId } of neighborEnrollments) {
    const seedKey = courseId.toString()
    if (!seedWeights.has(seedKey)) continue
    const userKey = userId.toString()
    let seeds = neighborSeeds.get(userKey)
    if (!seeds) neighborSeeds.set(userKey, (seeds = new Set()))
    seeds.add(seedKey)
  }

  // candidate -> seed -> pairScore
  const pairScores = new Map<string, Map<string, number>>()
  const candidateIds = new Map<string, Types.ObjectId>()
  for (const { userId, courseId, status } of candidateEnrollments) {
    const candidateKey = courseId.toString()
    if (seedWeights.has(candidateKey)) continue
    const seeds = neighborSeeds.get(userId.toString())
    if (!seeds) continue
    const weight = enrollmentWeight(status)
    let perSeed = pairScores.get(candidateKey)
    if (!perSeed) {
      pairScores.set(candidateKey, (perSeed = new Map()))
      candidateIds.set(candidateKey, courseId)
    }
    for (const seedKey of seeds) {
      perSeed.set(seedKey, (perSeed.get(seedKey) ?? 0) + seedWeights.get(seedKey)! * weight)
    }
  }

  const result: CollaborativeCandidate[] = []
  for (const [candidateKey, perSeed] of pairScores) {
    let score = 0
    let bestSeedKey = ''
    let bestPair = -Infinity
    for (const [seedKey, pair] of perSeed) {
      score += pair
      if (pair > bestPair || (pair === bestPair && seedKey < bestSeedKey)) {
        bestPair = pair
        bestSeedKey = seedKey
      }
    }
    result.push({ courseId: candidateIds.get(candidateKey)!, score, bestSeedCourseId: seedIds.get(bestSeedKey)! })
  }
  return result
}
