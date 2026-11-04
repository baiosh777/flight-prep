# Flight Prep app – one-time set-up (about 10 minutes)

The app files hold **no flight data**. Flights are loaded from the Files app on your iPad and never uploaded anywhere.

## 1. Put the app online once (GitHub Pages, free)
1. Make a free account at https://github.com (any device).
2. Tap **+** (top right) → **New repository**. Name: `flightprep`. Visibility: **Public** (free Pages need public; the app files hold no company data). Tap **Create repository**.
3. On the new repository page tap **uploading an existing file**. Pick all 9 files from the unzipped `flightprep_app` folder:
   `index.html, app.css, app.js, fp_live.js, sw.js, manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png`
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

## Updates
When Claude sends new app files, upload them to the same repository (they replace the old ones). The next time the app is online it shows "A new version of Flight Prep is ready" → **Update now**. Your flights and entries stay.

## Good to know
- Each flight keeps its own take-off time, ticks, done calls and fuel entries, on this iPad only.
- If you delete the app from the home screen, iOS deletes its stored flights too – just load the files again.
- Preparation aid only – the OFP, official Emirates documentation and ATC prevail.
