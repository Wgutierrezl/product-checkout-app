import { maskEmail, maskPhone } from './mask-pii';

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
});

describe('maskPhone', () => {
  it('keeps only the last 4 digits visible, masking the rest', () => {
    expect(maskPhone('+573001234567')).toBe('********4567');
  });

  it('masks every digit when the phone has 4 digits or fewer', () => {
    expect(maskPhone('123')).toBe('***');
  });
});
