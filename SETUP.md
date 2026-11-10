# Flight Prep app – one-time set-up (about 10 minutes)

The app files hold **no flight data**. Flights are loaded from the Files app on your iPad and never uploaded anywhere.

## 1. Put the app online once (GitHub Pages, free)
1. Make a free account at https://github.com (any device).
2. Tap **+** (top right) → **New repository**. Name: `flightprep`. Visibility: **Public** (free Pages need public; the app files hold no company data). Tap **Create repository**.
3. On the new repository page tap **uploading an existing file**. Pick **all** files from the unzipped `flightprep_app` folder (40 in v3.2) – they are the app itself; SETUP.md is optional. Tap **Commit changes**.
4. **Settings** → **Pages** → Build and deployment: Source **Deploy from a branch**, Branch **main**, folder **/(root)** → **Save**.
5. Wait 1–2 minutes. The page shows your address: `https://YOUR-NAME.github.io/flightprep/`

## 2. Install it on the iPad
1. Open that address in **Safari**.
2. **Share** → **Add to Home Screen** → **Add**. The Flight Prep icon appears.
3. Open the app from the icon once while online. FLIGHTS shows: "works offline on this device".

## 3. Load a flight
1. **From the OFP (no Claude):** save the Lido OFP PDF to the Files app, then **FLIGHTS** → **Load OFP (PDF) or flight file** → pick the PDF. The app builds the flight itself, offline.
2. **With the full prep:** save the flight file Claude sends (e.g. `EK794_NBJ-DXB_flight.json`) and load it the same way – it adds the charts, CCI / AOI / CRAR, comms, MEL and the threat work.
3. Test: switch on airplane mode, close the app, open it again – it all still works.

## Update to v1.3 (05 NOV 2026)
1. Unzip `flightprep_app_v1.3.zip` in the Files app.
2. In your repository: **Add file** → **Upload files** → pick **all** files of the folder (the 6 new ones are `fp_tools.js, fp_tools2.js, fp_terrain.js` and the four `inter-….woff` fonts; the others replace the old ones) → **Commit changes**.
3. Wait 1–2 minutes, open the app while online → **Update now**. FLIGHTS shows "Flight Prep 1.3.0".
4. Load the new flight file `EK794_NBJ-DXB_flight.json` (FLIGHTS → Load flight file). Your T/O time and ticks for the flight stay.
5. Optional: Settings → **Self-test** – everything green (Location shows "prompt" until you allow it).

## Updates
When Claude sends new app files, upload them to the same repository (they replace the old ones). The next time the app is online it shows "A new version of Flight Prep is ready" → **Update now**. Your flights and entries stay.

## Good to know
- Each flight keeps its own take-off time, ticks, done calls and fuel entries, on this iPad only.
- If you delete the app from the home screen, iOS deletes its stored flights too – just load the files again.
- Preparation aid only – the OFP, official Emirates documentation and ATC prevail.

## Update to v2.0 (05 NOV 2026)
1. Unzip `flightprep_app_v2.0.zip` in the Files app.
2. In your repository: **Add file** → **Upload files** → pick **all 21** files of the folder (new: `fp_agc.js` and `fp_amap.js`; the others replace the old ones) → **Commit changes**.
3. Wait 1–2 minutes, open the app while online → **Update now**. FLIGHTS shows "Flight Prep 2.0.0".
4. Load the new flight file (e.g. `EK656_DXB-MLE_flight.json`). Older flight files still open, with the v1 layout.
5. New in 2.0:
   - **Compact header** on every page: NOW, phase, ELAPSED, ETA (UTC + local), running timers, UTC. The **take-off time is entered once on DASH** (tap ELAPSED to get there); no AIRBORNE button.
   - **Timers**: the fuel check lives in Timers (Start / Done · restart / Stop); every running timer shows with its countdown in the header.
   - **DASH**: registration and SELCAL, STD / ETA with runway and SID / STAR, short top threats with a button to the page with the details, **DIVERSION AIRPORTS** button.
   - **Diversion**: one short line per airport; tap it for runways (landing distance), ILS, frequencies, weather, key NOTAMs, a short AOI / CCI summary and OFP fuel.
   - **WAYPOINTS**: sector frequencies (North / South …) with the expected one first, CPDLC "LOGON … by …" highlighted, extra information behind the eye ("more").
   - **DEPARTURE and ARRIVAL** tabs: brief, CCI / AOI and AGC one under the other. **Interactive AGC** that follows the app theme (light / dark / night); at Malé also an own **vector airport map** (Map | Lido chart).
   - **MAP** tab full screen: side view, timeline and layer buttons fixed at the bottom, only the map moves.

## v3.6 (10 NOV 2026) – route packs, coverage list, the whole NOTAM bulletin

Upload **all** files of `flightprep_app_v3.6.0.zip` (the same file names and folders as 3.5 – nothing new to add). Open the app online → **Update now**.
FLIGHTS shows "Flight Prep 3.6.0". Then load the three small library files of `flightprep_libraries_v3.6_routes.zip` in one go:
`route_DXB-SIN.json`, `route_DXB-MLE.json` and the corrected `fir_library.json`.

- **Route packs** (new library kind): what is written once for a city pair – FIR procedures on that routing (FLAS, SLOP, estimates, the
  weather-deviation rule of each FIR, level and speed rules), VHF where a Lido text names one for the route, ASR lessons, and
  threat → mitigation → reference by phase. The app puts them on the FIR boundary rows of WAYPOINTS and at the top of TEM with
  **today's times from the OFP**. Stored: OMDB-WSSS, OMDB-VRMM, VRMM-OMDB. Every line names its Lido section.
- **Coverage on DASH** (fold-out under the flags): per flight which airports have a pack (kind, Lido revision, age), which FIRs have
  comms and a VHF frequency, whether the route is the one the route pack was written for (new waypoints / airways / FIRs are named),
  and what nothing covers. **Copy the list** puts the not-covered list on the clipboard – send that to Claude once.
- **The NOTAM bulletin is read completely.** Before, only the section "AREA ENROUTE DEPARTURE - DESTINATION" was read for area NOTAMs:
  the FIRs around the departure (Muscat, Emirates – GNSS interference, flow control), blocks named after a waypoint (TARDI), danger
  areas and the area around the destination were missing or shown under the last en-route airport. When a page break fell inside a
  section header, the destination NOTAMs were filed under the departure (EK348, EK656 of 01 NOV). On the 13 OFPs tested every NOTAM
  printed is now filed (for EK348: 252 of 252; area NOTAMs 10 → 62). If a count ever differs, a red banner says how many are missing.
- **Area NOTAMs sorted by rule**: blocks that are a FIR or a waypoint of your route first (GNSS and security NOTAMs open and on the
  FIR's waypoint row), the others folded away and labelled "not on your route".
- **By rule from the OFP**: diversion column = the two nearest airports of the OFP list with the distance (not a suitability check);
  step climbs / descents of PLND FL on their waypoint row; landing row with the destination frequencies; ETP row matched by name.
- **Corrections**: the route line is read whatever its label ("E/MTT/R :"); DASH no longer cuts the flag list at 10; the En route
  tab of the NOTAM tool shows the en-route airports too; "+ estimate" only where a FIR entry says so.
- **Mumbai FIR weather deviation**: the FIR library said 10 NM. The India CRAR publishes no difference, so the ICAO 5 NM applies
  (Lido GEN 1.4.2.17.4.2 / OM-C 12.4.2.2); 10 NM is the published difference of the Muscat, Male, Kuala Lumpur and Jakarta FIRs.

## v3.5.1 (10 NOV 2026) – fixes found with the first real long-haul OFP (EK348 DXB-SIN)

Upload `fp_ofp.js`, `fp_auto.js`, `fp_lib.js`, `fp_live.js`, `fp_globe.js`, `fp_tools.js`, `app.js`, `sw.js`, `SETUP.md` (or simply all files again).
- **The OFP reader no longer misses the navlog, fuel and weather** when one stray item on a page sits left of the text margin
  (EK348 built with one waypoint row and no fuel in 3.5). The left margin is now where most lines start.
- **If something is not read, the app says so**: no waypoints = the flight is not built and the message says why; a missing fuel block,
  weather section, flight number or alternates gives a red "Check this OFP by hand" banner on every page.
- **FIR boundaries now follow the flight-plan EET list**, not the place where the navlog prints the FIR line. On the 13 OFPs tested the old
  logic was up to 27 minutes late (Luanda on EK793) and missed boundaries the navlog did not print (Nairobi, Kinshasa). A FIR that is
  entered twice (Kuala Lumpur and Jakarta on DXB-SIN) is shown each time; a FIR with no waypoint of its own gets a "FIR boundary" row.
- **SIGMETs are sorted by rule**: only the FIRs on your route, with "VALID" when the SIGMET is valid while you are planned in that FIR
  (planned take-off + EET), "starts / ends n min after you leave" within an hour, and the others folded away.
- Daily airspace reservations (AUP, TSA / TRA) are no longer shown as "conflict" NOTAMs.

## v3.5 (10 NOV 2026) – airport packs with a written brief, 110 airports, 191 FIRs

1. Unzip `flightprep_app_v3.5.zip` and upload **all** files to the repository as before (same file names – nothing new to add,
   `app.js`, `fp_lib.js`, `fp_tools.js`, `fp_agc.js`, `app3.css`, `index.html`, `sw.js`, `data/stations.txt` and `SETUP.md` changed).
   Open the app online → **Update now**. FLIGHTS shows "Flight Prep 3.5.0".
2. **Library files stay in the Files app on the iPad – never in the repository.** Unzip the two library zips there.
3. FLIGHTS → **Load OFP (PDF), flight or library files** → you can now **select several files at once**; the app stores them
   one after the other and says how many it stored. Load all `apt_*.json` files and `fir_library.json`
   (`mel_library.json` and `regs_library.json` are unchanged – load them only if they are not on the iPad yet).
4. What is new in the packs for **SIN, KTI, STN, NBO, PEK**:
   - **Departure / Arrival / On the ground – brief**: written from the CCI, AOI and AFC, must-dos in bold, the Lido item next to every row;
   - **Runways and ILS** and **Frequencies** read off the AFC chart (tap a frequency to enlarge it);
   - **Low visibility – 777-300ER** and the **CCI page** as pictures of the Emirates pages (RETI colour boxes, tables as printed);
   - **Charts**: AGC, temporary-works charts, AFC, apron charts, taxi-route charts, minima – upright, pinch to zoom, dark in the dark themes;
   - **Lido items in full** underneath, so the brief can always be checked against the text.
5. **Alternates (44 airports)** have the Lido text, the runway table (runway, LDA, width), ILS idents, frequencies and the
   **AFC chart as a picture** – DIVERT → tap the airport → **AFC 2-10**.
6. **FIR comms**: 191 FIRs. 13 are written by hand (VHF sectors, notes); 178 are built by rule from the Lido RSI data link,
   SATCOM and HF tables – CPDLC log-on address and time before entry, HF by network, SATCOM short codes. They have **no VHF
   sector frequencies** (not in those tables). A log-on deadline appears on NOW only for FANS 1/A FIRs with a stated time.
7. The app now keeps **one record per airport**, so opening a flight reads only that flight's airports – the library can grow
   without slowing the app. Packs loaded with 3.3 / 3.4 are converted the first time 3.5 starts.

## v3.4 (10 NOV 2026) – paste an OFP

Besides picking the OFP PDF in Files, you can now **copy the OFP text** (from the PDF viewer, the briefing
mail, anywhere) and use **Paste OFP or flight** on the FLIGHTS page – or long-press the box below it and
paste. The app recognises a Lido OFP and builds the flight from it, exactly as it does from the PDF.
Pasted text loses the indentation of the PDF, so the NOTAM reader now accepts both.

## Update to v3.3 (10 NOV 2026) – libraries you load once, and live weather

### 1. The app files
1. Unzip `flightprep_app_v3.3.zip` and upload **all** files to the repository (keep the folders
   `.github/workflows/`, `tools/` and `data/` – GitHub keeps the structure if you upload the folders).
2. Open the app online → **Update now**. FLIGHTS shows "Flight Prep 3.3.0".

### 2. The libraries (load once, used by every flight after that)
In FLIGHTS → **Load OFP (PDF) or flight file**, pick each library file Claude sends:

| File | What it adds |
|---|---|
| `fir_library.json` | FIR comms: VHF in the order you use them, CPDLC log-on with its deadline on NOW, HF day / night, SELCAL, SATCOM, FIR notes |
| `apt_OMDB.json`, `apt_VRMM.json`, … | Airport packs: the CCI / AOI summary, the AGC with the vector airport map, runways, ILS, frequencies and the diversion card of that airport |
| `mel_library.json` | The B777 MEL (406 items) – pick today's item in Timers → MEL items and it appears on DASH, in TEM and on the rows |
| `regs_library.json` | Lido RM: 198 countries (CRAR) and 9 regions (RSI) for the REGS page |

They stay on the iPad. FLIGHTS lists what is stored. A flight the app builds from an OFP then shows the
comms column, the airport pages and the MEL – the pages say which pack they came from and from which date.
What stays in a Claude prep file: the threat → mitigation work and anything written for the day.

### 3. Live weather (and NOTAMs) while you still have internet
The app is a static page and aviationweather.gov sends no CORS header, so the app cannot call it directly.
A scheduled job in your own repository fetches it instead and writes the file next to the app:

1. The zip already contains `.github/workflows/wx.yml`, `tools/wx_fetch.py`, `tools/notam_fetch.py` and
   `data/stations.txt`. After uploading them, open the repository's **Actions** tab once and allow workflows.
2. It runs twice an hour and writes `data/wx.json` (METAR / TAF) and `data/sigmet.json`.
3. In the app: **WX · NOTAM → Refresh weather / NOTAMs**. A newer report is shown as **LIVE** with its time
   next to the OFP one; the OFP is never overwritten.
4. Flying somewhere new? Add the ICAO to `data/stations.txt` in the repository (one line).
5. NOTAMs are optional: register free at https://api.faa.gov (NOTAM API), then in the repository
   **Settings → Secrets and variables → Actions** add `FAA_CLIENT_ID` and `FAA_CLIENT_SECRET`. The job then
   also writes `data/notam.json` and the app marks NOTAMs that are not in the OFP as **NEW SINCE THE OFP**.
   The FAA database does not have company NOTAMs (CO…), Lido chart NOTAMs (CC / CA…) or every AIP supplement –
   it is a cross-check, not a replacement.

## Update to v3.2 (09 NOV 2026) – the app reads the OFP itself

1. Unzip `flightprep_app_v3.2.zip` in the Files app.
2. In your repository: **Add file** → **Upload files** → pick **all 40** files of the folder → **Commit changes**.
   New in this version: `fp_ofp.js`, `fp_auto.js`, `pdf.min.mjs`, `pdf.worker.min.mjs`, `basemap.json`, `aptdb.json`; the others replace the old ones.
   The two `.mjs` files and the two `.json` files are large (about 4 MB together) – upload them in the same commit, GitHub takes them.
3. Wait 1–2 minutes, open the app while online → **Update now**. FLIGHTS shows "Flight Prep 3.2.0".
4. **New: load an OFP.** FLIGHTS → **Load OFP (PDF) or flight file** → pick the **Lido OFP PDF** from Files. The app reads it on the iPad (2–5 seconds, no internet) and builds the flight itself:
   - DASH, DEPARTURE, WX · NOTAM, TEM, ARRIVAL, WAYPOINTS and the MAP, all from the OFP;
   - take-off time, revised times, ticks, timers, fuel check and the diversion helper work exactly as before;
   - every page says **auto-built from OFP x/y/z**.
5. What an auto-built flight does **not** have – it is not in the OFP: charts, AGC / airport maps, CCI / AOI / CRAR / RSI text, comms frequencies and CPDLC logon deadlines, MEL items, diversion notes, and the judgement part (threat → mitigation with references).
   For those, load the prep file Claude sends for the flight – it replaces the auto-built one (same flight, same ticks).
6. The two files it ships with: `aptdb.json` (open airport positions) and `basemap.json` (coastlines + the world's FIR boundaries, VAT-Spy open data). They are what lets the map and the FIR list work for any route, offline.

## Update to v3.0 (09 NOV 2026)
1. Unzip `flightprep_app_v3.0.zip` in the Files app.
2. In your repository: **Add file** → **Upload files** → pick **all 25** files of the folder (new: `app3.css`, `fp_wxnt.js`, `fp_refs.js`, `fp_regs.js`; the others replace the old ones) → **Commit changes**.
3. Wait 1–2 minutes, open the app while online → **Update now**. FLIGHTS shows "Flight Prep 3.0.0".
4. Load the new flight file (`EK657_MLE-DXB_flight.json`). Older flight files still open.
5. Optional: load the **regulations library** file Claude sends (Lido RM RSI + CRAR, about 6 MB) the same way – FLIGHTS → Load flight or library file. It stays on the iPad for every flight (REGS page).
6. New in 3.0:
   - **Two groups of pages**: PREPARATION (DASH, DEP, WX · NOTAM, TEM, ARR, REGS) and IN FLIGHT (NOW, WPTS, MAP, TIMERS, DIVERT). In landscape they are a rail on the left; in portrait two pill groups under the header. FLIGHTS: in the rail (landscape) or Settings → Flights (portrait).
   - **Faster**: the big pages are built when first opened, chart pictures load only for the theme in use, the globe is built after the first screen.
   - **WX · NOTAM page**: airfield tiles (weather at your time, active NOTAMs), TAF timelines, NOTAMs with NEW / SHORT / CRITICAL / IMPORTANT badges, filters, pin, read. The tiles are also on DASH.
   - **Document references** (CRAR, RSI, AOI, CCI, OM-A/C, FCOM, QRH, MEL, NOTAM ids) are dotted links → a card with document, chapter / page, the captured text and buttons to DocuNet / the MEL in the app.
   - **Time over a waypoint**: tap a row when you pass it or tap "time" and type the HHMM; all later times are revised (rev in the table, Z times on the map, ETA with a LATE / EARLY chip).
   - **MAP** labels show Z (UTC) times; the WAYPOINTS table keeps elapsed times.
