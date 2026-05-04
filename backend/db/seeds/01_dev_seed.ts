import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Clear in reverse FK dependency order
  await knex('user_repo_subscriptions').del();
  await knex('sync_jobs').del();
  await knex('activity_events').del();
  await knex('repos').del();
  await knex('users').del();

  const [user] = await knex('users')
    .insert({
      github_id: 12345,
      github_login: 'testuser',
      display_name: 'Test User',
      encrypted_access_token: 'test_token_encrypted',
      token_scope: 'repo read:user',
      token_valid: true,
    })
    .returning<{ id: string }[]>('id');

  const [reactRepo, nextRepo] = await knex('repos')
    .insert([
      {
        github_repo_id: 10270250,
        owner: 'facebook',
        name: 'react',
        description: 'The library for web and native user interfaces.',
        is_private: false,
        default_branch: 'main',
      },
      {
        github_repo_id: 67456,
        owner: 'vercel',
        name: 'next.js',
        description: 'The React Framework for the Web.',
        is_private: false,
        default_branch: 'canary',
      },
    ])
    .returning<{ id: string }[]>('id');

  await knex('user_repo_subscriptions').insert([
    { user_id: user.id, repo_id: reactRepo.id },
    { user_id: user.id, repo_id: nextRepo.id },
  ]);
}
