import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

export type InteractionDocument = HydratedDocument<Interaction>

export enum InteractionType {
  View = 'view',
  Enroll = 'enroll',
  LessonComplete = 'lesson_complete',
  CourseComplete = 'course_complete',
  Rating = 'rating',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class Interaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId

  @Prop({ required: true, enum: InteractionType, index: true })
  type: InteractionType

  @Prop({ type: Types.ObjectId })
  lessonId?: Types.ObjectId

  @Prop({ min: 1, max: 5 })
  rating?: number

  @Prop({ trim: true, maxlength: 2000 })
  reviewText?: string

  @Prop({ default: Date.now, index: true })
  createdAt: Date
}

export const InteractionSchema = SchemaFactory.createForClass(Interaction)
InteractionSchema.index({ userId: 1, createdAt: -1 })
InteractionSchema.index({ courseId: 1, type: 1, createdAt: -1 })
