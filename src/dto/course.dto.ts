import { Transform, Type } from 'class-transformer'
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { CourseLevel } from '../models/course.model.js'

const TOPIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class LessonInputDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  order: number
}

export class CreateCourseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  shortDescription: string

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  fullDescription: string

  @IsString()
  @Matches(TOPIC_SLUG)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  category: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TOPIC_SLUG, { each: true })
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value
    return Array.isArray(values) ? values.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : values
  })
  tags?: string[]

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LessonInputDto)
  lessons: LessonInputDto[]
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class CourseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string

  @IsOptional()
  @IsString()
  @Matches(TOPIC_SLUG)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  category?: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TOPIC_SLUG, { each: true })
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value
    return Array.isArray(values) ? values.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : values
  })
  tags?: string[]

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel

  @IsOptional()
  @IsIn(['rating', 'popular', 'newest'])
  sort?: 'rating' | 'popular' | 'newest'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
