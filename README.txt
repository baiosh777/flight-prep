This folder is written by the GitHub Action .github/workflows/wx.yml:

  wx.json      METAR + TAF of the airports in stations.txt (aviationweather.gov, no key needed)
  sigmet.json  international SIGMETs
  notam.json   NOTAMs, only if FAA_CLIENT_ID / FAA_CLIENT_SECRET are stored in the repository secrets

The app fetches these from its own address (no CORS problem) when you tap
"Refresh weather / NOTAMs" on the WX - NOTAM page. They never overwrite the OFP:
a newer report is shown as LIVE next to the OFP one.
