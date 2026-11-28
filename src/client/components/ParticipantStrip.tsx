import { PLAYER_SHAPE_LABELS } from '../../shared/shapes';
import type { PublicParticipant, PublicRoom, Role } from '../../shared/types';
import { ShapeIcon } from './ShapeIcon';

interface ParticipantStripProps {
  room: PublicRoom;
  role: Role;
  selfId?: string | null;
  onRemoveParticipant?: (participant: PublicParticipant) => void;
}

export function ParticipantStrip({
  room,
  role,
  selfId,
  onRemoveParticipant,
}: ParticipantStripProps) {
  const gmIsYou = role === 'gm';

  return (
    <div className="participant-strip" aria-label="Session participants">
      <span
        className={gmIsYou ? 'participant-chip is-you' : 'participant-chip'}
        title={`GM ${room.gmConnected ? 'online' : 'offline'}${gmIsYou ? ' (you)' : ''}`}
        aria-current={gmIsYou ? 'true' : undefined}
      >
        <span className="participant-shape participant-shape-gm">
          <ShapeIcon shape="triangle-down" color="#cfd6df" />
        </span>
        <span className="participant-name">GM</span>
        {gmIsYou ? <span className="sr-only"> (you)</span> : null}
        <span className={room.gmConnected ? 'presence-dot online' : 'presence-dot offline'} />
      </span>

      {room.participants.map((participant) => {
        const isYou = role === 'player' && participant.id === selfId;

        return (
          <span
            className={isYou ? 'participant-chip is-you' : 'participant-chip'}
            key={participant.id}
            title={`${participant.name} · ${
              PLAYER_SHAPE_LABELS[participant.shape ?? 'circle']
            } · ${participant.connected ? 'online' : 'offline'}${
              isYou ? ' (you)' : ''
            }`}
            aria-current={isYou ? 'true' : undefined}
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
            {isYou ? <span className="sr-only"> (you)</span> : null}
            <span
              className={
                participant.connected ? 'presence-dot online' : 'presence-dot offline'
              }
            />
          </span>
        );
      })}
    </div>
  );
}
