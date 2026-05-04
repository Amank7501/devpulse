import path from 'path';
import knexLib from 'knex';
import config from '../config/knexfile';

const db = knexLib(config);

async function run(): Promise<void> {
  const tableExists = await db.schema.hasTable('knex_migrations');
  if (tableExists) {
    const fixed = await db('knex_migrations')
      .where('name', 'like', '%.ts')
      .update({ name: db.raw("replace(name, '.ts', '.js')") });
    if (fixed > 0) {
      console.log(`Fixed ${fixed} migration record(s): renamed .ts → .js`);
    }
  }

  const [batch, log] = await db.migrate.latest();
  if (log.length === 0) {
    console.log('Already up to date.');
  } else {
    console.log(`Ran ${log.length} migration(s) in batch ${batch}:`);
    log.forEach((f: string) => console.log(' -', path.basename(f)));
  }
}

run()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.destroy());
