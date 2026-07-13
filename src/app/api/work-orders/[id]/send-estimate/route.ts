import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission, getTenantId } from '@/lib/auth/api-auth'
import { supabaseAdmin } from '@/lib/db/supabase'
import { getResend } from '@/lib/email/resend'
import { buildEstimateEmailHtml, buildEstimateEmailText } from '@/lib/email/templates/estimate-needed'
import { checkRateLimit } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  recipientEmail: z.string().email('Invalid recipient email'),
  estimateNotes:  z.string().optional().default(''),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  // security-audit H4: this route previously used bare requireApiAuth() with
  // no permission or ownership check, letting any authenticated role
  // (including an unrelated TECHNICIAN) email an arbitrary attacker-supplied
  // address the work order's gate code, access notes, and customer address.
  const auth = await requirePermission('canSendEstimateEmail')
  if (!auth.ok) return auth.response

  const tenantId = getTenantId(auth.session)
  const { id } = await params

  // Rate limited — this is an email-sending primitive with no prior limit,
  // making it usable to spam an arbitrary target inbox.
  const limit = await checkRateLimit(`${tenantId}:${auth.session.user.id}`, 'adminAction')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { recipientEmail, estimateNotes } = parsed.data

  // ── Fetch work order ───────────────────────────────────────────────────────
  const { data: wo, error: woError } = await supabaseAdmin
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (woError || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  // ── Fetch related data in parallel ────────────────────────────────────────
  const [propertyRes, technicianRes, tenantRes, visitRes] = await Promise.all([
    wo.property_id
      ? supabaseAdmin.from('properties').select('*').eq('id', wo.property_id as string).single()
      : Promise.resolve({ data: null }),
    wo.assigned_technician_id
      ? supabaseAdmin.from('users').select('name, email').eq('id', wo.assigned_technician_id as string).single()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('tenants').select('name').eq('id', tenantId).single(),
    supabaseAdmin
      .from('visits')
      .select('technician_notes')
      .eq('work_order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const property   = propertyRes.data   as Record<string, unknown> | null
  const technician = technicianRes.data  as { name: string; email: string } | null
  const tenant     = tenantRes.data      as { name: string } | null
  const visit      = visitRes.data       as { technician_notes?: string } | null

  // ── Build work order number ────────────────────────────────────────────────
  const rawWoNum = wo.wo_number as number | null
  const woNumber = rawWoNum
    ? `WO-${String(rawWoNum).padStart(4, '0')}`
    : `WO-${id.slice(0, 6).toUpperCase()}`

  // ── Build property address ─────────────────────────────────────────────────
  const propertyAddress = property
    ? [
        property.address_line1,
        property.city,
        property.state,
        property.zip,
      ]
        .filter(Boolean)
        .join(', ')
    : 'Address not on file'

  // ── Format service category ────────────────────────────────────────────────
  const serviceCategory = String(wo.service_category ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  // ── Extract pool equipment from property ──────────────────────────────────
  const poolEquipmentRaw = property?.pool_equipment as Record<string, string> | null | undefined
  const poolEquipment = poolEquipmentRaw
    ? {
        pump:      poolEquipmentRaw.pump,
        filter:    poolEquipmentRaw.filter,
        heater:    poolEquipmentRaw.heater,
        sanitizer: poolEquipmentRaw.sanitizer,
      }
    : undefined

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://serviceops-ghl-workorders.vercel.app'

  const emailData = {
    workOrderNumber: woNumber,
    workOrderTitle:  String(wo.title ?? 'Work Order'),
    customerName:    String(
      (property?.customer_name as string | undefined) ||
      String(wo.title ?? '').replace(/^(Diagnosis|Approved Job) — /, '') ||
      'Customer'
    ),
    propertyAddress,
    serviceCategory:  serviceCategory || 'Pool Service',
    technicianName:   technician?.name ?? 'Field Technician',
    technicianNotes:  visit?.technician_notes ?? '',
    poolEquipment,
    accessNotes:  String(property?.access_notes ?? ''),
    gateCode:     String(property?.gate_code ?? ''),
    contactEmail: '',
    contactPhone: '',
    estimateNotes,
    workOrderUrl: `${appUrl}/dashboard/work-orders/${id}`,
    companyName:  tenant?.name ?? 'ServiceOps',
  }

  // ── Send via Resend ────────────────────────────────────────────────────────
  const { data: emailResult, error: emailError } = await getResend().emails.send({
    from:    process.env.RESEND_FROM_EMAIL ?? 'noreply@serviceops.app',
    to:      [recipientEmail],
    subject: `⚠️ Estimate Required — ${woNumber} — ${emailData.customerName}`,
    html:    buildEstimateEmailHtml(emailData),
    text:    buildEstimateEmailText(emailData),
  })

  if (emailError) {
    console.error('[send-estimate] Resend error:', emailError)
    return NextResponse.json(
      { error: 'Failed to send email', detail: String((emailError as { message?: string }).message ?? emailError) },
      { status: 500 }
    )
  }

  // ── Log to status history (non-fatal) ─────────────────────────────────────
  const changedByName = (auth.session.user as { name?: string }).name ?? 'Admin'
  const { error: histErr } = await supabaseAdmin
    .from('work_order_status_history')
    .insert({
      work_order_id:   id,
      tenant_id:       tenantId,
      previous_status: wo.status as string,
      new_status:      wo.status as string,
      changed_by_name: changedByName,
    })
  if (histErr) {
    console.warn('[send-estimate] History insert failed (non-fatal):', histErr.message)
  }

  return NextResponse.json({
    success: true,
    message: `Estimate notification sent to ${recipientEmail}`,
    emailId: emailResult?.id,
  })
}
