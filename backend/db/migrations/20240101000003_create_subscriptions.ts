import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_repo_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('repo_id').notNullable().references('id').inTable('repos').onDelete('CASCADE');
    table.timestamp('added_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_synced', { useTz: true }).nullable();
    table.text('sync_cursor').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.unique(['user_id', 'repo_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_repo_subscriptions');
}
