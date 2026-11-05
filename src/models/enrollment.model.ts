import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose'

export type EnrollmentDocument = HydratedDocument<Enrollment>

export enum EnrollmentStatus {
  Active = 'active',
  Completed = 'completed',
}

@Schema({ timestamps: true, versionKey: false })
export class Enrollment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId

  @Prop({ type: String, required: true, enum: Object.values(EnrollmentStatus), default: EnrollmentStatus.Active })
  status: EnrollmentStatus

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  completedLessons: Types.ObjectId[]

  @Prop({ default: Date.now })
  enrolledAt: Date

  @Prop()
  completedAt?: Date
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment)
EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true })
EnrollmentSchema.index({ userId: 1, status: 1, enrolledAt: -1 })
EnrollmentSchema.index({ courseId: 1, status: 1 })
