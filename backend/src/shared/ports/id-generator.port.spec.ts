import { ID_GENERATOR_PORT } from './id-generator.port';

describe('ID_GENERATOR_PORT', () => {
  it('is a unique DI token symbol', () => {
    expect(typeof ID_GENERATOR_PORT).toBe('symbol');
    expect(ID_GENERATOR_PORT.description).toBe('ID_GENERATOR_PORT');
  });
});
