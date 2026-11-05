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
| `GET` | `/api/courses/recommendations` | Public, optional JWT | Return personalized or popular courses |

Protected endpoints expect an `Authorization: Bearer <token>` header. Swagger's **Authorize** button can apply the token to requests.

## Data model

- `users`: profile, unique normalized email, password hash, topic interests, and administrator flag.
- `topics`: controlled topic slugs and display names used by user interests and course categories.
- `courses`: descriptions, category, tags, level, embedded lesson documents, and denormalized enrollment and rating aggregates.
- `enrollments`: current user/course enrollment and completed lesson IDs. A unique compound index prevents duplicate enrollments.
- `reviews`: one current review per user/course, stored separately from the course document.
- `interactions`: event history for views, enrollment, lesson completion, course completion, and ratings.

## Search and recommendations

The course catalog supports text matching on title and short description, filters for category, tags, and level, sorting, and pagination. Similar-course recommendations use category and tag overlap. Personalized recommendations compare course topics with the authenticated user's interests. Both use course rating and logarithmic enrollment count as ranking signals. Guests receive popular courses.

## Tests and checks

Run the automated suite:

```bash
npm test
```

Build the application:

```bash
npm run build
```

## Existing database migration

Earlier application builds may have stored `userId`, `courseId`, or `lessonId` references as strings. The migration converts valid 24-character hexadecimal references to BSON `ObjectId` values and recalculates course rating aggregates:

```bash
npm run migrate:refs
```

This migration is intended for an existing database created by the earlier schema. It is not needed for a fresh database or after the references have already been migrated.
