# Lambda asset test fixture

Placeholder directory used ONLY by `infra`'s unit tests (`ApiStack`'s
`lambdaAssetPath` prop). `Code.fromAsset` needs a real local directory to
hash and zip at synth time — CDK never reads or executes its contents
during `Template.fromStack` assertions, so this file is enough.

The REAL Lambda deployment package is built from `backend/dist-lambda` via
`npm run package:lambda` (see `backend/package.json`) and wired in
`infra/bin/app.ts`, which builds it on demand if missing.
