# Export Microsoft Group Members to CSV

Grab **every member** of a Microsoft 365 / Entra group from
`myaccount.microsoft.com/groups/...` and save them to a spreadsheet (CSV):
Name, UPN, Email, Type, even when there are thousands of them.

**Nothing to install. No terminal.** You paste one snippet into your browser
while you're signed in, and a CSV downloads.

---

## Why this exists

The members list is *virtualized*: the page only keeps about 6 rows in memory
at a time and swaps them out as you scroll, so there's no "export all" button
and no way to copy/paste the whole thing. This snippet scrolls the table from
top to bottom in your own already-signed-in browser, collects every row, and
saves it as a CSV. It's read-only and nothing leaves your computer.

---

## How to run it (Chrome or Edge)

1. **Sign in and open the group's Members tab.** You should see the table
   (Name / UPN / Email / Type) and a line like **"Showing N items total."**

   > **If the Members tab is blank**, you're signed into the wrong account.
   > The group only shows for someone in *that group's organization*. Switch to
   > the correct Microsoft account, reopen the group, and try again.

2. **Open the console.** Press **F12** (or right-click the page → *Inspect*),
   then click the **Console** tab.

3. **If you see a paste warning** ("Don't paste code you don't understand…"),
   click in the console, type **`allow pasting`**, and press Enter. One time only.

4. **Paste the snippet.** Open [`copy-members.js`](./copy-members.js), copy the
   **whole file**, paste it into the console, and press **Enter**.

5. **Wait.** A small dark box in the top-right shows progress
   (`Captured 1,200 / 5,000 …`). Keep the tab in front and don't scroll the
   table yourself. For a few thousand rows it takes a couple of minutes.

6. **Done.** A file like `group-members-5000-rows-2026-06-29.csv` lands in your
   **Downloads** folder. Open it in Excel or Google Sheets.

---

## Get the file

- Click **`copy-members.js`** above → the **Raw** button → select all → copy.
- Or use the green **Code → Download ZIP** button and open the file from there.

## If the count comes up short

If the box says you captured fewer rows than the total, just **run it again**:
paste the snippet a second time. Slow connections sometimes render a few rows
lazily; a second pass picks up stragglers. Each run produces its own CSV.

## What it does / doesn't do

- ✅ Reads only what's on the page and scrolls it. **Read-only.**
- ✅ Builds the CSV in your browser, saves it straight to your computer.
- ❌ Changes nothing in the group. Sends nothing anywhere. No data leaves your machine.
