import { Transform } from 'class-transformer'
import { ArrayUnique, IsArray, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : item) : value)
  interests?: string[]
}
