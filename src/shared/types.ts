export type Role = 'gm' | 'player';

export type PresetId = 'snow' | 'grass' | 'dungeon';

export type SceneBackground =
  | { type: 'upload'; url: string }
  | { type: 'preset'; preset: PresetId };

export interface GridSettings {
  cellsAcross: number;
  offsetX: number;
  offsetY: number;
  /** Background image aspect ratio used for server-side row bounds. */
  aspect?: number;
}

export interface SceneInfo {
  title: string;
  background: SceneBackground;
  grid: GridSettings | null;
}

export interface CampaignScene extends SceneInfo {
  id: string;
  tokens: TokenInfo[];
}

export type TokenKind = 'player' | 'enemy' | 'npc';

export type PlayerShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'hexagon'
  | 'star'
  | 'heart'
  | 'teardrop';

export type TokenShape = PlayerShape | 'triangle-up' | 'triangle-down';

export interface TokenCell {
  col: number;
  row: number;
}

export interface TokenInfo {
  id: string;
  kind: TokenKind;
  label: string;
  color: string;
  shape: TokenShape;
  ownerId: string | null;
  cell: TokenCell | null;
  hidden: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  scenes: CampaignScene[];
  createdAt: number;
  updatedAt: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  sceneCount: number;
  updatedAt: number;
}

export interface PublicParticipant {
  id: string;
  name: string;
  color: string;
  shape: PlayerShape;
  connected: boolean;
}

export interface SceneSummary {
  title: string;
  hasGrid: boolean;
}

export interface PublicRoom {
  id: string;
  title: string;
  scene: SceneInfo;
  sceneList: SceneSummary[];
  sceneCount: number;
  activeSceneIndex: number;
  gridVisible: boolean;
  tokens: TokenInfo[];
  participants: PublicParticipant[];
  gmConnected: boolean;
  createdAt: number;
}

export interface PointerInfo {
  participantId: string;
  name: string;
  color: string;
  shape: TokenShape;
  x: number;
  y: number;
}

export interface PingInfo extends PointerInfo {
  id: string;
}

export interface RoomState {
  room: PublicRoom;
  pointers: Record<string, PointerInfo>;
  participantId?: string;
}

export interface SocketAck {
  ok: boolean;
  error?: string;
  token?: TokenInfo;
}

export interface ParticipantsUpdate {
  participants: PublicParticipant[];
  gmConnected: boolean;
}

export interface RoomWithPin {
  room: PublicRoom;
  pin: string;
}
