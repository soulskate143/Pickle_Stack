export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-zinc-950 text-white overflow-hidden flex flex-col z-50">
      {children}
    </div>
  );
}
