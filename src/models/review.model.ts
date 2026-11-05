import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose'

export type ReviewDocument = HydratedDocument<Review>

@Schema({ timestamps: true, versionKey: false })
export class Review {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId

  @Prop({ required: true, min: 1, max: 5 })
  rating: number

  @Prop({ trim: true, maxlength: 2000, default: '' })
  text: string
}

export const ReviewSchema = SchemaFactory.createForClass(Review)
ReviewSchema.index({ userId: 1, courseId: 1 }, { unique: true })
ReviewSchema.index({ courseId: 1, createdAt: -1 })
