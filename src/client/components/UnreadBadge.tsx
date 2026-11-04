export function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-400 px-1 text-xs font-semibold leading-none text-black"
    >
      {count}
    </span>
  );
}
