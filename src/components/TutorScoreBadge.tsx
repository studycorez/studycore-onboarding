interface Props {
  score: number;
  size?: 'sm' | 'md';
}

export function TutorScoreBadge({ score, size = 'sm' }: Props) {
  const color =
    score >= 80 ? 'bg-green-100 text-green-700'
    : score >= 60 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';
  return (
    <span
      className={`inline-flex items-center font-bold rounded-full ${color} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {score}
    </span>
  );
}
