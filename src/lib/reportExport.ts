/**
 * Generic report export helpers — Excel / CSV / PDF / Print.
 *
 * Every Reports table feeds a simple `{ columns, rows, title }` descriptor and
 * these helpers turn it into a downloadable file or a print job. Heavy deps
 * (xlsx, jspdf) are dynamically imported so they never bloat the initial
 * bundle. All exports operate on the ALREADY-FILTERED rows passed in.
 */

export interface ExportColumn {
  /** Key into each row object. */
  key: string
  /** Localised header label. */
  label: string
  /** Right-align numeric columns in PDF/print (optional). */
  numeric?: boolean
}

export interface ExportPayload {
  title: string
  columns: ExportColumn[]
  rows: Array<Record<string, string | number | null | undefined>>
  /** File name without extension. */
  filename: string
  /** Optional subtitle (e.g. the active date range). */
  subtitle?: string
  /** Sheet name for Excel. */
  sheetName?: string
  isRTL?: boolean
}

function toMatrix(p: ExportPayload): { header: string[]; body: (string | number)[][] } {
  const header = p.columns.map((c) => c.label)
  const body = p.rows.map((r) =>
    p.columns.map((c) => {
      const v = r[c.key]
      return v == null ? '' : (v as string | number)
    }),
  )
  return { header, body }
}

export async function exportExcel(p: ExportPayload): Promise<void> {
  const XLSX = await import('xlsx')
  const data = p.rows.map((r) => {
    const o: Record<string, unknown> = {}
    for (const c of p.columns) o[c.label] = r[c.key] ?? ''
    return o
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (p.sheetName || p.title).slice(0, 31))
  XLSX.writeFile(wb, `${p.filename}.xlsx`)
}

export async function exportCSV(p: ExportPayload): Promise<void> {
  const XLSX = await import('xlsx')
  const data = p.rows.map((r) => {
    const o: Record<string, unknown> = {}
    for (const c of p.columns) o[c.label] = r[c.key] ?? ''
    return o
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  // Prepend a BOM so Excel opens UTF-8 (accents / Arabic) correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportPDF(p: ExportPayload): Promise<void> {
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const { header, body } = toMatrix(p)
  const marginX = 30
  let y = 40

  doc.setFontSize(14)
  doc.text(p.title, marginX, y)
  y += 16
  if (p.subtitle) {
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(p.subtitle, marginX, y)
    doc.setTextColor(0)
    y += 16
  }
  y += 6

  const pageWidth = doc.internal.pageSize.getWidth()
  const usable = pageWidth - marginX * 2
  const colW = usable / header.length
  const colX = header.map((_, i) => marginX + i * colW)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  header.forEach((h, i) => doc.text(truncate(String(h), 22), colX[i], y))
  doc.setFont('helvetica', 'normal')
  y += 4
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 12

  const pageHeight = doc.internal.pageSize.getHeight()
  for (const row of body) {
    if (y > pageHeight - 30) {
      doc.addPage()
      y = 40
    }
    row.forEach((cell, i) => doc.text(truncate(String(cell), 26), colX[i], y))
    y += 14
  }
  doc.save(`${p.filename}.pdf`)
}

export function printReport(p: ExportPayload): void {
  const { header, body } = toMatrix(p)
  const dir = p.isRTL ? 'rtl' : 'ltr'
  const align = p.isRTL ? 'right' : 'left'
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row
          .map((c, i) => `<td style="text-align:${p.columns[i]?.numeric ? 'right' : align}">${escapeHtml(String(c))}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  const html = `<!doctype html><html dir="${dir}"><head>
    <meta charset="utf-8"/><title>${escapeHtml(p.title)}</title>
    <style>
      @page { size: landscape; margin: 12mm; }
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      p{font-size:12px;color:#666;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:${align}}
      th{background:#f5f5f5;font-weight:bold}
    </style></head><body>
    <h1>${escapeHtml(p.title)}</h1>
    ${p.subtitle ? `<p>${escapeHtml(p.subtitle)}</p>` : ''}
    <table>
      <thead><tr>${header.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const cleanup = () =>
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    cleanup()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  if (iframe.contentWindow) iframe.contentWindow.onafterprint = cleanup
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      cleanup()
    }
  }, 300)
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
