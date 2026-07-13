import type { Metadata } from 'next'
import { ResetPasswordClient } from './ResetPasswordClient'

export const metadata: Metadata = { title: 'Reset Password — ServiceOps' }

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ResetPasswordClient token={token} />
}
