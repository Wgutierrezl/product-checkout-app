import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { User, UserPreferences } from '../domain/user.entity';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../domain/user.repository.port';

export interface UpdatePreferencesCommand {
  userId: string;
  preferences: UserPreferences;
}

/**
 * Thin write-through to `UserRepositoryPort.updatePreferences` — field-level
 * validation (matching the checkout DTOs exactly, so a saved preference is
 * always valid checkout input) already happened at the HTTP boundary
 * (`UpdatePreferencesDto`), so there is nothing else to validate here.
 */
@Injectable()
export class UpdatePreferencesUseCase {
  constructor(@Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort) {}

  execute(command: UpdatePreferencesCommand): AppResultAsync<User> {
    return this.users.updatePreferences(command.userId, command.preferences);
  }
}
