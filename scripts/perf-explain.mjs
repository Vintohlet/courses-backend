import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { NestFactory } from '@nestjs/core'
import { getModelToken } from '@nestjs/mongoose'
import { AppModule } from '../dist/app.module.js'
import { User } from '../dist/models/user.model.js'
import { RecommendationService } from '../dist/services/recommendation.service.js'

const WALL_CLOCK_RUNS = 5

function option(name, fallback) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function main() {
  const email = option('email', 'perf.user.000001@example.com').trim().toLowerCase()
  const outPath = resolve(option('out', '.tmp/recommendation-explain.json'))
  const limit = Number(option('limit', '6'))
  let app
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    const userModel = app.get(getModelToken(User.name))
    const user = await userModel.findOne({ email }).select('_id email').lean()
    if (!user) throw new Error(`User ${email} was not found in the database configured by .env.perf.`)
    const userId = String(user._id)

    const recommendations = app.get(RecommendationService)
    const explain = await recommendations.explainCollaborativeForUser(userId, limit)

    // One warm-up call, then timed calls of the real collaborative recommender.
    await recommendations.collaborativeRecommendationsForUser(userId, limit)
    const wallClockMs = []
    for (let run = 0; run < WALL_CLOCK_RUNS; run++) {
      const started = performance.now()
      await recommendations.collaborativeRecommendationsForUser(userId, limit)
      wallClockMs.push(Number((performance.now() - started).toFixed(2)))
    }
    const wallClock = { runs: WALL_CLOCK_RUNS, warmupRuns: 1, valuesMs: wallClockMs, medianMs: Number(median(wallClockMs).toFixed(2)) }

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify({ email, limit, wallClock, ...explain }, null, 2)}\n`, 'utf8')

    console.log(`Database: ${userModel.db.name}`)
    console.log(`User: ${email}; limit: ${limit}`)
    console.log('Collaborative queries (explain executionStats):')
    console.table(explain.queries)
    console.log(`Totals: ${JSON.stringify(explain.totals)}`)
    console.log(`Wall-clock of collaborative recommender (${WALL_CLOCK_RUNS} calls after 1 warm-up): median=${wallClock.medianMs}ms values=${wallClockMs.join(', ')}`)
    console.log(`Full explain saved to ${outPath}`)
  } finally {
    if (app) await app.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
