import TierListEditor from "@/components/editor/TierListEditor";

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <TierListEditor roomId={roomId} />
    </main>
  );
}
