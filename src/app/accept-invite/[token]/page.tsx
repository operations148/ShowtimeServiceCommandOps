import type { Metadata } from 'next'
import { AcceptInviteClient } from './AcceptInviteClient'

export const metadata: Metadata = { title: 'Accept Invitation — ServiceOps' }

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <AcceptInviteClient token={token} />
}
