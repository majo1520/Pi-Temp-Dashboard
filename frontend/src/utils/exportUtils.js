import * as XLSX from "xlsx";
import { formatExcelDate } from './chartUtils';

export function exportExcel(field, data) {
  const wb = XLSX.utils.book_new();
  const header = ["Date", ...data.map((d) => d.name)];
  const times = new Set();
  data.forEach((d) => d.data.forEach((p) => times.add(p.x)));
  const sortedTimes = Array.from(times).sort((a, b) => a - b);
  const rows = [header];
  sortedTimes.forEach((timestamp) => {
    const row = [formatExcelDate(timestamp)];
    data.forEach((d) => {
      const match = d.data.find((p) => p.x === timestamp);
      row.push(match ? (match.y === -1 ? "no data" : Number(match.y).toFixed(2)) : "no data");
    });
    rows.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((_, idx) => (idx === 0 ? { wch: 20 } : { wch: 15 }));
  XLSX.utils.book_append_sheet(wb, ws, field || "Sheet1");
  XLSX.writeFile(wb, `${field}_data.xlsx`);
}

export function exportCSV(field, data) {
  const BOM = "\uFEFF";
  const header = ["Date", ...data.map((d) => d.name)];
  const times = new Set();
  data.forEach((d) => d.data.forEach((p) => times.add(p.x)));
  const sortedTimes = Array.from(times).sort((a, b) => a - b);
  const rows = [header];
  sortedTimes.forEach((timestamp) => {
    const row = [formatExcelDate(timestamp)];
    data.forEach((d) => {
      const match = d.data.find((p) => p.x === timestamp);
      row.push(match ? Number(match.y).toFixed(2) : "no data");
    });
    rows.push(row);
  });
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${field}_data.csv`;
  link.click();
} 