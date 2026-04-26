export const gameState = {
  teamId: "",
  teamName: "",
  teamColor: "",
  coinsBalance: 0,
};

export function setGameState(team: {
  teamId: string;
  teamName: string;
  teamColor: string;
  coinsBalance: number;
}) {
  gameState.teamId = team.teamId;
  gameState.teamName = team.teamName;
  gameState.teamColor = team.teamColor;
  gameState.coinsBalance = team.coinsBalance;
}
