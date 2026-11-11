import mongoose, { Types } from 'mongoose'
import { hash } from 'bcryptjs'
import { User, UserSchema } from '../models/user.model.js'
import { Course, CourseLevel, CourseSchema } from '../models/course.model.js'
import { Enrollment, EnrollmentSchema, EnrollmentStatus } from '../models/enrollment.model.js'

const DATABASE_NAME = 'courses_perf'
const SEED_MARKER = 'courses-perf-seed-v1'
const DEMO_PASSWORD = 'PerfPass123!'
const CATEGORIES = ['frontend', 'backend', 'machine-learning', 'analytics', 'design', 'devops', 'mobile', 'security']
const TECH_TAGS: Record<string, string[]> = {
  frontend: ['javascript', 'typescript', 'react', 'css'],
  backend: ['nodejs', 'nestjs', 'api', 'mongodb'],
  'machine-learning': ['python', 'pytorch', 'neural-networks', 'data'],
  analytics: ['sql', 'python', 'visualization', 'statistics'],
  design: ['figma', 'typography', 'ui', 'ux'],
  devops: ['docker', 'linux', 'ci-cd', 'cloud'],
  mobile: ['react-native', 'android', 'ios', 'typescript'],
  security: ['networking', 'owasp', 'cryptography', 'linux'],
}

type Scale = { users: number; courses: number; enrollmentsPerUser: number }
const SCALES: Record<string, Scale> = {
  small: { users: 100, courses: 40, enrollmentsPerUser: 6 },
  medium: { users: 1_000, courses: 200, enrollmentsPerUser: 10 },
  large: { users: 5_000, courses: 500, enrollmentsPerUser: 20 },
}

function readArgs() {
  const args = process.argv.slice(2)
  const values = new Map(args.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.join('=')]
  }))
  const scaleName = values.get('scale') ?? 'small'
  const base = SCALES[scaleName]
  if (!base) throw new Error(`Unknown scale "${scaleName}". Use small, medium, or large.`)
  const result = {
    scaleName,
    users: parsePositiveInt(values.get('users'), base.users, 'users'),
    courses: parsePositiveInt(values.get('courses'), base.courses, 'courses'),
    enrollmentsPerUser: parsePositiveInt(values.get('enrollments-per-user'), base.enrollmentsPerUser, 'enrollments-per-user'),
    seed: parsePositiveInt(values.get('seed'), 20261111, 'seed'),
  }
  if (result.courses < CATEGORIES.length) throw new Error(`At least ${CATEGORIES.length} courses are required.`)
  if (result.users > 100_000 || result.courses > 20_000 || result.enrollmentsPerUser > result.courses) {
    throw new Error('Requested dataset exceeds the safety limits or enrollment average exceeds course count.')
  }
  if (result.users * result.enrollmentsPerUser > 500_000) {
    throw new Error('The requested dataset exceeds 500,000 enrollments. Use smaller custom values to keep generation manageable.')
  }
  return result
}

function parsePositiveInt(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer.`)
  return parsed
}

function randomGenerator(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function objectId(prefix: string, index: number) {
  return new Types.ObjectId(`${prefix}${index.toString(16).padStart(16, '0')}`)
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size))
  return result
}

async function writeInBatches(collection: mongoose.mongo.Collection, operations: any[]) {
  for (const batch of chunks(operations, 1_000)) {
    if (batch.length) await collection.bulkWrite(batch, { ordered: false })
  }
}

async function seed() {
  const config = readArgs()
  const mongoUri = process.env.MONGO_URI
  if (!mongoUri) throw new Error('MONGO_URI is required. Configure it in .env before running the perf seed.')

  await mongoose.connect(mongoUri, { dbName: DATABASE_NAME })
  const db = mongoose.connection.db
  if (!db || db.databaseName !== DATABASE_NAME) throw new Error(`Safety check failed: expected database ${DATABASE_NAME}.`)

  const UserModel = mongoose.model(User.name, UserSchema)
  const CourseModel = mongoose.model(Course.name, CourseSchema)
  const EnrollmentModel = mongoose.model(Enrollment.name, EnrollmentSchema)
  await Promise.all([UserModel.createIndexes(), CourseModel.createIndexes(), EnrollmentModel.createIndexes()])

  const usersCollection = db.collection(UserModel.collection.name)
  const coursesCollection = db.collection(CourseModel.collection.name)
  const enrollmentsCollection = db.collection(EnrollmentModel.collection.name)

  // Remove only documents created by this script. Never drop the database or unrelated documents.
  await Promise.all([
    usersCollection.deleteMany({ _perfSeed: SEED_MARKER }),
    coursesCollection.deleteMany({ _perfSeed: SEED_MARKER }),
    enrollmentsCollection.deleteMany({ _perfSeed: SEED_MARKER }),
  ])

  const random = randomGenerator(config.seed)
  const now = Date.now()
  const passwordHash = await hash(DEMO_PASSWORD, 12)
  const courses = Array.from({ length: config.courses }, (_, index) => {
    const category = CATEGORIES[index % CATEGORIES.length]
    const id = objectId('66f20000', index + 1)
    const lessonCount = 5 + Math.floor(random() * 6)
    const lessons = Array.from({ length: lessonCount }, (_, lessonIndex) => ({
      _id: objectId('66f30000', index * 16 + lessonIndex + 1),
      title: `Lesson ${lessonIndex + 1}: ${category} foundations`,
      description: `Synthetic lesson content for performance testing course ${index + 1}.`,
      order: lessonIndex,
    }))
    return {
      _id: id,
      title: `${category.replaceAll('-', ' ')} performance course ${String(index + 1).padStart(5, '0')}`,
      shortDescription: `Synthetic ${category} course for recommendation load testing.`,
      fullDescription: `Generated performance dataset course ${index + 1} in ${category}.`,
      category,
      tags: [category, ...TECH_TAGS[category].slice(0, 2 + Math.floor(random() * 3))],
      level: [CourseLevel.Beginner, CourseLevel.Intermediate, CourseLevel.Advanced][index % 3],
      lessons,
      enrollCount: 0,
      ratingAvg: Math.round((3.2 + random() * 1.8) * 10) / 10,
      ratingCount: Math.floor(random() * 250),
      isActive: true,
      createdAt: new Date(now - Math.floor(random() * 365) * 86_400_000),
      updatedAt: new Date(now),
      _perfSeed: SEED_MARKER,
    }
  })

  const coursesByCategory = new Map(CATEGORIES.map((category) => [
    category,
    courses.filter((course) => course.category === category),
  ]))
  const courseIndexById = new Map(courses.map((course, index) => [course._id.toString(), index]))

  const userDocs: any[] = []
  const enrollmentDocs: any[] = []
  const enrollmentCounts = new Array(config.courses).fill(0)
  let enrollmentIndex = 0

  for (let userIndex = 0; userIndex < config.users; userIndex++) {
    const primary = CATEGORIES[userIndex % CATEGORIES.length]
    const secondary = CATEGORIES[(userIndex + 1 + Math.floor(userIndex / CATEGORIES.length)) % CATEGORIES.length]
    const interests = [...new Set([primary, secondary])]
    const userId = objectId('66f10000', userIndex + 1)
    userDocs.push({
      _id: userId,
      name: `Perf User ${String(userIndex + 1).padStart(6, '0')}`,
      email: `perf.user.${String(userIndex + 1).padStart(6, '0')}@example.com`,
      passwordHash,
      interests,
      isAdmin: false,
      createdAt: new Date(now - Math.floor(random() * 365) * 86_400_000),
      updatedAt: new Date(now),
      _perfSeed: SEED_MARKER,
    })

    const targetCount = Math.min(config.courses, config.enrollmentsPerUser)
    const selected = new Map<number, typeof courses[number]>()
    let attempts = 0
    while (selected.size < targetCount && attempts < targetCount * 30) {
      attempts++
      let category: string
      const roll = random()
      if (roll < 0.48) category = primary
      else if (roll < 0.78) category = secondary
      else category = CATEGORIES[Math.floor(random() * CATEGORIES.length)]
      const categoryCourses = coursesByCategory.get(category) ?? []
      const course = categoryCourses[Math.floor(random() * categoryCourses.length)]
      if (course) selected.set(courseIndexById.get(course._id.toString())!, course)
    }

    for (const course of selected.values()) {
      const completed = random() < 0.68
      const lessonCount = course.lessons.length
      const completedCount = completed ? lessonCount : Math.max(1, Math.floor(random() * (lessonCount - 1)))
      const enrolledAt = new Date(now - Math.floor(random() * 180) * 86_400_000)
      enrollmentDocs.push({
        _id: objectId('66f40000', ++enrollmentIndex),
        userId,
        courseId: course._id,
        status: completed ? EnrollmentStatus.Completed : EnrollmentStatus.Active,
        completedLessons: course.lessons.slice(0, completedCount).map((lesson) => lesson._id),
        enrolledAt,
        completedAt: completed ? new Date(enrolledAt.getTime() + 7 * 86_400_000) : undefined,
        createdAt: enrolledAt,
        updatedAt: new Date(now),
        _perfSeed: SEED_MARKER,
      })
      enrollmentCounts[courseIndexById.get(course._id.toString())!]++
    }
  }

  for (let index = 0; index < courses.length; index++) courses[index].enrollCount = enrollmentCounts[index]

  await writeInBatches(coursesCollection, courses.map((document) => ({ insertOne: { document } })))
  await writeInBatches(usersCollection, userDocs.map((document) => ({ insertOne: { document } })))
  await writeInBatches(enrollmentsCollection, enrollmentDocs.map((document) => ({ insertOne: { document } })))

  console.log(`Seeded database: ${DATABASE_NAME}`)
  console.log(`Scale: ${config.scaleName}; users: ${userDocs.length}; courses: ${courses.length}; enrollments: ${enrollmentDocs.length}`)
  console.log(`Average enrollments per user: ${(enrollmentDocs.length / userDocs.length).toFixed(2)}`)
  console.log(`Recommendation test account: perf.user.000001@example.com / ${DEMO_PASSWORD}`)
  console.log('This script only removes documents carrying its own _perfSeed marker.')
}

seed()
  .catch((error) => {
    console.error('Performance seed failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
