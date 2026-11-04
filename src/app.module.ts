import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { AppController } from './app.controller.js'
import { Course, CourseSchema } from './models/course.model.js'
import { Enrollment, EnrollmentSchema } from './models/enrollment.model.js'
import { Interaction, InteractionSchema } from './models/interaction.model.js'
import { User, UserSchema } from './models/user.model.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    ]),
  ],
  controllers: [AppController],
})
export class AppModule {}
