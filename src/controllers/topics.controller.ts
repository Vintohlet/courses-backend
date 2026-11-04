import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AdminGuard } from '../auth/admin.guard.js'
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js'
import { CreateTopicDto } from '../dto/topic.dto.js'
import { type AuthenticatedRequest } from '../auth/authenticated-request.js'
import { CourseService } from '../services/course.service.js'

@ApiTags('topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly courses: CourseService) {}

  @Get()
  list() { return this.courses.listTopics() }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateTopicDto) {
    return this.courses.createTopic(body.slug, body.name, request.user!.id)
  }
}
