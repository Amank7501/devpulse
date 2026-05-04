import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('repos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.bigInteger('github_repo_id').unique().notNullable();
    table.string('owner', 100).notNullable();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.boolean('is_private').notNullable().defaultTo(false);
    table.string('default_branch', 100).notNullable().defaultTo('main');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['owner', 'name']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('repos');
}
