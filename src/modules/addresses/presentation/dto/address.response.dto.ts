import { ApiProperty } from '@nestjs/swagger';
import { type Address } from '../../domain/address.js';

export class AddressResponseDto {
  @ApiProperty({
    description: 'Address id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({ description: 'Short label', example: 'Home' })
  readonly label: string;

  @ApiProperty({ description: 'Street / house details', example: 'House 12, Ward 4, Baluwatar' })
  readonly line1: string;

  @ApiProperty({ description: 'Area or tole', example: 'Baluwatar', nullable: true, type: String })
  readonly area: string | null;

  @ApiProperty({ description: 'City', example: 'Kathmandu' })
  readonly city: string;

  @ApiProperty({ description: 'District', example: 'Kathmandu', nullable: true, type: String })
  readonly district: string | null;

  @ApiProperty({
    description: 'Landmark',
    example: 'Opposite Bhatbhateni',
    nullable: true,
    type: String,
  })
  readonly landmark: string | null;

  @ApiProperty({ description: 'Latitude', example: 27.7215 })
  readonly latitude: number;

  @ApiProperty({ description: 'Longitude', example: 85.3304 })
  readonly longitude: number;

  @ApiProperty({ description: 'Whether this is the default address', example: true })
  readonly isDefault: boolean;

  @ApiProperty({ description: 'Creation time', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;
}

export const toAddressResponse = (a: Address): AddressResponseDto => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  area: a.area,
  city: a.city,
  district: a.district,
  landmark: a.landmark,
  latitude: a.latitude,
  longitude: a.longitude,
  isDefault: a.isDefault,
  createdAt: a.createdAt,
});
