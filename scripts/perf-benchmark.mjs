import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import os from 'node:os'
import { performance } from 'node:perf_hooks'

const FIELDS = ['timestamp', 'dataset', 'variant', 'run', 'requests', 'concurrency', 'limit', 'success', 'errors', 'elapsedSeconds', 'requestsPerSecond', 'p50Ms', 'p95Ms', 'maxMs']
const HEADER = FIELDS.join(',')

function option(name, fallback) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}

function positiveInt(name, fallback) {
  const value = Number(option(name, fallback))
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer.`)
  return value
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function readResponse(response) {
  const body = await response.text()
  let parsed
  try { parsed = JSON.parse(body) } catch { parsed = body }
  return { status: response.status, body: parsed }
}

function assertCompatibleOutput(outPath) {
  if (!existsSync(outPath)) return
  const content = readFileSync(outPath, 'utf8')
  if (!content.trim()) return
  const firstLine = content.split(/\r?\n/, 1)[0].trim()
  if (firstLine !== HEADER) {
    throw new Error(
      `Output file ${outPath} has a different CSV header and will not be appended to.\n` +
      `  expected: ${HEADER}\n  found:    ${firstLine}\n` +
      'Choose another --out file or move the old one.',
    )
  }
}

async function main() {
  const baseUrl = option('base-url', 'http://localhost:3000/api').replace(/\/$/, '')
  const email = option('email', 'perf.user.000001@example.com')
  const password = option('password', 'PerfPass123!')
  const requests = positiveInt('requests', 100)
  const warmup = positiveInt('warmup', 10)
  const limit = positiveInt('limit', 6)
  const repeats = positiveInt('repeats', 1)
  const dataset = option('dataset', 'unspecified')
  const variant = option('variant', 'unspecified')
  const outPath = resolve(option('out', 'perf-results.csv'))
  const concurrencyValues = option('concurrency', '1,5,10').split(',').map((value) => {
    const parsed = Number(value.trim())
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('--concurrency must be a comma-separated list of positive integers.')
    return parsed
  })

  assertCompatibleOutput(outPath)

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const login = await readResponse(loginResponse)
  if (!loginResponse.ok || typeof login.body?.accessToken !== 'string') {
    throw new Error(`Login failed (${login.status}). Check API URL, credentials, and that the perf seed exists.`)
  }
  const token = login.body.accessToken
  const target = `${baseUrl}/courses/recommendations?limit=${limit}`

  async function sendOne() {
    const started = performance.now()
    try {
      const response = await fetch(target, { headers: { authorization: `Bearer ${token}` } })
      await response.arrayBuffer()
      return { ms: performance.now() - started, status: response.status }
    } catch (error) {
      return { ms: performance.now() - started, status: 0, error: String(error) }
    }
  }

  console.log(`API: ${baseUrl}`)
  console.log(`Dataset: ${dataset}; variant: ${variant}; limit: ${limit}; warm-up requests: ${warmup}; repeats: ${repeats}`)
  console.log(`Host: ${os.cpus()[0]?.model ?? 'unknown'}; Node ${process.version}; ${os.platform()} ${os.arch()}`)
  console.log('Warm-up in progress...')
  for (let index = 0; index < warmup; index++) {
    const result = await sendOne()
    if (result.status !== 200) throw new Error(`Warm-up request failed with HTTP ${result.status}${result.error ? `: ${result.error}` : ''}`)
  }

  const rows = []
  for (let run = 1; run <= repeats; run++) {
    for (const concurrency of concurrencyValues) {
      const latencies = []
      const statuses = []
      let nextRequest = 0
      const started = performance.now()
      await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
        while (true) {
          const index = nextRequest++
          if (index >= requests) return
          const result = await sendOne()
          latencies.push(result.ms)
          statuses.push(result.status)
        }
      }))
      const elapsedSeconds = (performance.now() - started) / 1_000
      const success = statuses.filter((status) => status >= 200 && status < 300).length
      const errors = statuses.length - success
      const row = {
        timestamp: new Date().toISOString(),
        dataset,
        variant,
        run,
        requests,
        concurrency,
        limit,
        success,
        errors,
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
        requestsPerSecond: Number((requests / elapsedSeconds).toFixed(2)),
        p50Ms: Number(percentile(latencies, 0.50).toFixed(2)),
        p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
        maxMs: Number(Math.max(...latencies).toFixed(2)),
      }
      rows.push(row)
      console.log(`run=${run}/${repeats} concurrency=${concurrency}: p50=${row.p50Ms}ms p95=${row.p95Ms}ms max=${row.maxMs}ms throughput=${row.requestsPerSecond} req/s errors=${errors}`)
    }
  }

  mkdirSync(dirname(outPath), { recursive: true })
  if (!existsSync(outPath) || !readFileSync(outPath, 'utf8').trim()) appendFileSync(outPath, `${HEADER}\n`)
  for (const row of rows) appendFileSync(outPath, `${FIELDS.map((field) => JSON.stringify(row[field])).join(',')}\n`)
  console.log(`Results appended to ${outPath}`)

  console.log(`\nSummary (median over ${repeats} run(s)), variant=${variant}, dataset=${dataset}:`)
  for (const concurrency of concurrencyValues) {
    const group = rows.filter((row) => row.concurrency === concurrency)
    console.log(
      `concurrency=${concurrency}: p50=${median(group.map((row) => row.p50Ms)).toFixed(2)}ms ` +
      `p95=${median(group.map((row) => row.p95Ms)).toFixed(2)}ms ` +
      `throughput=${median(group.map((row) => row.requestsPerSecond)).toFixed(2)} req/s`,
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
