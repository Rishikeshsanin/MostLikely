select hub.assert_app_scope('most_likely', 'most_likely');

create index if not exists idx_most_likely_rooms_host_player
  on most_likely.rooms(host_player_id);

create index if not exists idx_most_likely_rooms_current_round
  on most_likely.rooms(current_round_id);

create index if not exists idx_most_likely_votes_voter
  on most_likely.votes(voter_id);

create index if not exists idx_most_likely_votes_target
  on most_likely.votes(target_player_id);
