/* ===========================================================================
 * Microsoft "My Groups" member exporter: paste-into-console tool
 * ---------------------------------------------------------------------------
 * Exports the ENTIRE members table of a Microsoft 365 / Entra group
 * (myaccount.microsoft.com/groups/<id> -> Members tab) to a CSV file,
 * even though the page only ever renders ~6 rows in the page at a time
 * (it's a "virtualized" list that re-uses the same handful of row elements
 * as you scroll, so there's no built-in "export all").
 *
 * HOW IT WORKS
 *   The page never loads all the rows at once, so you can't just read them
 *   in one shot. This scrolls the table down a little at a time and grabs
 *   whatever rows are on screen, keeping a de-duplicated running list (keyed on
 *   the row's UPN + Email), until it reaches the bottom. Then it builds a CSV
 *   and downloads it.
 *
 * HOW TO RUN  (no install, nothing to set up. see README.md for screenshots)
 *   1. Open the group's Members tab in Chrome or Edge, signed in normally.
 *      You should see the table (Name | UPN | Email | Type) and a line like
 *      "Showing N items total."
 *   2. Press F12 to open Developer Tools, click the "Console" tab.
 *   3. If the console warns about pasting code, type   allow pasting   and
 *      press Enter (one time only).
 *   4. Paste this ENTIRE file into the console and press Enter.
 *   5. A small progress box appears top-right. Leave the tab in front and don't
 *      touch the table. When it finishes, a .csv downloads to your Downloads
 *      folder. Done.
 *
 * It is READ-ONLY. It only reads what's on the page and scrolls. It changes
 * nothing in the group and sends nothing anywhere. The CSV is built in your
 * browser and saved straight to your computer.
 * ========================================================================= */

(async () => {
  'use strict';

  // --- tiny helpers --------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // --- 1. find the scroll container ---------------------------------------
  // The table body scrolls inside its own element (note the inner scrollbar),
  // not the whole window. Find the element that (a) actually scrolls and
  // (b) contains the most data rows. Fall back to the window if none found.
  function findScroller() {
    const rows = document.querySelectorAll('[role="row"]');
    const candidates = new Map(); // element -> how many rows it contains
    rows.forEach((row) => {
      let el = row.parentElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        const scrolls =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 40 &&
          el.clientHeight > 150;
        if (scrolls) {
          candidates.set(el, (candidates.get(el) || 0) + 1);
          break; // nearest scrolling ancestor wins for this row
        }
        el = el.parentElement;
      }
    });
    let best = null;
    let bestCount = 0;
    for (const [el, count] of candidates) {
      if (count > bestCount) { best = el; bestCount = count; }
    }
    return best; // null => we'll scroll the window instead
  }

  // --- 2. figure out the columns ------------------------------------------
  // Map each column position to its header name (Name / UPN / Email / Type) so
  // the CSV columns are right even if the order changes. Falls back to generic
  // Column 1..N if no header row is found.
  function getColumns() {
    const heads = [];
    document
      .querySelectorAll('[role="columnheader"]')
      .forEach((h) => heads.push(norm(h.textContent)));
    if (heads.length) return heads;
    const firstRow = document.querySelector('[role="row"]:has([role="gridcell"])');
    const n = firstRow
      ? firstRow.querySelectorAll('[role="gridcell"], [role="rowheader"]').length
      : 4;
    return Array.from({ length: n }, (_, i) => `Column ${i + 1}`);
  }

  // --- 3. read the rows currently rendered --------------------------------
  function readVisibleRows() {
    const out = [];
    document.querySelectorAll('[role="row"]').forEach((row) => {
      if (row.querySelector('[role="columnheader"]')) return; // skip header
      const cells = row.querySelectorAll('[role="gridcell"], [role="rowheader"]');
      if (!cells.length) return;
      const values = Array.from(cells).map((c) => norm(c.textContent));
      if (values.every((v) => v === '')) return; // ignore placeholder rows
      out.push(values);
    });
    return out;
  }

  // detect "Showing N items total" so we can show progress + a final check
  function detectTotal() {
    const m = norm(document.body.innerText).match(/Showing\s+([\d,]+)\s+items?\s+total/i);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  // --- 4. on-page progress badge ------------------------------------------
  const badge = document.createElement('div');
  badge.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
    'background:#1b1a19', 'color:#fff', 'font:600 13px/1.4 Segoe UI,system-ui,sans-serif',
    'padding:14px 16px', 'border-radius:10px', 'box-shadow:0 8px 28px rgba(0,0,0,.35)',
    'min-width:240px', 'max-width:320px',
  ].join(';');
  badge.innerHTML = '<div style="font-size:14px;margin-bottom:6px">Exporting members…</div>' +
    '<div id="__em_msg" style="font-weight:400;color:#d6d6d6">starting…</div>';
  document.body.appendChild(badge);
  const setMsg = (html) => {
    const el = document.getElementById('__em_msg');
    if (el) el.innerHTML = html;
  };

  // --- 5. main scroll + harvest loop --------------------------------------
  const scroller = findScroller();
  const columns = getColumns();
  const total = detectTotal();
  const seen = new Map(); // key -> values[]

  console.log('[member-export] scroller:', scroller || 'window',
    '| columns:', columns, '| expected total:', total);

  const getTop = () => (scroller ? scroller.scrollTop : window.scrollY);
  const getMax = () => (scroller
    ? scroller.scrollHeight - scroller.clientHeight
    : document.documentElement.scrollHeight - window.innerHeight);
  const stepBy = () => (scroller ? scroller.clientHeight : window.innerHeight) * 0.6; // overlap so no row is skipped
  const scrollDown = (px) => {
    if (scroller) scroller.scrollTop += px;
    else window.scrollBy(0, px);
  };
  const scrollTop0 = () => { if (scroller) scroller.scrollTop = 0; else window.scrollTo(0, 0); };

  const addRow = (values) => {
    const key = values.join(''); // UPN + Email are unique per member
    if (!seen.has(key)) seen.set(key, values);
  };

  scrollTop0(); // start from the very top so nothing above is missed
  await sleep(400);

  let stagnantPasses = 0;     // consecutive scrolls that added nothing new
  const MAX_STAGNANT = 8;     // bottom guard: stop after this many dry passes
  const HARD_CAP = 6000;      // absolute iteration cap (safety)
  let iterations = 0;
  let lastCount = 0;

  while (iterations < HARD_CAP) {
    iterations++;
    readVisibleRows().forEach(addRow);

    const atBottom = getTop() >= getMax() - 2;
    const added = seen.size - lastCount;
    lastCount = seen.size;

    const pct = total ? Math.min(100, Math.round((seen.size / total) * 100)) : null;
    setMsg(
      `Captured <b>${seen.size.toLocaleString()}</b>` +
      (total ? ` / ${total.toLocaleString()} (${pct}%)` : '') +
      `<br><span style="color:#9a9a9a">scrolling… please leave this tab open</span>`
    );

    if (added === 0 && atBottom) {
      if (++stagnantPasses >= MAX_STAGNANT) break;
    } else {
      stagnantPasses = 0;
    }

    scrollDown(stepBy());
    await sleep(220); // wait for the virtualized list to render the next batch
  }

  // one final sweep at the very bottom
  scrollDown(stepBy() * 4);
  await sleep(400);
  readVisibleRows().forEach(addRow);

  // --- 6. build + download the CSV ----------------------------------------
  const rows = [...seen.values()];
  const csvEscape = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map(csvEscape).join(',');
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const csv = '﻿' + header + '\r\n' + body; // BOM so Excel reads UTF-8

  const stamp = new Date().toISOString().slice(0, 10);
  const fname = `group-members-${rows.length}-rows-${stamp}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);

  const shortfall = total && rows.length < total ? total - rows.length : 0;
  setMsg(
    `<b style="color:#6bd16b">Done: ${rows.length.toLocaleString()} rows</b><br>` +
    `Saved <b>${fname}</b> to Downloads.` +
    (shortfall
      ? `<br><span style="color:#ffd27a">Got ${rows.length.toLocaleString()} of ${total.toLocaleString()}. ` +
        `Run it once more and the new file may pick up any stragglers.</span>`
      : '') +
    `<br><br><button id="__em_close" style="background:#fff;color:#1b1a19;border:0;border-radius:6px;` +
    `padding:6px 12px;font:600 12px Segoe UI,system-ui;cursor:pointer">Close</button>`
  );
  const closeBtn = document.getElementById('__em_close');
  if (closeBtn) closeBtn.onclick = () => badge.remove();

  console.log(`[member-export] DONE. ${rows.length} rows -> ${fname}`,
    total ? `(expected ${total})` : '');
  console.table(rows.slice(0, 5).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))));
})();
