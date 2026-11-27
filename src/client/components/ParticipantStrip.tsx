import { PLAYER_SHAPE_LABELS } from '../../shared/shapes';
import type { PublicRoom } from '../../shared/types';
import { ShapeIcon } from './ShapeIcon';

interface ParticipantStripProps {
  room: PublicRoom;
}

export function ParticipantStrip({ room }: ParticipantStripProps) {
  return (
    <div className="participant-strip" aria-label="Session participants">
      <span className="participant-chip" title={room.gmConnected ? 'GM online' : 'GM offline'}>
        <span className="participant-shape participant-shape-gm">
          <ShapeIcon shape="triangle-down" color="#cfd6df" />
        </span>
        <span className="participant-name">GM</span>
        <span className={room.gmConnected ? 'presence-dot online' : 'presence-dot offline'} />
      </span>

      {room.participants.map((participant) => (
        <span
          className="participant-chip"
          key={participant.id}
          title={`${participant.name} · ${
            PLAYER_SHAPE_LABELS[participant.shape ?? 'circle']
          } · ${participant.connected ? 'online' : 'offline'}`}
        >
          <span className="participant-shape">
            <ShapeIcon shape={participant.shape ?? 'circle'} color={participant.color} />
          </span>
          <span className="participant-name">{participant.name}</span>
          <span className={participant.connected ? 'presence-dot online' : 'presence-dot offline'} />
        </span>
      ))}
    </div>
  );
}
