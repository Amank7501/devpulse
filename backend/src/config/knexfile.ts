import path from 'path';
import { env } from './env';

const migrationExtension = __filename.endsWith('.ts') ? 'ts' : 'js';

const config = {
  client: 'pg',
  connection: env.DATABASE_URL,
  migrations: {
    directory: path.resolve(__dirname, '../db/migrations'),
    extension: migrationExtension,
  },
  seeds: {
    directory: path.resolve(__dirname, '../db/seeds'),
    extension: migrationExtension,
  },
};

export default config;
