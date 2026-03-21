export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen bg-zinc-950 text-white overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
