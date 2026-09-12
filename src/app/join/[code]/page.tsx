import { JoinDeepLink } from "@/components/join-deep-link";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinDeepLink code={code} />;
}
