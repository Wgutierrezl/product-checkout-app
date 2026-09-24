# Product Checkout App

Mobile-first product checkout with credit card payments, built as a monorepo.

- **Frontend:** React SPA + Redux (Flux)
- **Backend:** NestJS with Hexagonal Architecture (Ports & Adapters) and Railway Oriented Programming
- **Cloud:** AWS serverless (CloudFront + S3, API Gateway + Lambda, DynamoDB), provisioned with AWS CDK

> Work in progress. Sections below will be completed as features land.

## Repository structure

```
backend/    NestJS API (hexagonal)
frontend/   React SPA
infra/      AWS CDK infrastructure as code
```

## Branching strategy

- `main` — production. Every merge deploys to AWS.
- `develop` — integration branch. Feature PRs target it; CI must pass.
- `feature/*`, `fix/*`, `chore/*` — short-lived branches, one per feature, merged via PR.

## Sections to complete

- [ ] Architecture
- [ ] Data model
- [ ] API documentation (Swagger URL)
- [ ] Test coverage results
- [ ] Deployment URLs
- [ ] Local setup
