PDF export uses Noto Sans Hebrew. For best display on iPhone/Android, use a local static TTF:

  Recommended: static/NotoSansHebrew-Regular.ttf from the Google Fonts zip
  → Copy that file to public/fonts/ and name it:  NotoSansHebrew-Regular.ttf

  Download: https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew (click "Download family")
  From the zip, use the static font:  static/NotoSansHebrew-Regular.ttf
  (Do not use the variable font for PDF – static is more reliable in pdf-lib and on mobile.)

Optional (only if you want signature in PDF):
  signature.png   – place in public/fonts/ for a signature image in the PDF footer

If no local TTF is found, the app falls back to CDN (WOFF2/WOFF). Subsetting is disabled
so embedded fonts render correctly on mobile.
