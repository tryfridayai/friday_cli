import { motion } from 'framer-motion';

export default function FridayLogo({ size = 32, animate = true }) {
  const barWidth = size * 0.2;
  const gap = size * 0.15;
  const totalWidth = barWidth * 2 + gap;
  const offset = (size - totalWidth) / 2;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      initial={animate ? { opacity: 0, scale: 0.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <motion.rect
        x={offset}
        y={size * 0.15}
        width={barWidth}
        height={size * 0.7}
        rx={barWidth * 0.3}
        fill="var(--accent)"
        initial={animate ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: 'easeOut' }}
        style={{ transformOrigin: `${offset + barWidth / 2}px ${size * 0.5}px` }}
      />
      <motion.rect
        x={offset + barWidth + gap}
        y={size * 0.15}
        width={barWidth}
        height={size * 0.7}
        rx={barWidth * 0.3}
        fill="var(--accent)"
        initial={animate ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
        style={{ transformOrigin: `${offset + barWidth + gap + barWidth / 2}px ${size * 0.5}px` }}
      />
    </motion.svg>
  );
}
