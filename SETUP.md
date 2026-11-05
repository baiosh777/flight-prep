# Flight Prep app – one-time set-up (about 10 minutes)

The app files hold **no flight data**. Flights are loaded from the Files app on your iPad and never uploaded anywhere.

## 1. Put the app online once (GitHub Pages, free)
1. Make a free account at https://github.com (any device).
2. Tap **+** (top right) → **New repository**. Name: `flightprep`. Visibility: **Public** (free Pages need public; the app files hold no company data). Tap **Create repository**.
3. On the new repository page tap **uploading an existing file**. Pick all 21 files from the unzipped `flightprep_app` folder:
   `index.html, app.css, app.js, sw.js, d3geo.js, fp_terrain.js, fp_globe.js, fp_live.js, fp_tools.js, fp_tools2.js, fp_agc.js, fp_amap.js, fp_mount.js, manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png, inter-Regular.woff, inter-SemiBold.woff, inter-Bold.woff, inter-ExtraBold.woff`
   (SETUP.md is optional). Tap **Commit changes**.
4. **Settings** → **Pages** → Build and deployment: Source **Deploy from a branch**, Branch **main**, folder **/(root)** → **Save**.
5. Wait 1–2 minutes. The page shows your address: `https://YOUR-NAME.github.io/flightprep/`

## 2. Install it on the iPad
1. Open that address in **Safari**.
2. **Share** → **Add to Home Screen** → **Add**. The Flight Prep icon appears.
3. Open the app from the icon once while online. FLIGHTS shows: "works offline on this device".

## 3. Load a flight
1. Save the flight file Claude sends (e.g. `EK794_NBJ-DXB_flight.json`) to the Files app.
2. In the app: **FLIGHTS** → **Load flight file** → pick it. The flight opens on NOW.
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
