import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // activity_events
  await knex.raw('CREATE INDEX idx_ae_repo_occurred ON activity_events (repo_id, occurred_at DESC)');
  await knex.raw('CREATE INDEX idx_ae_repo_actor ON activity_events (repo_id, actor_login, occurred_at DESC)');
  await knex.raw('CREATE INDEX idx_ae_type_occurred ON activity_events (event_type, occurred_at DESC)');
  await knex.raw('CREATE INDEX idx_ae_pr_merged ON activity_events (pr_merged, occurred_at DESC)');

  // user_repo_subscriptions
  await knex.raw('CREATE INDEX idx_urs_user_id ON user_repo_subscriptions (user_id)');
  await knex.raw('CREATE INDEX idx_urs_user_active ON user_repo_subscriptions (user_id, is_active)');

  // sync_jobs
  await knex.raw('CREATE INDEX idx_sj_user_status ON sync_jobs (user_id, status, created_at DESC)');

  // users
  await knex.raw('CREATE INDEX idx_users_github_id ON users (github_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_ae_repo_occurred');
  await knex.raw('DROP INDEX IF EXISTS idx_ae_repo_actor');
  await knex.raw('DROP INDEX IF EXISTS idx_ae_type_occurred');
  await knex.raw('DROP INDEX IF EXISTS idx_ae_pr_merged');
  await knex.raw('DROP INDEX IF EXISTS idx_urs_user_id');
  await knex.raw('DROP INDEX IF EXISTS idx_urs_user_active');
  await knex.raw('DROP INDEX IF EXISTS idx_sj_user_status');
  await knex.raw('DROP INDEX IF EXISTS idx_users_github_id');
}
