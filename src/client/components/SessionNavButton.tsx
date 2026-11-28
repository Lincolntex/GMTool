import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

interface SessionNavButtonProps {
  label: string;
  icon: PhosphorIcon;
  active: boolean;
  side: 'left' | 'right';
  controlsId: string;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  onClick: () => void;
}

export function SessionNavButton({
  label,
  icon: Icon,
  active,
  side,
  controlsId,
  buttonRef,
  onClick,
}: SessionNavButtonProps) {
  return (
    <button
      ref={buttonRef}
      className={active ? 'session-nav-button active' : 'session-nav-button'}
      type="button"
      aria-label={label}
      aria-expanded={active}
      aria-controls={controlsId}
      data-side={side}
      data-tooltip={label}
      title={label}
      onClick={onClick}
    >
      <Icon weight="bold" size={22} aria-hidden="true" />
    </button>
  );
}
