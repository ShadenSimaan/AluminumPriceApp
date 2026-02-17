REQUIRED for Hebrew text in PDF export:

  NotoSansHebrew-Regular.ttf   (required – without it, Hebrew will show as garbled characters)
  NotoSansHebrew-Bold.ttf     (optional)

Download:
  1. Go to https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew
  2. Click "Download family"
  3. Unzip and copy the .ttf files (e.g. from the "static" folder) into this folder: public/fonts/

The app looks for these files when exporting PDF. If they are missing, the PDF will use a default font and Hebrew will not display correctly.
