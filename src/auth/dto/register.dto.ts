import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * All fields are validated before the controller method runs.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'pharmacy@example.com',
    required: false,
  })
  @ValidateIf((o: RegisterDto) => o.email !== undefined)
  @IsEmail({}, { message: 'Invalid e‑mail address' })
  email?: string;

  @ApiProperty({
    required: false,
    example: '+84912345678',
  })
  @ValidateIf((o: RegisterDto) => o.phoneNumber !== undefined)
  @IsString()
  phoneNumber?: string;

  /**
   * Password rules (strong enough for a B2B system):
   * - 8‑32 characters
   * - at least one uppercase, one lowercase, one digit, one special char
   */
  @ApiProperty({
    description:
      'Password must be 8‑32 chars, include uppercase, lowercase, number and special char',
  })
  @IsString()
  @Length(8, 32, {
    message: 'Password must be between 8 and 32 characters',
  })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])/, {
    message:
      'Password too weak – must contain upper, lower, number and special character',
  })
  password: string;

  @ApiProperty({ example: 'Happy Pharmacy Co.' })
  @IsNotEmpty({ message: 'Pharmacy name must not be empty' })
  @IsString()
  pharmacyName: string;

  @ApiProperty({ example: '0101234567' })
  @IsNotEmpty({ message: 'Business license number is required' })
  @IsString()
  businessLicense: string;
}
