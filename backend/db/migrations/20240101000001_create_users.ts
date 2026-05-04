import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.bigInteger('github_id').unique().notNullable();
    table.string('github_login', 39).notNullable();
    table.string('display_name', 255).nullable();
    table.text('avatar_url').nullable();
    table.string('email', 255).nullable();
    table.text('encrypted_access_token').notNullable();
    table.string('token_scope', 255).notNullable().defaultTo('repo read:user');
    table.boolean('token_valid').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
