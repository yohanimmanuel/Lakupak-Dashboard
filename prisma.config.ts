import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Use real DIRECT_URL when set (local dev, runtime). When unset (e.g. Docker build), use a dummy so prisma generate succeeds.
// Migrate deploy at runtime must have DIRECT_URL in env_file.
const directUrl = process.env.DIRECT_URL || 'postgresql://localhost:5432/prisma';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: directUrl,
  },
});
