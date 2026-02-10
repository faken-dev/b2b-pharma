import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckPasswordDto {
  @ApiProperty({ example: 'YourPassword123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
