import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasFullName = await knex.schema.hasColumn('repos', 'full_name');
  const hasOwnerLogin = await knex.schema.hasColumn('repos', 'owner_login');

  if (!hasFullName || !hasOwnerLogin) {
    await knex.schema.alterTable('repos', (table) => {
      if (!hasFullName) table.string('full_name', 255).nullable();
      if (!hasOwnerLogin) table.string('owner_login', 255).nullable();
    });
  }

  if (!hasFullName) {
    await knex.raw("UPDATE repos SET full_name = owner || '/' || name WHERE full_name IS NULL");
  }
  if (!hasOwnerLogin) {
    await knex.raw('UPDATE repos SET owner_login = owner WHERE owner_login IS NULL');
  }

  // Add unique constraint only if not already present
  const result = await knex.raw<{ rows: unknown[] }>(`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'repos_full_name_unique'
      AND conrelid = 'repos'::regclass
  `);
  if (result.rows.length === 0) {
    await knex.schema.alterTable('repos', (table) => {
      table.unique(['full_name'], { indexName: 'repos_full_name_unique' });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('repos', (table) => {
    table.dropUnique(['full_name'], 'repos_full_name_unique');
    table.dropColumn('full_name');
    table.dropColumn('owner_login');
  });
}
