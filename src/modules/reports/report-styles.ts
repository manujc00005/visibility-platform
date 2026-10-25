import { SafeHtml } from "@/modules/reports/html-template";

/**
 * Inline stylesheet of the report. Static and trusted (no interpolated data), system fonts
 * only, no url(): the document must not need any network resource to render.
 */
export const REPORT_STYLES = new SafeHtml(`
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1f2328; font: 10.5pt/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; background: #fff; }
@media screen { body { max-width: 820px; margin: 32px auto; padding: 0 24px; } }
h1 { font-size: 24pt; margin: 4px 0 2px; line-height: 1.2; }
h2 { font-size: 14pt; margin: 28px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #1f2328; break-after: avoid; }
p { margin: 6px 0; }
ul, ol { margin: 6px 0; padding-left: 20px; }
.mono { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; word-break: break-all; }
.muted { color: #59636e; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #59636e; margin: 0; }
.cover { padding-bottom: 14px; border-bottom: 1px solid #d1d9e0; }
.domain { font-size: 11pt; margin: 0 0 10px; }
.meta, .grid { display: grid; grid-template-columns: max-content 1fr; gap: 3px 16px; margin: 8px 0; }
.meta dt, .grid dt { color: #59636e; }
.meta dd, .grid dd { margin: 0; }
.counts { display: flex; gap: 8px; margin-top: 10px; }
.pill { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 8.5pt; font-weight: 600; border: 1px solid; white-space: nowrap; }
.pill.critical { color: #a40e26; border-color: #f1a7b1; background: #ffebe9; }
.pill.warning { color: #7d4e00; border-color: #f2cc60; background: #fff8c5; }
.pill.info { color: #0550ae; border-color: #a6c8ff; background: #ddf4ff; }
.callout { padding: 8px 12px; border-radius: 6px; border-left: 4px solid; }
.callout.critical { background: #ffebe9; border-color: #cf222e; }
.callout.warning { background: #fff8c5; border-color: #bf8700; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.5pt; }
th, td { text-align: left; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid #d1d9e0; }
th { background: #f6f8fa; font-weight: 600; }
tr { break-inside: avoid; }
.status { font-weight: 600; }
.status.ok { color: #1a7f37; }
.status.unknown { color: #59636e; }
.status.review.critical { color: #a40e26; }
.status.review.warning { color: #7d4e00; }
.status.review.info { color: #0550ae; }
.recommendations { padding-left: 22px; }
.recommendation { margin: 0 0 12px; padding: 8px 10px; border: 1px solid #d1d9e0; border-radius: 6px; break-inside: avoid; }
.rec-title { font-weight: 600; }
.evidence-label { color: #59636e; font-size: 9pt; margin-bottom: 2px; }
.evidence { list-style: none; padding-left: 0; margin: 0; }
.evidence li { padding: 2px 6px; background: #f6f8fa; border-radius: 4px; margin: 2px 0; }
.log td { font-size: 8.5pt; }
.colophon { margin-top: 32px; padding-top: 8px; border-top: 1px solid #d1d9e0; color: #59636e; font-size: 8pt; }
`);
