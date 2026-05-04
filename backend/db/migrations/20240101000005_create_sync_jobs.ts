import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sync_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('repo_id').notNullable().references('id').inTable('repos').onDelete('CASCADE');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('events_fetched').notNullable().defaultTo(0);
    table.integer('events_inserted').notNullable().defaultTo(0);
    table.smallint('api_calls_made').notNullable().defaultTo(0);
    table.integer('rate_limit_remaining').nullable();
    table.text('error_message').nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_jobs');
}
