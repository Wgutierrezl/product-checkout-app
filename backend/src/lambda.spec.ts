const callOrder: string[] = [];

jest.mock('./shared/config/ssm-bootstrap', () => ({
  loadSecretsFromSsm: jest.fn(async () => {
    callOrder.push('loadSecretsFromSsm');
  }),
}));

jest.mock('./app.module', () => {
  // Importing the real AppModule runs ConfigModule.forRoot's env validation,
  // which must only happen once the SSM secrets are already in process.env.
  callOrder.push('import app.module');
  return { AppModule: class AppModule {} };
});

jest.mock('./shared/bootstrap', () => ({ applyGlobalConfig: jest.fn() }));

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(async () => ({ init: jest.fn(async () => undefined) })),
  },
}));

jest.mock('@codegenie/serverless-express', () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn(async () => ({ statusCode: 200 }))),
}));

describe('lambda handler', () => {
  beforeEach(() => {
    callOrder.length = 0;
  });

  it('does not load the application module at import time', async () => {
    await import('./lambda');

    expect(callOrder).not.toContain('import app.module');
  });

  it('loads the SSM secrets before loading the application module', async () => {
    const { handler } = await import('./lambda');

    const result = await handler({}, {} as never, () => undefined);

    expect(result).toEqual({ statusCode: 200 });
    expect(callOrder).toEqual(['loadSecretsFromSsm', 'import app.module']);
  });
});
