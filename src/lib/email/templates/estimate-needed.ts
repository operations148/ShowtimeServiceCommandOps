export interface EstimateEmailData {
  workOrderNumber: string
  workOrderTitle: string
  customerName: string
  propertyAddress: string
  serviceCategory: string
  technicianName: string
  technicianNotes: string
  poolEquipment?: {
    pump?: string
    filter?: string
    heater?: string
    sanitizer?: string
  }
  accessNotes?: string
  gateCode?: string
  contactEmail?: string
  contactPhone?: string
  estimateNotes: string
  workOrderUrl: string
  companyName: string
}

export function buildEstimateEmailHtml(data: EstimateEmailData): string {
  const hasEquipment =
    data.poolEquipment &&
    Object.values(data.poolEquipment).some((v) => v)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body{font-family:-apple-system,sans-serif;background:#F4F7FB;margin:0;padding:20px;color:#1E293B}
    .container{max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08)}
    .header{background:#0F172A;padding:24px 32px;display:flex;justify-content:space-between;align-items:center}
    .company{color:white;font-size:18px;font-weight:700}
    .wo-badge{background:#F59E0B;color:white;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;font-family:monospace}
    .alert-banner{background:#FFFBEB;border-left:4px solid #F59E0B;padding:16px 32px;display:flex;align-items:center;gap:12px}
    .alert-title{font-weight:700;color:#92400E;font-size:16px;margin:0}
    .alert-sub{color:#B45309;font-size:13px;margin:2px 0 0}
    .body{padding:28px 32px}
    .section{margin-bottom:24px}
    .section-label{font-family:monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#94A3B8;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #F1F5F9}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .info-item label{display:block;font-size:11px;color:#94A3B8;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em}
    .info-item value{display:block;font-size:14px;font-weight:600;color:#1E293B}
    .notes-box{background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-top:8px}
    .notes-label{font-size:11px;font-weight:700;color:#92400E;font-family:monospace;text-transform:uppercase;margin-bottom:6px}
    .notes-text{font-size:14px;color:#78350F;line-height:1.6;margin:0}
    .equipment-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .equipment-item{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:10px 12px}
    .equipment-item label{font-size:10px;color:#94A3B8;text-transform:uppercase;font-family:monospace}
    .equipment-item value{display:block;font-size:13px;font-weight:500;color:#1E293B;margin-top:2px}
    .access-box{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px}
    .access-box label{font-size:11px;font-weight:700;color:#991B1B;font-family:monospace;text-transform:uppercase}
    .access-box value{display:block;font-size:14px;font-weight:700;color:#DC2626;margin-top:4px;letter-spacing:0.05em}
    .cta-button{display:block;background:#06B6D4;color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:700;font-size:15px;margin:24px 0}
    .footer{background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center}
  </style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="company">${escHtml(data.companyName)}</div>
    <div class="wo-badge">${escHtml(data.workOrderNumber)}</div>
  </div>

  <div class="alert-banner">
    <div style="font-size:24px">&#9888;&#65039;</div>
    <div>
      <p class="alert-title">Estimate Required</p>
      <p class="alert-sub">Technician flagged this job — customer needs a quote</p>
    </div>
  </div>

  <div class="body">

    <div class="section">
      <div class="section-label">Job Summary</div>
      <div class="info-grid">
        <div class="info-item">
          <label>Work Order</label>
          <value>${escHtml(data.workOrderNumber)}</value>
        </div>
        <div class="info-item">
          <label>Service Type</label>
          <value>${escHtml(data.serviceCategory)}</value>
        </div>
        <div class="info-item">
          <label>Customer</label>
          <value>${escHtml(data.customerName)}</value>
        </div>
        <div class="info-item">
          <label>Technician</label>
          <value>${escHtml(data.technicianName)}</value>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Estimate Required — Tech Notes</div>
      <div class="notes-box">
        <div class="notes-label">&#9888; What needs to be quoted:</div>
        <p class="notes-text">${escHtml(data.estimateNotes || 'No specific notes added.')}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Property Details</div>
      <div class="info-grid">
        <div class="info-item">
          <label>Address</label>
          <value>${escHtml(data.propertyAddress)}</value>
        </div>
        <div class="info-item">
          <label>Customer Contact</label>
          <value>${escHtml(data.contactPhone || data.contactEmail || 'On file in GHL')}</value>
        </div>
      </div>
      ${data.gateCode ? `
      <div class="access-box" style="margin-top:12px">
        <label>&#128274; Gate / Access Code</label>
        <value>${escHtml(data.gateCode)}</value>
      </div>` : ''}
      ${data.accessNotes ? `
      <div style="margin-top:10px;padding:12px;background:#FFFBEB;border-radius:6px;border:1px solid #FDE68A">
        <div style="font-size:11px;color:#92400E;font-family:monospace;text-transform:uppercase;font-weight:700">Access Notes</div>
        <div style="font-size:13px;color:#78350F;margin-top:4px">${escHtml(data.accessNotes)}</div>
      </div>` : ''}
    </div>

    ${hasEquipment ? `
    <div class="section">
      <div class="section-label">Pool Equipment on File</div>
      <div class="equipment-grid">
        ${data.poolEquipment?.pump ? `<div class="equipment-item"><label>Pump</label><value>${escHtml(data.poolEquipment.pump)}</value></div>` : ''}
        ${data.poolEquipment?.filter ? `<div class="equipment-item"><label>Filter</label><value>${escHtml(data.poolEquipment.filter)}</value></div>` : ''}
        ${data.poolEquipment?.heater ? `<div class="equipment-item"><label>Heater</label><value>${escHtml(data.poolEquipment.heater)}</value></div>` : ''}
        ${data.poolEquipment?.sanitizer ? `<div class="equipment-item"><label>Sanitizer</label><value>${escHtml(data.poolEquipment.sanitizer)}</value></div>` : ''}
      </div>
    </div>` : ''}

    <a href="${data.workOrderUrl}" class="cta-button">View Full Work Order in ServiceOps &rarr;</a>

    <p style="font-size:12px;color:#94A3B8;text-align:center">
      Follow up with the customer through GoHighLevel.
      Once estimate is approved, update the work order status.
    </p>

  </div>

  <div class="footer">${escHtml(data.companyName)} &middot; Powered by ServiceOps Command Center</div>

</div>
</body>
</html>`
}

export function buildEstimateEmailText(data: EstimateEmailData): string {
  return [
    `ESTIMATE REQUIRED — ${data.workOrderNumber}`,
    data.companyName,
    '',
    `Job: ${data.workOrderTitle}`,
    `Customer: ${data.customerName}`,
    `Address: ${data.propertyAddress}`,
    `Technician: ${data.technicianName}`,
    `Service: ${data.serviceCategory}`,
    '',
    'WHAT NEEDS QUOTING:',
    data.estimateNotes || '(no notes)',
    '',
    data.gateCode ? `Gate Code: ${data.gateCode}` : '',
    data.accessNotes ? `Access Notes: ${data.accessNotes}` : '',
    '',
    `View work order: ${data.workOrderUrl}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim()
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
