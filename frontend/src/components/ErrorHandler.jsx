export default function ErrorHandler({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}
