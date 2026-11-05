import mongoose, { Types } from 'mongoose'

type RawDoc = Record<string, any> & { _id: Types.ObjectId }

const refFields: Record<string, string[]> = {
  enrollments: ['userId', 'courseId'],
  reviews: ['userId', 'courseId'],
  interactions: ['userId', 'courseId', 'lessonId'],
}

function toObjectId(value: unknown, collection: string, field: string, documentId: unknown) {
  if (value instanceof Types.ObjectId) return value
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) return new Types.ObjectId(value)
  throw new Error(`Cannot safely convert ${collection}.${field} in document ${String(documentId)}`)
}

async function main() {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI is missing')
  const apply = process.argv.includes('--apply')
  await mongoose.connect(uri)
  const db = mongoose.connection.db
  if (!db) throw new Error('MongoDB connection is not available')
  const plans: Array<{ collection: string; documentId: Types.ObjectId; update: Record<string, Types.ObjectId> }> = []

  for (const [collectionName, fields] of Object.entries(refFields)) {
    const collection = db.collection<RawDoc>(collectionName)
    const docs = await collection.find({ $or: fields.map((field) => ({ [field]: { $type: 'string' } })) }).toArray()
    for (const doc of docs) {
      const update: Record<string, Types.ObjectId> = {}
      for (const field of fields) {
        if (typeof doc[field] === 'string') update[field] = toObjectId(doc[field], collectionName, field, doc._id)
      }
      if (Object.keys(update).length) plans.push({ collection: collectionName, documentId: doc._id, update })
    }
  }

  for (const collectionName of ['enrollments', 'reviews']) {
    const seen = new Set<string>()
    const collectionPlans = plans.filter((plan) => plan.collection === collectionName)
    const collection = db.collection<RawDoc>(collectionName)
    for (const plan of collectionPlans) {
      const current = await collection.findOne({ _id: plan.documentId })
      if (!current) continue
      const userId = plan.update.userId ?? toObjectId(current.userId, collectionName, 'userId', current._id)
      const courseId = plan.update.courseId ?? toObjectId(current.courseId, collectionName, 'courseId', current._id)
      const key = `${userId.toHexString()}:${courseId.toHexString()}`
      if (seen.has(key)) throw new Error(`Duplicate normalized reference pair in ${collectionName}: ${key}`)
      seen.add(key)
      const duplicate = await collection.findOne({ userId, courseId, _id: { $ne: plan.documentId } })
      if (duplicate) throw new Error(`Conversion would conflict with an existing unique pair in ${collectionName}: ${key}`)
    }
  }

  console.log(`Found ${plans.length} documents with string reference IDs.`)
  if (!apply) {
    console.log('Dry run only. Rerun with --apply to convert these fields to BSON ObjectId values.')
    return
  }

  for (const plan of plans) {
    await db.collection(plan.collection).updateOne({ _id: plan.documentId }, { $set: plan.update })
  }
  await db.collection('courses').updateMany({}, { $set: { ratingAvg: 0, ratingCount: 0 } })
  const summaries = await db.collection('reviews').aggregate([
    { $group: { _id: '$courseId', ratingAvg: { $avg: '$rating' }, ratingCount: { $sum: 1 } } },
  ]).toArray()
  for (const summary of summaries) {
    await db.collection('courses').updateOne(
      { _id: summary._id },
      { $set: { ratingAvg: summary.ratingAvg, ratingCount: summary.ratingCount } },
    )
  }
  console.log(`Converted references in ${plans.length} documents.`)
  console.log(`Recomputed rating aggregates for ${summaries.length} courses.`)
}

main()
  .catch((error) => {
    console.error('Reference migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
