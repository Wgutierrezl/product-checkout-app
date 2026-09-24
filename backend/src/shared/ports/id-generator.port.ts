export interface IdGeneratorPort {
  newId(): string;
  newReference(): string;
}

export const ID_GENERATOR_PORT = Symbol('ID_GENERATOR_PORT');
