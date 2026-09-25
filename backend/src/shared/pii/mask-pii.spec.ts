import { maskAddress, maskEmail, maskPhone } from './mask-pii';

describe('maskEmail', () => {
  it('keeps the first 2 local-part characters and the full domain visible', () => {
    expect(maskEmail('johndoe@example.com')).toBe('jo*****@example.com');
  });

  it('masks the whole local part down to 3 asterisks when it is 2 chars or shorter', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
  });

  it('falls back to a fixed mask when there is no @ separator', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('is unicode-safe: does not split an astral character (emoji) in the local part', () => {
    expect(maskEmail('😀abc@example.com')).toBe('😀a**@example.com');
  });
});

describe('maskPhone', () => {
  it('keeps only the last 4 digits visible, masking the rest', () => {
    expect(maskPhone('+573001234567')).toBe('********4567');
  });

  it('masks every digit when the phone has 4 digits or fewer', () => {
    expect(maskPhone('123')).toBe('***');
  });

  it('is unicode-safe: ignores an astral character (emoji) embedded in the input', () => {
    expect(maskPhone('+57🙂3001234567')).toBe('********4567');
  });
});

describe('maskAddress', () => {
  it('keeps the first 4 characters visible and masks the rest with a fixed suffix', () => {
    expect(maskAddress('Cra 7 # 71-21')).toBe('Cra ***');
  });

  it('keeps the whole address visible (plus the mask suffix) when shorter than 4 characters', () => {
    expect(maskAddress('Ab')).toBe('Ab***');
  });

  it('is unicode-safe: does not split an astral character (emoji) in the first 4 characters', () => {
    expect(maskAddress('🏠123 Main St')).toBe('🏠123***');
  });
});
