/**
 * Server-only — never import from client components.
 * Generates a PDF job completion report using @react-pdf/renderer.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { WorkOrderWithRelations } from "@/types/work-order";
import type { Visit } from "@/types/visit";
import type { SignedPhoto } from "@/lib/storage/photos";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportData {
  workOrder: WorkOrderWithRelations;
  visit:     Visit | null;
  photos:    SignedPhoto[]; // max 6
  companyName: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const C = {
  brand:    "#0f7aff",
  brandDk:  "#0b62cc",
  text:     "#1e293b",
  muted:    "#64748b",
  light:    "#94a3b8",
  border:   "#e2e8f0",
  bg:       "#f8fafc",
  emerald:  "#059669",
  amber:    "#d97706",
  red:      "#dc2626",
  white:    "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily:      "Helvetica",
    fontSize:        10,
    color:           C.text,
    paddingTop:      40,
    paddingBottom:   50,
    paddingHorizontal: 44,
    backgroundColor: C.white,
  },

  // Header
  header: {
    flexDirection:   "row",
    justifyContent:  "space-between",
    alignItems:      "flex-start",
    marginBottom:    28,
    paddingBottom:   20,
    borderBottomWidth: 2,
    borderBottomColor: C.brand,
  },
  headerLeft: {
    flexDirection: "column",
  },
  companyName: {
    fontSize:    18,
    fontFamily:  "Helvetica-Bold",
    color:       C.brand,
    marginBottom: 2,
  },
  reportTitle: {
    fontSize:  11,
    color:     C.muted,
    fontFamily: "Helvetica",
  },
  headerRight: {
    flexDirection: "column",
    alignItems:    "flex-end",
  },
  woNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize:   14,
    color:      C.text,
  },
  headerMeta: {
    fontSize:   9,
    color:      C.muted,
    marginTop:  3,
  },

  // Section
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily:   "Helvetica-Bold",
    fontSize:     8,
    color:        C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom:  8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  // Two-column grid
  grid2: {
    flexDirection: "row",
    flexWrap:      "wrap",
  },
  gridCell: {
    width:        "50%",
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize:     8,
    color:        C.light,
    marginBottom: 2,
    fontFamily:   "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize:   10,
    color:      C.text,
    lineHeight: 1.4,
  },
  fieldValueMuted: {
    fontSize: 10,
    color:    C.muted,
  },

  // Description box
  descBox: {
    backgroundColor: C.bg,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    4,
    padding:         10,
    marginTop:       2,
  },
  descText: {
    fontSize:   10,
    color:      C.text,
    lineHeight: 1.6,
  },

  // Checklist
  checklistItem: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    marginBottom:   5,
    gap:            6,
  },
  checkIcon: {
    width:        14,
    height:       14,
    borderRadius: 7,
    alignItems:   "center",
    justifyContent: "center",
    marginTop:    0,
    flexShrink:   0,
  },
  checkIconDone: {
    backgroundColor: C.emerald,
  },
  checkIconPending: {
    backgroundColor: C.red,
  },
  checkIconText: {
    color:      C.white,
    fontSize:   8,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1,
  },
  checkLabel: {
    fontSize:   10,
    color:      C.text,
    flex:       1,
    lineHeight: 1.4,
  },
  checkLabelIncomplete: {
    fontSize: 10,
    color:    C.red,
    flex:     1,
    lineHeight: 1.4,
  },
  checkNotes: {
    fontSize:   9,
    color:      C.muted,
    marginLeft: 20,
    marginTop:  1,
    fontFamily: "Helvetica-Oblique",
  },

  // Notes box
  notesBox: {
    backgroundColor: C.bg,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
    padding:         10,
    borderRadius:    2,
  },
  notesText: {
    fontSize:   10,
    color:      C.text,
    lineHeight: 1.6,
  },

  // Photo grid
  photoGrid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           8,
  },
  photoCell: {
    width:  "30%",
    aspectRatio: 1,
  },
  photoImg: {
    width:        "100%",
    height:       110,
    objectFit:    "cover",
    borderRadius: 4,
    borderWidth:  1,
    borderColor:  C.border,
  },

  // Stats row
  statsRow: {
    flexDirection:   "row",
    gap:             12,
    backgroundColor: C.bg,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    6,
    padding:         12,
    marginBottom:    18,
  },
  statCell: {
    flex:       1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Helvetica-Bold",
    fontSize:   18,
    color:      C.text,
  },
  statValueGreen: {
    fontFamily: "Helvetica-Bold",
    fontSize:   18,
    color:      C.emerald,
  },
  statValueRed: {
    fontFamily: "Helvetica-Bold",
    fontSize:   18,
    color:      C.red,
  },
  statLabel: {
    fontSize:  8,
    color:     C.muted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width:           1,
    backgroundColor: C.border,
    marginVertical:  2,
  },

  // Footer
  footer: {
    position:  "absolute",
    bottom:    20,
    left:      44,
    right:     44,
    flexDirection:  "row",
    justifyContent: "space-between",
    alignItems:     "center",
    paddingTop:     8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerText: {
    fontSize: 8,
    color:    C.light,
  },
  footerBrand: {
    fontSize:   8,
    color:      C.brand,
    fontFamily: "Helvetica-Bold",
  },

  // Status badge
  badge: {
    borderRadius:  20,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf:     "flex-start",
  },
  badgeText: {
    fontSize:   9,
    fontFamily: "Helvetica-Bold",
  },
  badgeCompleted: {
    backgroundColor: "#d1fae5",
  },
  badgeCompletedText: {
    color: C.emerald,
  },
  badgeOther: {
    backgroundColor: C.bg,
  },
  badgeOtherText: {
    color: C.muted,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  weekly_pool_maintenance:    "Weekly Pool Maintenance",
  pool_repair:                "Pool Repair",
  pool_inspection_diagnostic: "Pool Inspection / Diagnostic",
  filter_cleaning:            "Filter Cleaning",
  heater_service:             "Heater Service",
  equipment_installation:     "Equipment Installation",
  pool_remodel:               "Pool Remodel",
  new_construction:           "New Construction",
  emergency_service:          "Emergency Service",
  other:                      "Other",
};

function fmtDate(s: string | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch {
    return s;
  }
}

function fmtDateShort(s: string | undefined): string {
  if (!s) return "—";
  try {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

function CompletionReportDocument({ data }: { data: ReportData }) {
  const { workOrder: wo, visit, photos, companyName } = data;
  const checklist = visit?.checklist ?? [];
  const completed  = checklist.filter((i) => i.completed).length;
  const total      = checklist.length;
  const photoSlice = photos.slice(0, 6);

  const statusLabel =
    wo.status === "completed" ? "Completed" :
    wo.status === "in_progress" ? "In Progress" :
    wo.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const isCompleted = wo.status === "completed";

  return (
    <Document
      title={`Job Completion Report — ${wo.wo_number}`}
      author={companyName}
      creator="ServiceOps"
    >
      <Page size="LETTER" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportTitle}>Job Completion Report</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.woNumber}>{wo.wo_number}</Text>
            <Text style={styles.headerMeta}>
              Generated {new Date().toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* ── Summary stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Status</Text>
            <View style={[
              styles.badge,
              isCompleted ? styles.badgeCompleted : styles.badgeOther,
              { marginTop: 4 }
            ]}>
              <Text style={[
                styles.badgeText,
                isCompleted ? styles.badgeCompletedText : styles.badgeOtherText,
              ]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={total === 0 ? styles.statValue : (completed === total ? styles.statValueGreen : styles.statValue)}>
              {total === 0 ? "—" : `${completed}/${total}`}
            </Text>
            <Text style={styles.statLabel}>Checklist</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{photoSlice.length}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{wo.priority.replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
            <Text style={styles.statLabel}>Priority</Text>
          </View>
        </View>

        {/* ── Job Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job Information</Text>
          <View style={styles.grid2}>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Work Order</Text>
              <Text style={styles.fieldValue}>{wo.wo_number}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Service Category</Text>
              <Text style={styles.fieldValue}>{CATEGORY_LABELS[wo.service_category] ?? wo.service_category}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Scheduled Date</Text>
              <Text style={wo.scheduled_date ? styles.fieldValue : styles.fieldValueMuted}>
                {wo.scheduled_date ? fmtDateShort(wo.scheduled_date) : "Not scheduled"}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Completed</Text>
              <Text style={wo.completed_at ? styles.fieldValue : styles.fieldValueMuted}>
                {wo.completed_at ? fmtDate(wo.completed_at) : "Not yet completed"}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Technician</Text>
              <Text style={wo.assigned_technician_name ? styles.fieldValue : styles.fieldValueMuted}>
                {wo.assigned_technician_name ?? "Unassigned"}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Customer</Text>
              <Text style={styles.fieldValue}>{wo.property_customer_name || "—"}</Text>
            </View>
          </View>

          {wo.description && (
            <View>
              <Text style={styles.fieldLabel}>Description</Text>
              <View style={styles.descBox}>
                <Text style={styles.descText}>{wo.description}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Property ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Location</Text>
          <View style={styles.grid2}>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Customer Name</Text>
              <Text style={wo.property_customer_name ? styles.fieldValue : styles.fieldValueMuted}>
                {wo.property_customer_name || "No property linked"}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>Address</Text>
              <Text style={wo.property_address ? styles.fieldValue : styles.fieldValueMuted}>
                {wo.property_address || "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Checklist ── */}
        {checklist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Service Checklist ({completed}/{total} completed)
            </Text>
            {checklist.map((item) => (
              <View key={item.id} style={styles.checklistItem}>
                <View style={[styles.checkIcon, item.completed ? styles.checkIconDone : styles.checkIconPending]}>
                  <Text style={styles.checkIconText}>{item.completed ? "+" : "-"}</Text>
                </View>
                <Text style={item.completed ? styles.checkLabel : styles.checkLabelIncomplete}>
                  {item.label}
                </Text>
              </View>
            ))}
            {checklist.some((i) => i.notes) && checklist.map((item) =>
              item.notes ? (
                <Text key={`note-${item.id}`} style={styles.checkNotes}>
                  Note ({item.label}): {item.notes}
                </Text>
              ) : null
            )}
          </View>
        )}

        {/* ── Technician Notes ── */}
        {visit?.technician_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technician Notes</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{visit.technician_notes}</Text>
            </View>
          </View>
        )}

        {/* ── Photos ── */}
        {photoSlice.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Job Photos ({photoSlice.length} of {photos.length})
            </Text>
            <View style={styles.photoGrid}>
              {photoSlice.map((photo, idx) => (
                <View key={idx} style={styles.photoCell}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image src={photo.signedUrl} style={styles.photoImg} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {wo.wo_number} · {wo.property_customer_name || "No property"}
          </Text>
          <Text style={styles.footerBrand}>Report generated by ServiceOps</Text>
        </View>

      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// generateCompletionReportPdf — public entry point
// ---------------------------------------------------------------------------

export async function generateCompletionReportPdf(data: ReportData): Promise<Buffer> {
  try {
    return await renderToBuffer(<CompletionReportDocument data={data} />);
  } catch (err) {
    if (data.photos.length > 0) {
      console.warn("[pdf] Initial render failed, retrying without photos:", err);
      return await renderToBuffer(<CompletionReportDocument data={{ ...data, photos: [] }} />);
    }
    throw err;
  }
}
