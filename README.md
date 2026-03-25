# Fastify Backend Template

A production-ready backend template built with **Fastify**, **MongoDB**, **Redis**, **Kafka**, and **TypeScript**. All infrastructure adapters are pre-configured and ready to use — just add your modules.

## Stack

| Layer | Technology |
|---|---|
| HTTP Framework | Fastify 5 + Zod type provider |
| Database | MongoDB via Mongoose |
| Cache | Redis via ioredis |
| Message Broker | Kafka via KafkaJS |
| Auth | JWT (Bearer token + cookie) |
| API Docs | Swagger / OpenAPI |
| Observability | Prometheus metrics (`/metrics`) |
| Security | Helmet, CORS, rate limiting |
| Validation | Zod |
| Build | tsup |
| Runtime | Node.js 20+ |

## Project Structure

```
src/
├── app.ts                    # Fastify instance setup
├── main.ts                   # Entry point — connects infra, starts server
├── config/
│   └── env.ts                # Zod-validated environment config
├── lib/
│   ├── cache.ts              # Redis cache adapter (RedisCache)
│   ├── database.ts           # MongoDB connect/disconnect/health
│   ├── errors.ts             # AppError, NotFoundError, UnauthorizedError, etc.
│   └── kafka.ts              # Kafka producer connect/disconnect/getProducer
├── middlewares/
│   ├── can-access.ts         # Auth guard (requires valid JWT)
│   └── error-handler.ts      # Global error handler
├── modules/
│   └── index.ts              # Register your route modules here
├── plugins/
│   ├── auth.plugin.ts        # JWT decode → request.user
│   ├── cache.plugin.ts       # Redis → fastify.cache
│   ├── observability.plugin.ts # Prometheus metrics
│   ├── security.plugin.ts    # Helmet + CORS + rate limit
│   └── swagger.plugin.ts     # OpenAPI docs at /docs
├── seeders/
│   ├── registry.ts           # Register seeders here
│   ├── runner.ts             # Seeder runner (topological sort, transactions)
│   └── types.ts              # Seeder / SeederContext types
├── types/
│   └── jwt.ts                # JwtPayload type
└── utils/
    ├── jwt.utils.ts          # verifyToken helper
    ├── pagination.utils.ts   # getPaginator helper
    └── response.utils.ts     # successResponse / paginatedResponse helpers
```

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.development
```

Edit `.env.development` with your local values.

### 3. Run development server

```bash
pnpm dev
```

The server starts on `http://localhost:3000`.

- API docs: `http://localhost:3000/docs`
- Metrics: `http://localhost:3000/metrics`
- Health: `http://localhost:3000/health`

## Adding a Module

1. Create a folder under `src/modules/your-resource/`
2. Add your routes, service, model, and schemas
3. Register in `src/modules/index.ts`:

```ts
import yourRoutes from './your-resource/your.routes';

export default async function registerModules(app: FastifyInstance) {
  await app.register(yourRoutes, { prefix: '/your-resource' });
}
```

## Using the Adapters

### Cache (Redis)

```ts
// In your route handler or service
const cached = await fastify.cache.get<MyType>('my-key');
await fastify.cache.set('my-key', data, 3600); // TTL in seconds
await fastify.cache.del('my-key');
```

### Kafka (Producer)

```ts
import { getProducer } from '../lib/kafka';

const producer = getProducer();
await producer.send({
  topic: 'my-topic',
  messages: [{ value: JSON.stringify(payload) }],
});
```

### Auth Guard

```ts
import { canAccess } from '../middlewares/can-access';

fastify.get('/protected', { preHandler: canAccess() }, async (request) => {
  const user = request.user; // JwtPayload
  return { userId: user.sub };
});
```

### Error Classes

```ts
import { NotFoundError, BadRequestError, ConflictError } from '../lib/errors';

throw new NotFoundError('Resource not found');
throw new BadRequestError('Invalid input');
throw new ConflictError('Already exists');
```

## Seeding

Add seeders to `src/seeders/registry.ts` and run:

```bash
pnpm seed
pnpm seed -- --fresh          # drop collections first
pnpm seed -- --group=prod     # run a specific group
pnpm seed -- --dry-run        # preview without writing
```

## Building for Production

```bash
pnpm build
pnpm start:prod
```

## Docker

```bash
docker build -t my-service .
docker run -p 3000:3000 --env-file .env.production my-service
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | `development`, `production`, `test` |
| `MONGO_DATABASE_URL` | — | MongoDB connection string |
| `REDIS_URL` | — | Redis connection string |
| `JWT_SECRET` | — | Secret for JWT verification |
| `KAFKA_BROKER` | `localhost:9092` | Kafka broker address |
| `KAFKA_CLIENT_ID` | `app-service` | Kafka client ID |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics |
| `CACHE_ENABLED` | `true` | Enable Redis cache |
| `CACHE_PREFIX` | `app:` | Redis key prefix |
| `CACHE_DEFAULT_TTL` | `3600` | Default cache TTL in seconds |
| `CORS_ENABLED` | `true` | Enable CORS |
| `CORS_ORIGIN` | `*` | Allowed origins |
| `RATE_LIMIT_ENABLED` | `false` | Enable rate limiting |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window in ms |
| `TRUST_PROXY` | `false` | Trust proxy headers |
| `APP_NAME` | `App Service` | Service name (shown in Swagger) |
| `APP_VERSION` | `1.0.0` | Service version |
