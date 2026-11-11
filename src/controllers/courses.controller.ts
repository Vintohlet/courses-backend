import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import  { type AuthenticatedRequest } from '../auth/authenticated-request.js'
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js'
import { AdminGuard } from '../auth/admin.guard.js'
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard.js'
import { CourseQueryDto, CreateCourseDto, UpdateCourseDto } from '../dto/course.dto.js'
import { PaginationQueryDto } from '../dto/pagination.dto.js'
import { RecommendationQueryDto } from '../dto/recommendation.dto.js'
import { UpsertReviewDto } from '../dto/review.dto.js'
import { CourseService } from '../services/course.service.js'
import { LearningService } from '../services/learning.service.js'
import { RecommendationService } from '../services/recommendation.service.js'
import { ReviewService } from '../services/review.service.js'

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CourseService,
    private readonly learning: LearningService,
    private readonly reviews: ReviewService,
    private readonly recommendations: RecommendationService,
  ) {}

  @Get('recommendations')
  @ApiOperation({
    summary: 'Get personalized or popular course recommendations',
    description: 'Authenticated users receive collaborative recommendations based on shared enrollments when history is available. Interest-based and popular-course fallbacks are used for cold-start cases. Each returned course includes a recommendation object with strategy, score, and reason.',
  })
  @ApiOkResponse({
    description: 'An array of course cards with additive recommendation metadata: strategy, score, reason, and (for collaborative results) basedOnCourse.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '665f1c4f1c3d8a0012345678' },
          title: { type: 'string', example: 'SQL for Beginners' },
          category: { type: 'string', example: 'data-analytics' },
          ratingAvg: { type: 'number', example: 4.7 },
          recommendation: {
            type: 'object',
            properties: {
              strategy: { type: 'string', enum: ['collaborative', 'content_based', 'popular', 'popular_fallback'] },
              score: { type: 'number', example: 8 },
              reason: { type: 'string' },
              basedOnCourse: {
                type: 'object',
                properties: { id: { type: 'string' }, title: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  })
  @UseGuards(OptionalJwtAuthGuard)
  recommendationsForUser(@Query() query: RecommendationQueryDto, @Req() request: AuthenticatedRequest) {
    return this.recommendations.forUser(request.user?.id, query.limit)
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Query() query: CourseQueryDto, @Req() request: AuthenticatedRequest) {
    return this.courses.list(query, request.user?.id)
  }

  @Get(':id/similar')
  similar(@Param('id', ParseObjectIdPipe) id: string) { return this.recommendations.similar(id) }

  @Get(':id/content')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  content(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.courses.getContent(id, request.user!.id)
  }

  @Post(':id/enroll')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  enroll(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.learning.enroll(id, request.user!.id)
  }

  @Post(':id/lessons/:lessonId/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  completeLesson(@Param('id', ParseObjectIdPipe) id: string, @Param('lessonId', ParseObjectIdPipe) lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.learning.completeLesson(id, lessonId, request.user!.id)
  }

  @Get(':id/participants')
  participants(@Param('id', ParseObjectIdPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.learning.listParticipants(id, query.page, query.limit)
  }

  @Get(':id/reviews')
  listReviews(@Param('id', ParseObjectIdPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.reviews.list(id, query.page, query.limit)
  }

  @Post(':id/rating')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  upsertReview(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest, @Body() body: UpsertReviewDto) {
    return this.reviews.upsert(id, request.user!.id, body.rating, body.text)
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getById(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.courses.getPublic(id, request.user?.id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateCourseDto) {
    return this.courses.create(body, request.user!.id)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest, @Body() body: UpdateCourseDto) {
    return this.courses.update(id, body, request.user!.id)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id', ParseObjectIdPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.courses.remove(id, request.user!.id)
  }
}
