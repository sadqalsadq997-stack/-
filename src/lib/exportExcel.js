import * as XLSX from 'xlsx';

// ── تصدير مصفوفة بيانات إلى ملف Excel حقيقي وقابل للتحميل ──
export function exportToExcel(rows, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, `${fileName || 'export'}.xlsx`);
}
