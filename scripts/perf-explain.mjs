import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { getModelToken } from '@nestjs/mongoose'
import { AppModule } from '../dist/app.module.js'
import { User } from '../dist/models/user.model.js'
import { RecommendationService } from '../dist/services/recommendation.service.js'

function option(name, fallback) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}

function collectLookupStats(value, path = '$', result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLookupStats(item, `${path}[${index}]`, result))
    return result
  }
  if (!value || typeof value !== 'object') return result

  if (value.$lookup) {
    result.push({
      path,
      from: value.$lookup.from,
      as: value.$lookup.as,
      indexesUsed: value.indexesUsed ?? [],
      collectionScans: value.collectionScans,
      totalKeysExamined: value.totalKeysExamined,
      totalDocsExamined: value.totalDocsExamined,
      executionTimeMillisEstimate: value.executionTimeMillisEstimate,
      nReturned: value.nReturned,
    })
  }
  for (const [key, child] of Object.entries(value)) collectLookupStats(child, `${path}.${key}`, result)
  return result
}

async function main() {
  const email = option('email', 'perf.user.000001@example.com').trim().toLowerCase()
  const outPath = resolve(option('out', '.tmp/recommendation-explain.json'))
  let app
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const userModel = app.get(getModelToken(User.name))
    const user = await userModel.findOne({ email }).select('_id email').lean()
    if (!user) throw new Error(`User ${email} was not found in the database configured by .env.perf.`)

    const recommendations = app.get(RecommendationService)
    const explain = await recommendations.explainCollaborativeForUser(String(user._id))
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(explain, null, 2)}\n`, 'utf8')

    const cursorStats = explain.stages?.find((stage) => stage.$cursor)?.$cursor?.executionStats
    const lookupStats = collectLookupStats(explain.stages ?? [])
    console.log(`Database: ${app.get(getModelToken(User.name)).db.name}`)
    console.log(`User: ${email}`)
    console.log('Aggregation execution stats:')
    console.log(JSON.stringify({
      cursor: cursorStats ? {
        nReturned: cursorStats.nReturned,
        executionTimeMillis: cursorStats.executionTimeMillis,
        totalKeysExamined: cursorStats.totalKeysExamined,
        totalDocsExamined: cursorStats.totalDocsExamined,
      } : 'See full explain output; server version may report cursor statistics in a different location.',
      lookups: lookupStats,
      output: outPath,
    }, null, 2))
  } finally {
    if (app) await app.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
