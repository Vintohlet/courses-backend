import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { AppController } from './app.controller.js'
import { Course, CourseSchema } from './models/course.model.js'
import { Enrollment, EnrollmentSchema } from './models/enrollment.model.js'
import { Interaction, InteractionSchema } from './models/interaction.model.js'
import { User, UserSchema } from './models/user.model.js'
import { Topic, TopicSchema } from './models/topic.model.js'
import { Review, ReviewSchema } from './models/review.model.js'
import { AuthService } from './services/auth.service.js'
import { ProfileService } from './services/profile.service.js'
import { CourseService } from './services/course.service.js'
import { LearningService } from './services/learning.service.js'
import { ReviewService } from './services/review.service.js'
import { RecommendationService } from './services/recommendation.service.js'
import { JwtModule } from '@nestjs/jwt'
import { JwtAuthGuard } from './auth/jwt-auth.guard.js'
import { OptionalJwtAuthGuard } from './auth/optional-jwt-auth.guard.js'
import { AdminGuard } from './auth/admin.guard.js'
import { AuthController } from './controllers/auth.controller.js'
import { ProfileController } from './controllers/profile.controller.js'
import { CoursesController } from './controllers/courses.controller.js'
import { TopicsController } from './controllers/topics.controller.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGO_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Interaction.name, schema: InteractionSchema },
      { name: Topic.name, schema: TopicSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  controllers: [AppController, AuthController, ProfileController, CoursesController, TopicsController],
  providers: [AuthService, ProfileService, CourseService, LearningService, ReviewService, RecommendationService, JwtAuthGuard, OptionalJwtAuthGuard, AdminGuard],
})
export class AppModule {}
