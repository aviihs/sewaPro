import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsEmail, IsString, validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { IsNepalPhone, NormalizePhone, ToBoolean, Trim, TrimLower } from './validators.js';

class Sample {
  @NormalizePhone()
  @IsNepalPhone()
  readonly phone: string;

  @TrimLower()
  @IsEmail()
  readonly email: string;

  @Trim()
  @IsString()
  readonly name: string;

  @ToBoolean()
  @IsBoolean()
  readonly flag: boolean;
}

const build = (raw: Record<string, unknown>): Sample => plainToInstance(Sample, raw);

describe('custom validators', () => {
  it('normalizes phone, email, name and boolean', () => {
    const value = build({
      phone: '984-1234567',
      email: '  Ram@Example.COM ',
      name: ' Ram ',
      flag: 'true',
    });
    expect(validateSync(value)).toHaveLength(0);
    expect(value).toMatchObject({
      phone: '+9779841234567',
      email: 'ram@example.com',
      name: 'Ram',
      flag: true,
    });
    expect(build({ flag: 'false' }).flag).toBe(false);
  });

  it('reports invalid values and leaves non-strings alone', () => {
    const errors = validateSync(build({ phone: '12345', email: 'a@b.co', name: 1, flag: 'x' }));
    const phone = errors.find((e) => e.property === 'phone');
    expect(phone?.constraints?.isNepalPhone).toBe(
      'phone must be a valid Nepal mobile number (e.g. 9841234567)',
    );
    expect(errors.map((e) => e.property).sort()).toEqual(['flag', 'name', 'phone']);
    expect(build({ phone: 42, email: 7 }).phone).toBe(42);
  });
});
