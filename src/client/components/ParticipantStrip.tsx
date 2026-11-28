import { PLAYER_SHAPE_LABELS } from '../../shared/shapes';
import type { PublicParticipant, PublicRoom } from '../../shared/types';
import { ShapeIcon } from './ShapeIcon';

interface ParticipantStripProps {
  room: PublicRoom;
  onRemoveParticipant?: (participant: PublicParticipant) => void;
}

export function ParticipantStrip({ room, onRemoveParticipant }: ParticipantStripProps) {
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
          {onRemoveParticipant ? (
            <button
              className="participant-shape participant-remove"
              type="button"
              aria-label={`Remove ${participant.name} from the session`}
              title={`Remove ${participant.name} from the session`}
              onClick={() => onRemoveParticipant(participant)}
            >
              <ShapeIcon shape={participant.shape ?? 'circle'} color={participant.color} />
            </button>
          ) : (
            <span className="participant-shape">
              <ShapeIcon shape={participant.shape ?? 'circle'} color={participant.color} />
            </span>
          )}
          <span className="participant-name">{participant.name}</span>
          <span className={participant.connected ? 'presence-dot online' : 'presence-dot offline'} />
        </span>
      ))}
    </div>
  );
}
