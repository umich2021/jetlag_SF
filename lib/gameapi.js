import { supabase } from "./supabase";

// ── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * Captain login — finds team by name + plain text password match.
 * Returns { team } on success, { error } on failure.
 */
export async function captainLogin(teamName, password) {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("name", teamName)
    .eq("password", password)
    .single();

  if (error || !data) return { error: "Invalid team name or password" };
  return { team: data };
}

/**
 * Viewer login — no password, just returns all teams so viewer can pick one to watch.
 */
export async function getTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, color, coins_balance");
  if (error) return { error };
  return { teams: data };
}

// ── NEIGHBORHOODS ────────────────────────────────────────────────────────────

/**
 * Fetch all active neighborhoods with their controlling team's color.
 */
export async function getNeighborhoods() {
  const { data, error } = await supabase
    .from("neighborhoods")
    .select(
      `
      id,
      name,
      wkt,
      controlled_by_team_id,
      teams ( id, name, color )
    `,
    )
    .eq("is_active", true);

  if (error) return { error };
  return { neighborhoods: data };
}

/**
 * Get coin totals per team for a specific neighborhood.
 * Used to show the deposit leaderboard when a captain taps a neighborhood.
 */
export async function getNeighborhoodTotals(neighborhoodId) {
  const { data, error } = await supabase
    .from("neighborhood_totals") // the view we created
    .select(
      `
      team_id,
      total_coins,
      teams ( name, color )
    `,
    )
    .eq("neighborhood_id", neighborhoodId)
    .order("total_coins", { ascending: false });

  if (error) return { error };
  return { totals: data };
}

/**
 * Captain deposits coins into a neighborhood.
 * The DB trigger handles updating controlled_by_team_id automatically.
 * Returns { error } if team doesn't have enough coins.
 */
export async function depositCoins(teamId, neighborhoodId, amount) {
  // Check team has enough balance first
  const { data: team, error: balanceError } = await supabase
    .from("teams")
    .select("coins_balance")
    .eq("id", teamId)
    .single();

  if (balanceError) return { error: balanceError.message };
  if (team.coins_balance < amount) return { error: "Not enough coins" };

  // Insert the deposit — trigger recalculates control automatically
  const { error: depositError } = await supabase
    .from("neighborhood_deposits")
    .insert({
      neighborhood_id: neighborhoodId,
      team_id: teamId,
      coins_added: amount,
    });

  if (depositError) return { error: depositError.message };

  // Deduct from team balance
  const { error: deductError } = await supabase
    .from("teams")
    .update({ coins_balance: team.coins_balance - amount })
    .eq("id", teamId);

  if (deductError) return { error: deductError.message };

  return { success: true };
}

// ── CHALLENGES ───────────────────────────────────────────────────────────────

/**
 * Fetch the challenge released to this team (if any).
 * Includes the computed final_reward from the challenge_rewards view.
 */
export async function getTeamChallenge(teamId) {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id,
      title,
      description,
      coordinate_lat,
      coordinate_lng,
      is_completed,
      challenge_rewards ( base_reward, global_multiplier, failed_count, final_reward )
    `,
    )
    .eq("released_to_team_id", teamId)
    .eq("is_released", true)
    .eq("is_completed", false)
    .maybeSingle();

  if (error) return { error };
  return { challenge: data };
}

// ── USER LOCATIONS ───────────────────────────────────────────────────────────

/**
 * Upsert this captain's location. One row per team in user_locations.
 */
export async function updateCaptainLocation(teamId, latitude, longitude) {
  const { error } = await supabase
    .from("user_locations")
    .upsert(
      {
        team_id: teamId,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id" },
    );

  if (error) return { error };
  return { success: true };
}

/**
 * Fetch all captain locations (for rendering other players on the map).
 */
export async function getAllCaptainLocations() {
  const { data, error } = await supabase.from("user_locations").select(`
      team_id,
      latitude,
      longitude,
      updated_at,
      teams ( name, color )
    `);

  if (error) return { error };
  return { locations: data };
}

// ── REALTIME SUBSCRIPTIONS ───────────────────────────────────────────────────

/**
 * Subscribe to neighborhood control changes (polygon colors update live).
 * Returns the channel — call channel.unsubscribe() on cleanup.
 */
export function subscribeToNeighborhoods(onUpdate) {
  return supabase
    .channel("neighborhoods")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "neighborhoods" },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();
}

/**
 * Subscribe to all captain location updates (dots move on the map live).
 */
export function subscribeToCaptainLocations(onUpdate) {
  return supabase
    .channel("user_locations")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_locations" },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();
}

/**
 * Subscribe to challenge releases for a specific team.
 * Fires when admin sets is_released = true for this team.
 */
export function subscribeToChallenge(teamId, onRelease) {
  return supabase
    .channel(`challenge-${teamId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "challenges",
        filter: `released_to_team_id=eq.${teamId}`,
      },
      (payload) => {
        if (payload.new.is_released) onRelease(payload.new);
      },
    )
    .subscribe();
}

// ── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * Adjust a team's coin balance (add or subtract).
 */
export async function adminAdjustCoins(teamId, amount) {
  const { error } = await supabase.rpc("admin_adjust_coins", {
    p_team_id: teamId,
    p_amount: amount,
  });
  if (error) return { error };
  return { success: true };
}

/**
 * Approve a challenge completion — awards computed coins, marks done.
 */
export async function adminApproveChallenge(challengeId, teamId) {
  const { error } = await supabase.rpc("approve_challenge", {
    p_challenge_id: challengeId,
    p_team_id: teamId,
  });
  if (error) return { error };
  return { success: true };
}

/**
 * Mark a team as failed on a challenge (increases bonus for others).
 */
export async function adminFailChallenge(challengeId, teamId) {
  const { error } = await supabase.rpc("fail_challenge", {
    p_challenge_id: challengeId,
    p_team_id: teamId,
  });
  if (error) return { error };
  return { success: true };
}

/**
 * Release a challenge to a specific team.
 */
export async function adminReleaseChallenge(challengeId, teamId) {
  const { error } = await supabase
    .from("challenges")
    .update({ is_released: true, released_to_team_id: teamId })
    .eq("id", challengeId);
  if (error) return { error };
  return { success: true };
}

/**
 * Update the global coin multiplier.
 */
export async function adminSetMultiplier(multiplier) {
  const { error } = await supabase
    .from("game_settings")
    .update({
      global_coin_multiplier: multiplier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { error };
  return { success: true };
}

/**
 * Toggle a neighborhood's visibility on the map.
 */
export async function adminToggleNeighborhood(neighborhoodId, isActive) {
  const { error } = await supabase
    .from("neighborhoods")
    .update({ is_active: isActive })
    .eq("id", neighborhoodId);
  if (error) return { error };
  return { success: true };
}

/**
 * Create a new challenge.
 */
export async function adminCreateChallenge(
  title,
  description,
  baseReward,
  lat,
  lng,
) {
  const { error } = await supabase.from("challenges").insert({
    title,
    description,
    base_reward: baseReward,
    coordinate_lat: lat,
    coordinate_lng: lng,
  });
  if (error) return { error };
  return { success: true };
}

/**
 * Fetch all challenges with attempt counts (for admin overview).
 */
export async function adminGetChallenges() {
  const { data, error } = await supabase.from("challenge_rewards").select("*");
  if (error) return { error };
  return { challenges: data };
}

/**
 * Fetch all teams with balances (for admin overview).
 */
export async function adminGetTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, color, coins_balance")
    .order("coins_balance", { ascending: false });
  if (error) return { error };
  return { teams: data };
}
