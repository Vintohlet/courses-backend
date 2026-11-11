# Courses Platform Backend

Backend for a MongoDB-based online learning platform. It provides account authentication, course catalog search, enrollment and progress tracking, reviews, and course recommendations.

## Stack

- Node.js 20.6 or newer
- NestJS and TypeScript
- MongoDB with Mongoose
- JWT authentication and bcrypt password hashing
- Swagger/OpenAPI documentation
- Vitest for automated tests

## Requirements

- Node.js 20.6+
- npm
- A running MongoDB instance, local or hosted

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/courses_platform
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:5173
```

Keep `.env` private and do not commit it. Start MongoDB before starting the API.

## Seed demonstration data

Run:

```bash
npm run seed
```

The command builds the project and inserts demonstration topics, courses with lessons, users, enrollments, reviews, and interaction events. It uses upserts, so running it again updates the same demo records instead of creating copies.

All seeded users use this password:

```text
DemoPass123!
```

Example account: `john.doe@example.com`. Seeded accounts are students. To test administrator-only course and topic management, set `isAdmin` to `true` for a user in MongoDB Compass. The public registration and profile endpoints do not allow users to change this field.

## Run the API

Development mode with automatic rebuild:

```bash
npm run start:dev
```

The API uses the `/api` prefix. Swagger UI is available at:

```text
http://localhost:3000/docs
```

Health check:

```text
GET http://localhost:3000/api/health
```

Production build and start:

```bash
npm run build
npm run start:prod
```

## Main API routes

| Method | Route | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a user |
| `POST` | `/api/auth/login` | Public | Authenticate and receive a JWT |
| `GET` | `/api/users/me` | JWT | Read the current profile and course progress |
| `PATCH` | `/api/users/me` | JWT | Update name, email, or interests |
| `GET` | `/api/topics` | Public | List available interest and category topics |
| `POST` | `/api/topics` | Admin | Add a topic |
| `GET` | `/api/courses` | Public, optional JWT | Search, filter, sort, and paginate courses |
| `GET` | `/api/courses/:id` | Public, optional JWT | Read the public course summary |
| `POST` | `/api/courses` | Admin | Create a course |
| `PATCH` | `/api/courses/:id` | Admin | Update a course |
| `DELETE` | `/api/courses/:id` | Admin | Deactivate a course while preserving history |
| `GET` | `/api/courses/:id/content` | JWT + enrollment | Read full description and lessons |
| `POST` | `/api/courses/:id/enroll` | JWT | Enroll in a course |
| `POST` | `/api/courses/:id/lessons/:lessonId/complete` | JWT + enrollment | Complete a lesson and update progress |
| `GET` | `/api/courses/:id/participants` | Public | List students currently taking the course |
| `GET` | `/api/courses/:id/reviews` | Public | List course reviews |
| `POST` | `/api/courses/:id/rating` | JWT + completed course | Create or update a rating and review |
| `GET` | `/api/courses/:id/similar` | Public | Recommend similar courses |
| `GET` | `/api/courses/recommendations?limit=6` | Public, optional JWT | Return collaborative, interest-based, or popular courses with recommendation metadata |

Protected endpoints expect an `Authorization: Bearer <token>` header. Swagger's **Authorize** button can apply the token to requests.

## Data model

- `users`: profile, unique normalized email, password hash, topic interests, and administrator flag.
- `topics`: controlled topic slugs and display names used by user interests and course categories.
- `courses`: descriptions, category, tags, level, embedded lesson documents, and denormalized enrollment and rating aggregates.
- `enrollments`: current user/course enrollment and completed lesson IDs. A unique compound index prevents duplicate enrollments.
- `reviews`: one current review per user/course, stored separately from the course document.
- `interactions`: event history for views, enrollment, lesson completion, course completion, and ratings.

## Search and recommendations

The course catalog supports text matching on title and short description, filters for category, tags, and level, sorting, and pagination. Similar-course recommendations use category and tag overlap.

Personalized recommendations use item-based collaborative filtering when an authenticated user has enrollment history. For each course the user is taking or has completed, the service finds other users enrolled in that course and scores their other courses as candidates. Completed enrollments have a higher weight than active enrollments. Courses the current user is already taking or has completed are excluded. The response remains an array of course objects and adds a `recommendation` object containing the strategy, score, explanation, and the source course for collaborative results. `limit` is optional and ranges from 1 to 20.

When collaborative history is unavailable or produces no candidates, users with interests receive content-based results ranked by topic overlap, course rating, and enrollment count. If that also produces no results, the API returns popular courses. Guests receive popular courses. These fallbacks handle the cold-start problem.

## Tests and checks

Run the automated suite:

```bash
npm test
```

Build the application:

```bash
npm run build
```

## Recommendation performance measurements

Performance data is isolated in the `courses_perf` database. The performance seed never drops a database: it removes only documents tagged with its own `_perfSeed` marker, then writes a deterministic synthetic dataset and ensures the application model indexes exist.

Copy `.env.perf.example` to `.env.perf`. Keep the performance API on port `3001` so it can run beside the regular development API. The seed reads `MONGO_URI` from `.env` and explicitly selects the `courses_perf` database, regardless of the database name in that URI. Ensure MongoDB is running before seeding.

Create the small dataset first:

```bash
npm run perf:seed -- --scale=small
```

Available default scales are:

| Scale | Users | Courses | Target enrollments per user |
|---|---:|---:|---:|
| `small` | 100 | 40 | 6 |
| `medium` | 1,000 | 200 | 10 |
| `large` | 5,000 | 500 | 20 |

Custom sizes can be generated with `--users`, `--courses`, and `--enrollments-per-user`, for example:

```bash
npm run perf:seed -- --users=2000 --courses=300 --enrollments-per-user=12 --seed=20261111
```

Each run replaces only the seed's tagged documents, so moving from a large scale back to a small scale removes the old performance dataset. The generated users share a known test password: `PerfPass123!`. For example, `perf.user.000001@example.com` is used by the benchmark runner.

Build and start a separate API instance using `.env.perf`:

```bash
npm run build
npm run perf:start
```

Run the authenticated recommendation benchmark from another terminal:

```bash
npm run perf:benchmark -- --base-url=http://localhost:3001/api --dataset=small --requests=100 --warmup=10 --concurrency=1,5,10 --limit=6 --out=.tmp/perf-results.csv
```

The runner logs per-concurrency p50, p95, maximum latency, throughput, and errors, then appends the measurements to a CSV file. Repeat the seed and benchmark for each scale. For fair comparisons, use the same machine, API settings, request count, concurrency levels, and warm-up procedure. Record the Node.js and MongoDB versions and whether the API and database run on the same machine.

To get `executionStats` for the exact collaborative aggregation used by the recommendation service, run:

```bash
npm run perf:explain -- --email=perf.user.000001@example.com --out=.tmp/large-explain.json
```

This command loads `.env.perf`, selects that user's enrollment history, runs the same aggregation pipeline with MongoDB's `explain("executionStats")`, prints a lookup summary, and saves the complete explain document as JSON. Run it after seeding the selected scale; change the output filename for each scale so earlier plans are preserved. The benchmark API does not need to be running for this command.

### How to evaluate and optimize

1. Record a baseline at each dataset size before changing indexes or the aggregation.
2. Inspect the saved explain JSON and check the `enrollments` indexes in MongoDB Compass. The important access patterns are: finding the current user's enrollments, finding users enrolled in each seed course, and finding those users' other courses.
3. Compare `totalKeysExamined`, `totalDocsExamined`, execution time, and whether the stages use indexes or scan whole collections. The existing enrollment indexes cover user-to-course and course-to-user lookups; add or change an index only when explain results show a useful improvement.
4. The collaborative pipeline groups matching neighbor users before looking up their other courses. This avoids repeating the second enrollment lookup when the same user appears as a neighbor for several of the current user's courses. Compare its `neighborCourses` lookup statistics with the saved baseline.
5. Change one thing at a time, rerun the same workload, and compare the CSV results. Report p50 and p95 alongside database execution statistics, because HTTP timing also includes application and network overhead.
6. If the aggregation remains expensive at larger scales, evaluate precomputed item-to-item course similarities. This trades fresher results and extra write/refresh work for faster recommendation reads. Use measurements to justify whether that added complexity is needed.

Do not use the performance seed against a production database. It selects `courses_perf` and writes only tagged synthetic documents, but the performance account password is intentionally public for local demonstrations.

## Existing database migration

Earlier application builds may have stored `userId`, `courseId`, or `lessonId` references as strings. The migration converts valid 24-character hexadecimal references to BSON `ObjectId` values and recalculates course rating aggregates:

```bash
npm run migrate:refs
```

This migration is intended for an existing database created by the earlier schema. It is not needed for a fresh database or after the references have already been migrated.
