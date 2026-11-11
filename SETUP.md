# Flight Prep app 3.7.0 (11 NOV 2026) – update and set-up

The app files hold **no flight data and no company data**. Flights and library files are loaded from the Files app on your iPad and are
never uploaded anywhere. **Never put a flight file or a library file in the GitHub repository – the repository is public.**

## Updating the app (you already have it online)
1. Unzip the app zip. All app files are in ONE folder – there are no sub-folders to keep.
2. In your repository on GitHub: **Add file → Upload files**, select **all** files of the folder, **Commit changes**. They replace the old ones.
3. Wait 1–2 minutes. Open the app with internet and tap **Update now** when it offers it (or close and reopen the app twice).
   **FLIGHTS** shows "Flight Prep 3.7.0".
4. Load the new `regs_library.json` once (FLIGHTS → Load …). It carries the DocuNet link list for the references.

Old files you can delete from the repository (no longer used): `wx.yml`, `wx_fetch.py`, `notam_fetch.py`, `stations.txt`, any old app zip.

## First set-up (a new repository)
1. Free account at https://github.com. You make the account yourself.
2. **+ → New repository**, name `flight-prep`, **Public**, **Create repository**.
3. **uploading an existing file** → select all files of the unzipped folder → **Commit changes**.
4. **Settings → Pages** → Source **Deploy from a branch**, Branch **main**, folder **/(root)** → **Save**.
5. After 1–2 minutes the page shows the address `https://YOUR-NAME.github.io/flight-prep/`.
6. iPad: open the address in **Safari** → **Share → Add to Home Screen**. Open it once with internet; after that it works offline.

## Loading a flight
- **Flight file from Claude** (`*_flight.json`): save it to the Files app, then **FLIGHTS → Load OFP (PDF), flight or library files**.
- **OFP alone**: the same button takes the OFP PDF and builds the flight in the app, offline, with the stored libraries.

## Library files (load once, used by every flight)
`apt_*.json` airport packs · `fir_library.json` FIR comms · `regs_library.json` country rules + DocuNet link list · `mel_library.json` MEL ·
`route_*.json` route packs. Select several at once; FLIGHTS lists what is stored.

## New in 3.7.0
- **Update weather** button (DASH and WX · NOTAM): with internet the app reads the TAF and METAR of every airfield of the flight itself
  (MET Norway and VATSIM), shows them as LIVE with time and source and keeps them on the iPad for that flight. The OFP weather is never
  overwritten. Nothing to set up in the repository.
- **DASH** shows the departure and the arrival airfield; all the others open with one button.
- **WX · NOTAM** in flight order: departure – key en-route airfields (the fewest 1-hour airfields that cover the route, and ETOPS) – arrival and
  alternates – all other airfields behind a button. The airfield name is next to every code, on the NOTAMs too.
- **WPTS**: every waypoint card is open, smaller type; a waypoint without its own frequencies repeats the list of its FIR.
- **DEP / ARR**: the Brief | CCI / AOI | AGC bar stays at the top while you scroll.
- **MAP**: the vertical profile fills its box in landscape; a clear line to the RETURN (green) and AHEAD (blue) airport; tap a box to go there.
- **NOW**: knows the date of the flight (no more "LANDED" before the flight); the CPDLC chip names the next log-on and its time; COMMS shows
  the frequencies of the waypoint you are on.
- **References**: a tap opens DocuNet at that section – the DocuNet app by default; hold the reference for the card with the captured text
  (the card lets you choose app / web / card).
- **OFP-only flights**: each alternate with its weather in one row; one ground chart, the other charts and the full Lido text behind a button.
- A flight file that already carries library content is no longer given it a second time.

Preparation aid only – the OFP, official Emirates documentation and ATC prevail.
