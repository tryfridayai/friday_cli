import useStore from '../../store/useStore';

export default function FridayLogo({ size = 24 }) {
  const theme = useStore((s) => s.theme);
  const isLight = theme === 'light';

  // Match the official SVG: two offset bars with animated opacity
  // Dark bg: left=#666, right=#fff | Light bg: left=#666, right=#0a0a0a
  const rightFill = isLight ? '#0a0a0a' : '#ffffff';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6.5" y="3" width="4" height="14" rx="2" fill="#666666">
        <animate
          attributeName="opacity"
          values="0.6;1;0.6"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="13.5" y="7" width="4" height="14" rx="2" fill={rightFill}>
        <animate
          attributeName="opacity"
          values="1;0.6;1"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </rect>
    </svg>
  );
}
