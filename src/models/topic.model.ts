import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type TopicDocument = HydratedDocument<Topic>

@Schema({ timestamps: true, versionKey: false })
export class Topic {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string

  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string

  @Prop({ default: true, index: true })
  isActive: boolean
}

export const TopicSchema = SchemaFactory.createForClass(Topic)
