import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type UserDocument = HydratedDocument<User>

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string

  @Prop({ required: true, select: false })
  passwordHash: string

  @Prop({ type: [String], default: [] })
  interests: string[]
}

export const UserSchema = SchemaFactory.createForClass(User)
