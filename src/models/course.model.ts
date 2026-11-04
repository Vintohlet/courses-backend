import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

export type CourseDocument = HydratedDocument<Course>

export enum CourseLevel {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

@Schema({ _id: true })
export class Lesson {
  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string

  @Prop({ required: true, trim: true })
  description: string

  @Prop({ required: true, min: 0 })
  order: number
}

export const LessonSchema = SchemaFactory.createForClass(Lesson)

@Schema({ timestamps: true, versionKey: false })
export class Course {
  @Prop({ required: true, trim: true, maxlength: 160, index: true })
  title: string

  @Prop({ required: true, trim: true, maxlength: 500 })
  shortDescription: string

  @Prop({ required: true, trim: true })
  fullDescription: string

  @Prop({ required: true, trim: true, index: true })
  category: string

  @Prop({ type: [String], default: [], index: true })
  tags: string[]

  @Prop({ required: true, enum: CourseLevel, default: CourseLevel.Beginner, index: true })
  level: CourseLevel

  @Prop({ type: [LessonSchema], default: [] })
  lessons: Lesson[]

  @Prop({ default: 0, min: 0 })
  enrollCount: number

  @Prop({ default: 0, min: 0, max: 5 })
  ratingAvg: number

  @Prop({ default: 0, min: 0 })
  ratingCount: number
}

export const CourseSchema = SchemaFactory.createForClass(Course)
CourseSchema.index({ ratingAvg: -1, ratingCount: -1 })
CourseSchema.index({ category: 1, tags: 1 })
