export function CardImage({ url, mode }: { url?: string | null; mode?: string }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      draggable={false}
      className={
        mode === 'background'
          ? 'pointer-events-none absolute -z-10 inset-0 w-full h-full object-cover opacity-20 rounded-lg'
          : 'pointer-events-none w-full h-32 object-cover rounded-md mb-3'
      }
    />
  );
}
