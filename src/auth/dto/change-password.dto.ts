import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentP@ssw0rd123!' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewStr0ngP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
