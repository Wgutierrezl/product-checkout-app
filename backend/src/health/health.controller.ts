import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CLOCK_PORT, ClockPort } from '../shared/ports/clock.port';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  @Get()
  @ApiOkResponse({ description: 'Service liveness probe.' })
  check(): HealthStatus {
    return { status: 'ok', timestamp: this.clock.now().toISOString() };
  }
}
