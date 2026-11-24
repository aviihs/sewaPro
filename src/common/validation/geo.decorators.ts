import { applyDecorators } from '@nestjs/common';
import { IsNumber, Max, Min } from 'class-validator';
import { NEPAL_BOUNDS } from './nepal-bounds.js';

const NUMBER = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 7 } as const;

/** Latitude inside Nepal's bounding box. */
export const IsNepalLatitude = (): PropertyDecorator =>
  applyDecorators(IsNumber(NUMBER), Min(NEPAL_BOUNDS.minLatitude), Max(NEPAL_BOUNDS.maxLatitude));

/** Longitude inside Nepal's bounding box. */
export const IsNepalLongitude = (): PropertyDecorator =>
  applyDecorators(IsNumber(NUMBER), Min(NEPAL_BOUNDS.minLongitude), Max(NEPAL_BOUNDS.maxLongitude));
