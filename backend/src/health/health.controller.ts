import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CLOCK_PORT, ClockPort } from '../shared/ports/clock.port';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK_PORT) private readonly clock: ClockPort) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe — never rate-limited, no dependencies checked.' })
  @ApiOkResponse({ description: 'Service liveness probe.' })
  check(): HealthStatus {
    return { status: 'ok', timestamp: this.clock.now().toISOString() };
  }
}
