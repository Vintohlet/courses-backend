// Сравнение выдачи v1-dedup (pipeline из коммита 06fef4e) и v2-two-step (текущий RecommendationService)
// на реальной базе из .env.perf. Ничего не пишет в БД.
//
// Проверка A — все кандидаты: score каждого курса и выбор basedOn-курса.
// Проверка B — итоговый топ-N: позиции, score, рейтинг, basedOnCourse, формат карточки.
//
// Запуск: npm run perf:compare
//         npm run perf:compare -- --emails=perf.user.000001@example.com,perf.user.000777@example.com --limit=20
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { getModelToken } from '@nestjs/mongoose'
import { AppModule } from '../dist/app.module.js'
import { User } from '../dist/models/user.model.js'
import { Course } from '../dist/models/course.model.js'
import { Enrollment } from '../dist/models/enrollment.model.js'
import { RecommendationService } from '../dist/services/recommendation.service.js'
import { scoreCollaborativeCandidates } from '../dist/services/collaborative-scoring.js'

const ACTIVE = ['active', 'completed']
const COMPLETED_WEIGHT = 2
const DEFAULT_EMAILS = ['perf.user.000001@example.com', 'perf.user.002500@example.com', 'perf.user.004999@example.com']

function option(name, fallback) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}

// ---- v1-dedup pipeline, скопирован без изменений из 06fef4e:src/services/recommendation.service.ts ----
function v1PairStages(userId, seen, enrollmentsColl) {
  return [
    { $match: { userId, status: { $in: ACTIVE } } },
    { $set: { seedWeight: { $cond: [{ $eq: ['$status', 'completed'] }, COMPLETED_WEIGHT, 1] } } },
    {
      $lookup: {
        from: enrollmentsColl,
        let: { seedCourseId: '$courseId', currentUserId: '$userId' },
        pipeline: [
          { $match: { status: { $in: ACTIVE }, $expr: { $and: [{ $eq: ['$courseId', '$$seedCourseId'] }, { $ne: ['$userId', '$$currentUserId'] }] } } },
          { $project: { userId: 1, status: 1 } },
        ],
        as: 'neighbors',
      },
    },
    { $unwind: '$neighbors' },
    { $group: { _id: '$neighbors.userId', seedCourses: { $addToSet: { courseId: '$courseId', weight: '$seedWeight' } } } },
    {
      $lookup: {
        from: enrollmentsColl,
        let: { neighborUserId: '$_id' },
        pipeline: [
          { $match: { status: { $in: ACTIVE }, courseId: { $nin: seen }, $expr: { $eq: ['$userId', '$$neighborUserId'] } } },
          { $project: { courseId: 1, status: 1 } },
        ],
        as: 'neighborCourses',
      },
    },
    { $unwind: '$neighborCourses' },
    { $unwind: '$seedCourses' },
    { $set: { contribution: { $multiply: ['$seedCourses.weight', { $cond: [{ $eq: ['$neighborCourses.status', 'completed'] }, COMPLETED_WEIGHT, 1] }] } } },
    { $group: { _id: { candidateCourseId: '$neighborCourses.courseId', seedCourseId: '$seedCourses.courseId' }, score: { $sum: '$contribution' } } },
  ]
}

function v1FullStages(userId, seen, enrollmentsColl, coursesColl, limit) {
  return [
    ...v1PairStages(userId, seen, enrollmentsColl),
    { $sort: { score: -1 } },
    { $group: { _id: '$_id.candidateCourseId', score: { $sum: '$score' }, bestSeedCourseId: { $first: '$_id.seedCourseId' } } },
    { $lookup: { from: coursesColl, localField: '_id', foreignField: '_id', pipeline: [{ $match: { isActive: true } }, { $project: { fullDescription: 0, lessons: 0 } }], as: 'course' } },
    { $unwind: '$course' },
    { $lookup: { from: coursesColl, localField: 'bestSeedCourseId', foreignField: '_id', pipeline: [{ $project: { title: 1 } }], as: 'basedOn' } },
    { $unwind: '$basedOn' },
    { $sort: { score: -1, 'course.ratingAvg': -1, 'course.ratingCount': -1 } },
    { $limit: limit },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ['$course', { recommendation: { strategy: 'collaborative', score: '$score', basedOnCourse: { id: '$basedOn._id', title: '$basedOn.title' } } }],
        },
      },
    },
  ]
}
// ---- конец кода v1 ----

const sortKey = (item) => `${item.recommendation.score}|${item.ratingAvg}|${item.ratingCount}`

async function compareUser({ email, limit, users, courses, enrollments, service }) {
  const failures = []
  const notes = []
  const fail = (message) => failures.push(message)

  const user = await users.findOne({ email }).select('_id').lean()
  if (!user) return { email, failures: [`Пользователь ${email} не найден в базе из .env.perf`], notes }
  const userId = user._id
  const history = await enrollments.find({ userId, status: { $in: ACTIVE } }).select('courseId status').lean()
  const seen = history.map((item) => item.courseId)
  if (!seen.length) return { email, failures: ['У пользователя нет active/completed записей'], notes }

  // ---------- A: все кандидаты ----------
  const startedV1 = Date.now()
  const pairs = await enrollments.aggregate(v1PairStages(userId, seen, enrollments.collection.name)).allowDiskUse(true)
  const v1PairsMs = Date.now() - startedV1
  const v1 = new Map()
  for (const pair of pairs) {
    const candidate = String(pair._id.candidateCourseId)
    const seed = String(pair._id.seedCourseId)
    let entry = v1.get(candidate)
    if (!entry) v1.set(candidate, (entry = { score: 0, maxPair: -Infinity, bestSeeds: new Set() }))
    entry.score += pair.score
    if (pair.score > entry.maxPair) {
      entry.maxPair = pair.score
      entry.bestSeeds = new Set([seed])
    } else if (pair.score === entry.maxPair) entry.bestSeeds.add(seed)
  }

  const neighbors = await enrollments
    .find({ courseId: { $in: seen }, status: { $in: ACTIVE }, userId: { $ne: userId } })
    .select('userId courseId -_id')
    .lean()
  const neighborIds = [...new Map(neighbors.map((item) => [String(item.userId), item.userId])).values()]
  const candidateEnrollments = await enrollments
    .find({ userId: { $in: neighborIds }, status: { $in: ACTIVE }, courseId: { $nin: seen } })
    .select('userId courseId status -_id')
    .lean()
  const v2All = scoreCollaborativeCandidates(history, neighbors, candidateEnrollments)

  let scoreMatches = 0
  let bestSeedTies = 0
  const v2Ids = new Set()
  for (const item of v2All) {
    const id = String(item.courseId)
    v2Ids.add(id)
    const entry = v1.get(id)
    if (!entry) { fail(`A: курс ${id} есть в v2, но нет в v1`); continue }
    if (entry.score !== item.score) { fail(`A: курс ${id}: score v1=${entry.score}, v2=${item.score}`); continue }
    scoreMatches++
    const best = String(item.bestSeedCourseId)
    if (!entry.bestSeeds.has(best)) fail(`A: курс ${id}: bestSeed v2=${best} не входит в максимальные пары v1 (${[...entry.bestSeeds].join(', ')})`)
    else if (best !== [...entry.bestSeeds].sort()[0]) fail(`A: курс ${id}: при ничьей v2 выбрал не меньший _id`)
    if (entry.bestSeeds.size > 1) bestSeedTies++
  }
  for (const id of v1.keys()) if (!v2Ids.has(id)) fail(`A: курс ${id} есть в v1, но нет в v2`)
  if (bestSeedTies) notes.push(`A: у ${bestSeedTies} кандидатов несколько исходных курсов с одинаковым максимальным вкладом — v1 выбирает из них произвольный, v2 детерминированно меньший _id`)

  // ---------- B: итоговый топ-N ----------
  const v1Top = await enrollments.aggregate(v1FullStages(userId, seen, enrollments.collection.name, courses.collection.name, limit)).allowDiskUse(true)
  const startedV2 = Date.now()
  const v2Top = await service.collaborativeRecommendationsForUser(String(userId), limit)
  const v2TopMs = Date.now() - startedV2

  if (v1Top.length !== v2Top.length) fail(`B: длина топа v1=${v1Top.length}, v2=${v2Top.length}`)
  const length = Math.min(v1Top.length, v2Top.length)
  for (let index = 0; index < length; index++) {
    if (sortKey(v1Top[index]) !== sortKey(v2Top[index])) fail(`B: позиция ${index + 1}: (score|rating|count) v1=${sortKey(v1Top[index])}, v2=${sortKey(v2Top[index])}`)
  }

  // Курсы с одинаковым ключом сортировки v1 может вернуть в любом порядке — сравниваем их как множества.
  const groups = (list) => {
    const map = new Map()
    for (const item of list) {
      const key = sortKey(item)
      if (!map.has(key)) map.set(key, new Set())
      map.get(key).add(String(item._id))
    }
    return map
  }
  const v1Groups = groups(v1Top.slice(0, length))
  const v2Groups = groups(v2Top.slice(0, length))
  const lastKey = length ? sortKey(v2Top[length - 1]) : undefined
  for (const [key, v2Set] of v2Groups) {
    const v1Set = v1Groups.get(key) ?? new Set()
    const same = v2Set.size === v1Set.size && [...v2Set].every((id) => v1Set.has(id))
    if (same) continue
    if (key === lastKey) notes.push(`B: на границе топа ничья (${key}) — v1 и v2 взяли разные курсы из равных; это допустимо`)
    else fail(`B: разные курсы с ключом ${key}: v1=[${[...v1Set]}], v2=[${[...v2Set]}]`)
  }

  for (let index = 0; index < v2Top.length; index++) {
    const item = v2Top[index]
    const id = String(item._id)
    const rec = item.recommendation ?? {}
    if (rec.strategy !== 'collaborative') fail(`B: курс ${id}: strategy=${rec.strategy}`)
    if ('lessons' in item || 'fullDescription' in item) fail(`B: курс ${id}: в карточке есть lessons/fullDescription`)
    if (!item.isActive) fail(`B: курс ${id}: неактивный курс в выдаче`)
    const entry = v1.get(id)
    const basedId = rec.basedOnCourse?.id ? String(rec.basedOnCourse.id) : undefined
    if (!entry || !basedId) fail(`B: курс ${id}: нет basedOnCourse или курса нет среди кандидатов v1`)
    else if (basedId !== [...entry.bestSeeds].sort()[0]) fail(`B: курс ${id}: basedOnCourse=${basedId}, ожидался ${[...entry.bestSeeds].sort()[0]}`)
    if (!rec.basedOnCourse?.title) fail(`B: курс ${id}: пустой basedOnCourse.title`)
    if (index > 0) {
      const prev = v2Top[index - 1]
      if (sortKey(prev) === sortKey(item) && String(prev._id) > id) fail(`B: позиции ${index}–${index + 1}: при равном ключе v2 нарушает порядок по _id`)
    }
  }
  for (const item of v1Top) {
    const entry = v1.get(String(item._id))
    const based = String(item.recommendation?.basedOnCourse?.id)
    if (entry && !entry.bestSeeds.has(based)) fail(`B: v1 сам выбрал basedOn ${based} не из максимальных пар — проверь копию pipeline`)
  }

  return {
    email,
    candidatesV1: v1.size,
    candidatesV2: v2All.length,
    scoreMatches,
    topLength: { v1: v1Top.length, v2: v2Top.length },
    timingsMs: { v1PairsAggregation: v1PairsMs, v2Service: v2TopMs },
    top: v2Top.map((item, index) => ({
      position: index + 1,
      v1: { id: String(v1Top[index]?._id), score: v1Top[index]?.recommendation?.score, basedOn: v1Top[index]?.recommendation?.basedOnCourse?.title },
      v2: { id: String(item._id), score: item.recommendation.score, basedOn: item.recommendation.basedOnCourse?.title },
    })),
    failures,
    notes,
  }
}

async function main() {
  const emails = option('emails', DEFAULT_EMAILS.join(',')).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  const limit = Number(option('limit', '20'))
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('--limit must be an integer from 1 to 20.')
  const outPath = resolve(option('out', 'perf-results/compare-v1-v2.json'))

  let app
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const users = app.get(getModelToken(User.name))
    const courses = app.get(getModelToken(Course.name))
    const enrollments = app.get(getModelToken(Enrollment.name))
    const service = app.get(RecommendationService)
    console.log(`Database: ${users.db.name}; users: ${emails.length}; top limit: ${limit}`)

    const results = []
    for (const email of emails) {
      process.stdout.write(`\n${email} ... `)
      const result = await compareUser({ email, limit, users, courses, enrollments, service })
      results.push(result)
      console.log(result.failures.length ? 'FAIL' : 'PASS')
      if (result.candidatesV1 !== undefined) {
        console.log(`  A: кандидатов v1=${result.candidatesV1}, v2=${result.candidatesV2}, совпало score: ${result.scoreMatches}`)
        console.log(`  B: топ v1=${result.topLength.v1}, v2=${result.topLength.v2}`)
        console.table(result.top.slice(0, 6).map((row) => ({ '#': row.position, 'v1 score': row.v1.score, 'v2 score': row.v2.score, 'тот же курс': row.v1.id === row.v2.id ? 'да' : 'нет', 'v2 based on': row.v2.basedOn })))
      }
      for (const note of result.notes) console.log(`  ℹ ${note}`)
      for (const failure of result.failures.slice(0, 20)) console.log(`  ✗ ${failure}`)
      if (result.failures.length > 20) console.log(`  … ещё ${result.failures.length - 20} ошибок в JSON-отчёте`)
    }

    const passed = results.every((result) => !result.failures.length)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), database: users.db.name, limit, passed, results }, null, 2)}\n`, 'utf8')
    console.log(`\nИТОГ: ${passed ? 'PASS — v1 и v2 дают одинаковые рекомендации' : 'FAIL — есть расхождения, см. выше'}`)
    console.log(`Отчёт: ${outPath}`)
    if (!passed) process.exitCode = 1
  } finally {
    if (app) await app.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
