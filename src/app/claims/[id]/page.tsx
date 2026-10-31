import { Workspace } from '@/components/claim-app';

export const dynamic = 'force-dynamic';
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Workspace caseId={id} />; }
