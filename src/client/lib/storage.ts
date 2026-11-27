const PARTICIPANT_PREFIX = 'gmtool:participant:';

export function participantTokenKey(roomId: string): string {
  return `${PARTICIPANT_PREFIX}${roomId}`;
}

export function getParticipantToken(roomId: string): string | null {
  return sessionStorage.getItem(participantTokenKey(roomId));
}

export function setParticipantToken(roomId: string, token: string): void {
  sessionStorage.setItem(participantTokenKey(roomId), token);
}

export function clearParticipantToken(roomId: string): void {
  sessionStorage.removeItem(participantTokenKey(roomId));
}
