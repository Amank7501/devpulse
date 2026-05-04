import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('activity_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('repo_id').notNullable().references('id').inTable('repos').onDelete('CASCADE');
    table.text('github_event_id').notNullable().unique();
    table.string('event_type', 50).notNullable();
    table.string('actor_login', 100).notNullable();
    table.text('actor_avatar').nullable();
    table.jsonb('payload').notNullable();
    table.smallint('commit_count').nullable();
    table.string('pr_action', 20).nullable();
    table.boolean('pr_merged').nullable();
    table.float('pr_cycle_time_hours').nullable();
    table.string('branch', 255).nullable();
    table.timestamp('occurred_at', { useTz: true }).notNullable();
    table.timestamp('inserted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('activity_events');
}
