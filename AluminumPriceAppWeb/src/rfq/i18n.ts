import type {
  DimensionBasis,
  PanelOperation,
  Requirement,
  RfqCategory,
  RfqItem,
  RfqLanguage,
  RfqOpeningType,
  Side,
  Swing,
} from "./types";
import type { ItemIssueCode } from "./presets";
import { OPENING_TYPE_DEFS } from "./presets";

type Dict = {
  featureTitle: string;
  category: Record<RfqCategory, string>;
  openingType: Record<RfqOpeningType, string>;
  panelOp: Record<PanelOperation, string>;
  side: Record<Side, string>;
  swing: Record<Swing, string>;
  requirement: Record<Requirement, string>;
  basis: Record<DimensionBasis, string>;
  basisStatement: Record<DimensionBasis, string>;
  issue: Record<ItemIssueCode, string>;
  ui: Record<string, string>;
  imp: Record<string, string>;
  pdf: Record<string, string>;
};

const en: Dict = {
  featureTitle: "Supplier Request for Quotation",
  category: { window: "Window", door: "Door" },
  openingType: {
    fixed_window: "Fixed window",
    sliding_window: "Sliding window",
    casement_window: "Casement window",
    tilt_turn_window: "Tilt-and-turn window",
    top_hung_window: "Top-hung window",
    sliding_door: "Sliding door",
    hinged_door_single: "Single hinged door",
    hinged_door_double: "Double hinged door",
    custom: "Custom / other",
  },
  panelOp: {
    fixed: "Fixed",
    sliding: "Sliding",
    casement: "Casement (side-hung)",
    tilt_turn: "Tilt-and-turn",
    top_hung: "Top-hung",
    hinged: "Hinged leaf",
  },
  side: { left: "Left", right: "Right" },
  swing: { inward: "Opens inward", outward: "Opens outward" },
  requirement: { unspecified: "Not specified", required: "Required", not_required: "Not required" },
  basis: { frame: "Overall frame size", opening: "Building (wall) opening size" },
  basisStatement: {
    frame: "All width × height dimensions are OVERALL FRAME sizes. No installation allowances have been applied.",
    opening:
      "All width × height dimensions are BUILDING OPENING sizes (wall opening). No installation allowances have been applied — please state the frame sizes and clearances you propose.",
  },
  issue: {
    reference_required: "Item reference is required",
    reference_duplicate: "Item reference is used more than once",
    width_required: "Width is required",
    height_required: "Height is required",
    width_invalid: "Width must be a positive number",
    height_invalid: "Height must be a positive number",
    quantity_invalid: "Quantity must be a whole number of 1 or more",
    category_mismatch: "Opening type does not match the category",
    needs_operable_panel: "At least one panel must be operable for this type (otherwise use Fixed window)",
    custom_description_required: "Custom items need a description",
  },
  ui: {
    interfaceLanguage: "Interface language",
    pdfLanguage: "PDF language",
    savedRequests: "Saved supplier requests",
    noSavedRequests: "No saved supplier requests yet.",
    newRequest: "New supplier request",
    open: "Open",
    duplicate: "Duplicate",
    delete: "Delete",
    save: "Save",
    saved: "Saved",
    unsaved: "Unsaved changes",
    notSavedYet: "Not saved yet",
    exportPdf: "Export PDF",
    printPdf: "Print",
    openFolder: "Open PDF folder",
    close: "Close",
    cancel: "Cancel",
    edit: "Edit",
    moveUp: "Move up",
    moveDown: "Move down",
    emptyEditor: "Create a new supplier request or open a saved one.",
    projectInfo: "Project information",
    projectName: "Project name",
    projectReference: "Project reference",
    requestDate: "Request date",
    rfqNumber: "RFQ no.",
    numberOnSave: "Assigned on first save",
    ourCompany: "Our company / contact",
    supplier: "Supplier (optional)",
    deliveryDestination: "Delivery destination (optional)",
    generalSpecifications: "General specifications",
    generalNotes: "General notes",
    notesNotTranslated: "Your notes are exported exactly as written — they are not translated automatically.",
    name: "Name",
    contactPerson: "Contact person",
    phone: "Phone",
    email: "Email",
    address: "Address",
    saveAsDefault: "Use as default for new requests",
    dimensionBasis: "Dimensions describe",
    defaultUnit: "Default unit for new items",
    convertAllTo: "Show all items in",
    items: "Items",
    addItem: "Add item",
    importFile: "Import from Excel / CSV",
    noItems: "No items yet. Add an item manually or import a file.",
    designs: "Item designs",
    totalUnits: "Total units",
    reference: "Reference",
    category: "Category",
    openingType: "Opening type",
    preset: "Preset",
    width: "Width",
    height: "Height",
    unit: "Unit",
    quantity: "Quantity",
    location: "Room / location",
    configuration: "Configuration",
    panels: "Panels / leaves",
    panelN: "Panel {n}",
    leftmost: "left",
    rightmost: "right",
    operation: "Type",
    hingeSide: "Hinge side",
    slideDirection: "Slides toward",
    swing: "Opening direction",
    activeLeaf: "Active leaf (handle)",
    glass: "Glass",
    frameFinish: "Frame color / finish",
    insectScreen: "Insect screen",
    shutter: "Shutter",
    hardware: "Hardware",
    otherRequirements: "Other requirements",
    itemNotes: "Notes",
    customDescription: "Description (required for custom items)",
    referenceImage: "Reference image (optional)",
    uploadImage: "Choose image",
    removeImage: "Remove image",
    imageTooLarge: "Image could not be loaded (use PNG or JPEG under 8 MB).",
    viewedFromOutside: "Viewed from outside",
    schematicNote: "Schematic quotation drawing — not a manufacturing drawing. Panel divisions are indicative.",
    legend: "Opening symbols",
    legendFixed: "F = fixed (non-opening) panel",
    legendSliding: "Arrow = sliding panel, moves in arrow direction",
    legendHingedOut: "Solid triangle = opens outward (toward viewer); apex points to the hinge side",
    legendHingedIn: "Dashed triangle = opens inward (away from viewer); apex points to the hinge side",
    legendTilt: "Second triangle with apex at bottom = tilt (bottom-hinged) function",
    legendHinges: "Short bars on an edge = hinges",
    sideHint: "Left/right are always as viewed from outside.",
    itemEditorTitle: "Item",
    newItemTitle: "New item",
    saveItem: "Save item",
    addToRequest: "Add to request",
    fixIssues: "Please fix the highlighted fields.",
    unspecifiedHint: "Leave blank if not specified",
    confirmDeleteItem: "Delete item {ref}?",
    confirmDeleteRequest: "Delete supplier request \"{name}\"? This cannot be undone.",
    confirmDiscard: "The current request has unsaved changes. Discard them?",
    confirmTitle: "Please confirm",
    confirmOk: "Yes",
    requestSaved: "Supplier request saved",
    requestDuplicated: "Supplier request duplicated",
    requestDeleted: "Supplier request deleted",
    itemsImported: "{n} items imported",
    needItems: "Add at least one item before exporting.",
    needValidItems: "Some items have errors. Fix them before exporting.",
    pdfSaved: "PDF saved",
    pdfOpenedForPrint: "PDF opened for printing",
    untitled: "Untitled project",
    copySuffix: "(copy)",
    exportHint: "PDF language is independent of the interface language.",
    preview: "Preview",
    noPricing: "This document contains no prices — the supplier quotes separately.",
    itemsCount: "{n} designs · {u} units",
  },
  imp: {
    title: "Import items from Excel / CSV",
    stepFile: "1. Choose file",
    stepMapping: "2. Sheet, columns and unit",
    stepReview: "3. Review and confirm",
    chooseFile: "Choose .xlsx or .csv file",
    supported: "Supported: .xlsx (Excel) and .csv. Max {mb} MB and {rows} rows. Formulas and macros are never executed; for formula cells the last saved value is used. PDF/image files are not supported.",
    templates: "Templates",
    downloadXlsx: "Download Excel template",
    downloadCsv: "Download CSV template",
    requiredColumns: "Required columns: category, opening type, width, height, quantity. Reference is generated when missing.",
    acceptedTypes: "Accepted opening-type values",
    acceptedCategories: "Accepted category values: window / חלון, door / דלת",
    sidesHelp: "Hinge side: left / right (viewed from outside). Opening direction: inward / outward. Fixed panels: panel numbers counted from the left, e.g. \"1\" or \"1,3\".",
    sheet: "Worksheet",
    headerRow: "Header row",
    columnMapping: "Column mapping",
    fieldCol: "Field",
    fileColumn: "File column",
    notMapped: "— not mapped —",
    required: "required",
    unitQuestion: "Unit of width/height in this file",
    unitChoose: "— choose unit —",
    unitFromFile: "Detected from the file headers: {unit}",
    unitRequired: "The file does not state its unit. Choose mm or cm explicitly.",
    unitColumnNote: "A unit column overrides this for its rows.",
    mode: "When importing",
    modeAppend: "Append to existing items (default)",
    modeReplace: "Replace all existing items",
    next: "Next",
    back: "Back",
    include: "Include",
    row: "Row",
    status: "Status",
    ok: "OK",
    error: "Error",
    excluded: "Excluded",
    blankRowsIgnored: "{n} blank rows were ignored.",
    summary: "{valid} valid · {invalid} with errors · {excluded} excluded",
    confirmImport: "Import {n} items",
    confirmReplace: "This will REPLACE the {existing} existing items with {n} imported items. Continue?",
    nothingToImport: "No valid included rows to import.",
    invalidIncluded: "Rows with errors are still included. Fix or exclude them first.",
    autoRef: "auto",
    unknownValue: "Unknown value \"{v}\"",
    invalidNumber: "\"{v}\" is not a valid number",
    notInteger: "Quantity \"{v}\" must be a whole number",
    unitConflict: "Value says \"{v}\" but the unit is {unit}",
    unknownUnit: "Unknown unit \"{v}\"",
    duplicateInFile: "Reference {v} appears more than once in the file",
    duplicateExisting: "Reference {v} already exists in this request",
    missing: "{field} is missing",
    fixedPanelsInvalid: "Fixed panels \"{v}\" — use panel numbers like 1,3",
    panelsInvalid: "Panels \"{v}\" — allowed {min}–{max} for this type",
    notApplicable: "{field} does not apply to this opening type — value ignored",
    defaulted: "{field} not given — preset default used; check it in the item editor",
    extraCells: "Row has {n} more value(s) than there are columns — check for unquoted commas (e.g. 1,200)",
    implausibleSize: "Unusual size \"{v}\" {unit} — please check the unit",
    swingNotAllowed: "\"{v}\" is not possible for this opening type",
    formulaNote: "{n} formula cells: their saved values were used (formulas were not executed).",
    tooLarge: "File is too large (max {mb} MB).",
    tooManyRows: "Too many rows (max {rows}).",
    unsupported: "Unsupported file type. Use .xlsx or .csv.",
    readFailed: "The file could not be read: {msg}",
    noRows: "No data rows were found.",
    encodingNote: "Text encoding: {enc}",
    cancelNote: "Cancel leaves the request unchanged.",
    editHint: "Cells are editable. Changes apply only to this import.",
  },
  pdf: {
    title: "REQUEST FOR QUOTATION",
    rfqNo: "RFQ No.",
    date: "Date",
    project: "Project",
    projectRef: "Project ref.",
    from: "From",
    to: "To (supplier)",
    delivery: "Delivery destination",
    dimensions: "Dimensions",
    summary: "Summary",
    designs: "Different item designs",
    units: "Total units (all quantities)",
    requestHeading: "Please return with your quotation",
    req1: "Itemized unit price and line total for each item reference",
    req2: "Complete project price, with currency",
    req3: "Proposed profile system / series, glass and hardware for each item",
    req4: "Production lead time and estimated delivery date",
    req5: "Delivery terms (Incoterms, packing) and payment terms",
    req6: "Any deviations from or questions about this specification",
    schedule: "Item schedule",
    colRef: "Ref.",
    colType: "Type",
    colLocation: "Location",
    colSize: "W × H",
    colQty: "Qty",
    colConfig: "Configuration",
    details: "Item details",
    continued: "continued",
    page: "Page {p} of {n}",
    generalSpecs: "General specifications",
    generalNotes: "General notes",
    legend: "Opening symbols (all drawings viewed from outside)",
    schematic: "Schematic quotation drawings — not manufacturing drawings. No fabrication dimensions, glass deductions, profile sections or engineering suitability are implied.",
    customPlaceholder: "Custom item — see description",
    referenceImage: "Reference image supplied by customer",
  },
};

const he: Dict = {
  featureTitle: "בקשה להצעת מחיר מספק",
  category: { window: "חלון", door: "דלת" },
  openingType: {
    fixed_window: "חלון קבוע",
    sliding_window: "חלון הזזה",
    casement_window: "חלון פתיחה (ציר צד)",
    tilt_turn_window: "חלון דרי-קיפ (פתיחה + נטייה)",
    top_hung_window: "חלון ציר עליון",
    sliding_door: "דלת הזזה",
    hinged_door_single: "דלת ציר – כנף אחת",
    hinged_door_double: "דלת ציר – שתי כנפיים",
    custom: "מותאם אישית / אחר",
  },
  panelOp: {
    fixed: "קבוע",
    sliding: "הזזה",
    casement: "פתיחה (ציר צד)",
    tilt_turn: "דרי-קיפ",
    top_hung: "ציר עליון",
    hinged: "כנף ציר",
  },
  side: { left: "שמאל", right: "ימין" },
  swing: { inward: "נפתח פנימה", outward: "נפתח החוצה" },
  requirement: { unspecified: "לא צוין", required: "נדרש", not_required: "לא נדרש" },
  basis: { frame: "מידת מסגרת כוללת", opening: "מידת פתח בקיר" },
  basisStatement: {
    frame: "כל מידות הרוחב × גובה הן מידות מסגרת כוללות. לא הופחתו מרווחי התקנה.",
    opening:
      "כל מידות הרוחב × גובה הן מידות הפתח בקיר. לא הופחתו מרווחי התקנה — נא לציין את מידות המסגרת והמרווחים המוצעים.",
  },
  issue: {
    reference_required: "חובה להזין מזהה פריט",
    reference_duplicate: "מזהה הפריט מופיע יותר מפעם אחת",
    width_required: "חובה להזין רוחב",
    height_required: "חובה להזין גובה",
    width_invalid: "הרוחב חייב להיות מספר חיובי",
    height_invalid: "הגובה חייב להיות מספר חיובי",
    quantity_invalid: "הכמות חייבת להיות מספר שלם, 1 ומעלה",
    category_mismatch: "סוג הפתיחה אינו מתאים לקטגוריה",
    needs_operable_panel: "בסוג זה לפחות חלק אחד צריך להיפתח (אחרת בחר/י חלון קבוע)",
    custom_description_required: "בפריט מותאם אישית חובה להזין תיאור",
  },
  ui: {
    interfaceLanguage: "שפת ממשק",
    pdfLanguage: "שפת PDF",
    savedRequests: "בקשות שמורות לספקים",
    noSavedRequests: "אין עדיין בקשות שמורות.",
    newRequest: "בקשה חדשה לספק",
    open: "פתיחה",
    duplicate: "שכפול",
    delete: "מחיקה",
    save: "שמירה",
    saved: "נשמר",
    unsaved: "יש שינויים שלא נשמרו",
    notSavedYet: "טרם נשמר",
    exportPdf: "ייצוא PDF",
    printPdf: "הדפסה",
    openFolder: "פתיחת תיקיית PDF",
    close: "סגירה",
    cancel: "ביטול",
    edit: "עריכה",
    moveUp: "הזזה למעלה",
    moveDown: "הזזה למטה",
    emptyEditor: "צור/י בקשה חדשה או פתח/י בקשה שמורה.",
    projectInfo: "פרטי הפרויקט",
    projectName: "שם הפרויקט",
    projectReference: "מספר / סימוכין פרויקט",
    requestDate: "תאריך הבקשה",
    rfqNumber: "מס׳ בקשה",
    numberOnSave: "יוקצה בשמירה הראשונה",
    ourCompany: "החברה שלנו / איש קשר",
    supplier: "ספק (אופציונלי)",
    deliveryDestination: "יעד אספקה (אופציונלי)",
    generalSpecifications: "מפרט כללי",
    generalNotes: "הערות כלליות",
    notesNotTranslated: "ההערות שלך מיוצאות בדיוק כפי שנכתבו — הן אינן מתורגמות אוטומטית.",
    name: "שם",
    contactPerson: "איש קשר",
    phone: "טלפון",
    email: "אימייל",
    address: "כתובת",
    saveAsDefault: "שמירה כברירת מחדל לבקשות חדשות",
    dimensionBasis: "המידות מתייחסות ל",
    defaultUnit: "יחידה לפריטים חדשים",
    convertAllTo: "הצגת כל הפריטים ב",
    items: "פריטים",
    addItem: "הוספת פריט",
    importFile: "ייבוא מ-Excel / CSV",
    noItems: "אין עדיין פריטים. הוסף/י פריט ידנית או ייבא/י קובץ.",
    designs: "סוגי פריטים",
    totalUnits: "סה״כ יחידות",
    reference: "מזהה",
    category: "קטגוריה",
    openingType: "סוג פתיחה",
    preset: "תבנית",
    width: "רוחב",
    height: "גובה",
    unit: "יחידה",
    quantity: "כמות",
    location: "חדר / מיקום",
    configuration: "תצורה",
    panels: "חלקים / כנפות",
    panelN: "חלק {n}",
    leftmost: "שמאלי",
    rightmost: "ימני",
    operation: "סוג",
    hingeSide: "צד הצירים",
    slideDirection: "נע לכיוון",
    swing: "כיוון פתיחה",
    activeLeaf: "כנף פעילה (ידית)",
    glass: "זכוכית",
    frameFinish: "צבע / גימור מסגרת",
    insectScreen: "רשת נגד חרקים",
    shutter: "תריס",
    hardware: "פרזול",
    otherRequirements: "דרישות נוספות",
    itemNotes: "הערות",
    customDescription: "תיאור (חובה בפריט מותאם אישית)",
    referenceImage: "תמונת ייחוס (אופציונלי)",
    uploadImage: "בחירת תמונה",
    removeImage: "הסרת תמונה",
    imageTooLarge: "לא ניתן לטעון את התמונה (PNG או JPEG עד 8MB).",
    viewedFromOutside: "מבט מבחוץ",
    schematicNote: "שרטוט סכמטי להצעת מחיר — אינו שרטוט ייצור. חלוקת החלקים להמחשה בלבד.",
    legend: "סמלי פתיחה",
    legendFixed: "F = חלק קבוע (לא נפתח)",
    legendSliding: "חץ = חלק הזזה, נע בכיוון החץ",
    legendHingedOut: "משולש רציף = נפתח החוצה (לכיוון הצופה); קודקוד המשולש מצביע על צד הצירים",
    legendHingedIn: "משולש מקווקו = נפתח פנימה (הרחק מהצופה); קודקוד המשולש מצביע על צד הצירים",
    legendTilt: "משולש נוסף שקודקודו למטה = פתיחת נטייה (קיפ)",
    legendHinges: "פסים קצרים על צלע = צירים",
    sideHint: "ימין/שמאל תמיד במבט מבחוץ.",
    itemEditorTitle: "פריט",
    newItemTitle: "פריט חדש",
    saveItem: "שמירת פריט",
    addToRequest: "הוספה לבקשה",
    fixIssues: "נא לתקן את השדות המסומנים.",
    unspecifiedHint: "השאר/י ריק אם לא צוין",
    confirmDeleteItem: "למחוק את פריט {ref}?",
    confirmDeleteRequest: "למחוק את הבקשה \"{name}\"? לא ניתן לבטל פעולה זו.",
    confirmDiscard: "בבקשה הנוכחית יש שינויים שלא נשמרו. לבטל אותם?",
    confirmTitle: "אישור",
    confirmOk: "כן",
    requestSaved: "הבקשה נשמרה",
    requestDuplicated: "הבקשה שוכפלה",
    requestDeleted: "הבקשה נמחקה",
    itemsImported: "יובאו {n} פריטים",
    needItems: "יש להוסיף לפחות פריט אחד לפני ייצוא.",
    needValidItems: "בחלק מהפריטים יש שגיאות. יש לתקן לפני ייצוא.",
    pdfSaved: "ה-PDF נשמר",
    pdfOpenedForPrint: "ה-PDF נפתח להדפסה",
    untitled: "פרויקט ללא שם",
    copySuffix: "(עותק)",
    exportHint: "שפת ה-PDF אינה תלויה בשפת הממשק.",
    preview: "תצוגה מקדימה",
    noPricing: "מסמך זה אינו כולל מחירים — הספק מגיש הצעה בנפרד.",
    itemsCount: "{n} סוגים · {u} יחידות",
  },
  imp: {
    title: "ייבוא פריטים מ-Excel / CSV",
    stepFile: "1. בחירת קובץ",
    stepMapping: "2. גיליון, עמודות ויחידה",
    stepReview: "3. בדיקה ואישור",
    chooseFile: "בחירת קובץ ‎.xlsx או ‎.csv",
    supported: "נתמכים: ‎.xlsx (Excel) ו-‎.csv. עד {mb}MB ועד {rows} שורות. נוסחאות ומאקרו לעולם אינם מורצים; בתאי נוסחה נלקח הערך השמור האחרון. קובצי PDF/תמונה אינם נתמכים.",
    templates: "תבניות",
    downloadXlsx: "הורדת תבנית Excel",
    downloadCsv: "הורדת תבנית CSV",
    requiredColumns: "עמודות חובה: קטגוריה, סוג פתיחה, רוחב, גובה, כמות. מזהה ייווצר אוטומטית אם חסר.",
    acceptedTypes: "ערכים מותרים לסוג פתיחה",
    acceptedCategories: "ערכים מותרים לקטגוריה: חלון / window, דלת / door",
    sidesHelp: "צד צירים: ימין / שמאל (במבט מבחוץ). כיוון פתיחה: פנימה / החוצה. חלקים קבועים: מספרי חלקים מספירה משמאל, למשל \"1\" או \"1,3\".",
    sheet: "גיליון",
    headerRow: "שורת כותרות",
    columnMapping: "מיפוי עמודות",
    fieldCol: "שדה",
    fileColumn: "עמודה בקובץ",
    notMapped: "— לא ממופה —",
    required: "חובה",
    unitQuestion: "יחידת הרוחב/גובה בקובץ",
    unitChoose: "— בחר/י יחידה —",
    unitFromFile: "זוהה מכותרות הקובץ: {unit}",
    unitRequired: "הקובץ אינו מציין יחידה. יש לבחור מ״מ או ס״מ במפורש.",
    unitColumnNote: "עמודת יחידה בקובץ גוברת על בחירה זו בשורות שלה.",
    mode: "בעת הייבוא",
    modeAppend: "הוספה לפריטים הקיימים (ברירת מחדל)",
    modeReplace: "החלפת כל הפריטים הקיימים",
    next: "הבא",
    back: "חזרה",
    include: "לכלול",
    row: "שורה",
    status: "מצב",
    ok: "תקין",
    error: "שגיאה",
    excluded: "לא נכלל",
    blankRowsIgnored: "{n} שורות ריקות לא נכללו.",
    summary: "{valid} תקינות · {invalid} עם שגיאות · {excluded} לא נכללו",
    confirmImport: "ייבוא {n} פריטים",
    confirmReplace: "פעולה זו תחליף את {existing} הפריטים הקיימים ב-{n} פריטים מיובאים. להמשיך?",
    nothingToImport: "אין שורות תקינות לייבוא.",
    invalidIncluded: "עדיין נכללות שורות עם שגיאות. יש לתקן או להוציא אותן.",
    autoRef: "אוטומטי",
    unknownValue: "ערך לא מוכר \"{v}\"",
    invalidNumber: "\"{v}\" אינו מספר תקין",
    notInteger: "הכמות \"{v}\" חייבת להיות מספר שלם",
    unitConflict: "בערך כתוב \"{v}\" אבל היחידה היא {unit}",
    unknownUnit: "יחידה לא מוכרת \"{v}\"",
    duplicateInFile: "המזהה {v} מופיע יותר מפעם אחת בקובץ",
    duplicateExisting: "המזהה {v} כבר קיים בבקשה",
    missing: "חסר: {field}",
    fixedPanelsInvalid: "חלקים קבועים \"{v}\" — יש לרשום מספרי חלקים, למשל 1,3",
    panelsInvalid: "מספר חלקים \"{v}\" — מותר {min}–{max} לסוג זה",
    notApplicable: "{field} אינו רלוונטי לסוג פתיחה זה — הערך לא נלקח",
    defaulted: "{field} לא צוין — נלקחה ברירת המחדל של התבנית; יש לבדוק בעורך הפריט",
    extraCells: "בשורה יש {n} ערכים יותר ממספר העמודות — בדוק/י פסיקים ללא מירכאות (למשל 1,200)",
    implausibleSize: "מידה חריגה \"{v}\" {unit} — נא לבדוק את היחידה",
    swingNotAllowed: "\"{v}\" אינו אפשרי לסוג פתיחה זה",
    formulaNote: "{n} תאי נוסחה: נלקחו הערכים השמורים (הנוסחאות לא הורצו).",
    tooLarge: "הקובץ גדול מדי (עד {mb}MB).",
    tooManyRows: "יותר מדי שורות (עד {rows}).",
    unsupported: "סוג קובץ לא נתמך. יש להשתמש ב-‎.xlsx או ‎.csv.",
    readFailed: "לא ניתן לקרוא את הקובץ: {msg}",
    noRows: "לא נמצאו שורות נתונים.",
    encodingNote: "קידוד טקסט: {enc}",
    cancelNote: "ביטול משאיר את הבקשה ללא שינוי.",
    editHint: "ניתן לערוך את התאים. השינויים חלים רק על ייבוא זה.",
  },
  pdf: {
    title: "בקשה להצעת מחיר",
    rfqNo: "מס׳ בקשה",
    date: "תאריך",
    project: "פרויקט",
    projectRef: "סימוכין",
    from: "מאת",
    to: "אל (ספק)",
    delivery: "יעד אספקה",
    dimensions: "מידות",
    summary: "סיכום",
    designs: "סוגי פריטים שונים",
    units: "סה״כ יחידות (כל הכמויות)",
    requestHeading: "נא לכלול בהצעתכם",
    req1: "מחיר ליחידה וסה״כ לשורה לכל מזהה פריט",
    req2: "מחיר כולל לפרויקט, כולל מטבע",
    req3: "מערכת / סדרת פרופיל, זכוכית ופרזול מוצעים לכל פריט",
    req4: "זמן ייצור ותאריך אספקה משוער",
    req5: "תנאי אספקה (Incoterms, אריזה) ותנאי תשלום",
    req6: "כל סטייה מהמפרט או שאלה לגביו",
    schedule: "רשימת פריטים",
    colRef: "מזהה",
    colType: "סוג",
    colLocation: "מיקום",
    colSize: "רוחב × גובה",
    colQty: "כמות",
    colConfig: "תצורה",
    details: "פירוט פריטים",
    continued: "המשך",
    page: "עמוד {p} מתוך {n}",
    generalSpecs: "מפרט כללי",
    generalNotes: "הערות כלליות",
    legend: "סמלי פתיחה (כל השרטוטים במבט מבחוץ)",
    schematic: "שרטוטים סכמטיים להצעת מחיר — אינם שרטוטי ייצור. אין בהם מידות ייצור, הפחתות זכוכית, חתכי פרופיל או התאמה הנדסית.",
    customPlaceholder: "פריט מותאם אישית — ראה תיאור",
    referenceImage: "תמונת ייחוס שסופקה על ידי הלקוח",
  },
};

const DICTS: Record<RfqLanguage, Dict> = { en, he };

export function dict(lang: RfqLanguage): Dict {
  return DICTS[lang] ?? en;
}

export function fmt(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export function dirOf(lang: RfqLanguage): "rtl" | "ltr" {
  return lang === "he" ? "rtl" : "ltr";
}

/** Panel title that always names its physical position (as viewed from outside). */
export function panelTitle(lang: RfqLanguage, index: number, count: number): string {
  const d = dict(lang).ui;
  const base = fmt(d.panelN, { n: index + 1 });
  if (count <= 1) return base;
  if (index === 0) return `${base} (${d.leftmost})`;
  if (index === count - 1) return `${base} (${d.rightmost})`;
  return base;
}

function panelDescription(lang: RfqLanguage, item: RfqItem, index: number): string {
  const d = dict(lang);
  const p = item.panels[index];
  const parts: string[] = [d.panelOp[p.operation]];
  if (p.operation === "sliding" && p.slideDirection) {
    parts.push(`${d.ui.slideDirection}: ${d.side[p.slideDirection]}`);
  }
  if ((p.operation === "casement" || p.operation === "tilt_turn" || p.operation === "hinged") && p.hingeSide) {
    parts.push(`${d.ui.hingeSide}: ${d.side[p.hingeSide]}`);
  }
  return parts.join(", ");
}

/** One line per panel, e.g. "Panel 1 (left): Sliding, slides toward: Right". */
export function describePanels(lang: RfqLanguage, item: RfqItem): string[] {
  return item.panels.map((_, i) => `${panelTitle(lang, i, item.panels.length)}: ${panelDescription(lang, item, i)}`);
}

/** Compact summary for schedules: "3 panels: 1 fixed, 2 sliding · opens inward". */
export function describeConfigurationShort(lang: RfqLanguage, item: RfqItem): string {
  const d = dict(lang);
  if (item.openingType === "custom") return item.customDescription.trim() || d.openingType.custom;
  const counts = new Map<PanelOperation, number>();
  item.panels.forEach((p) => counts.set(p.operation, (counts.get(p.operation) ?? 0) + 1));
  const n = item.panels.length;
  const panelsWord = lang === "he" ? (n === 1 ? "חלק אחד" : `${n} חלקים`) : n === 1 ? "1 panel" : `${n} panels`;
  const opsText = [...counts.entries()].map(([op, c]) => `${c} ${d.panelOp[op]}`).join(", ");
  const extras: string[] = [];
  const hingeSides = item.panels.filter((p) => p.hingeSide).map((p) => d.side[p.hingeSide!]);
  if (hingeSides.length === 1) extras.push(`${d.ui.hingeSide}: ${hingeSides[0]}`);
  if (item.panels.length === 1 && item.panels[0].slideDirection) {
    extras.push(`${d.ui.slideDirection}: ${d.side[item.panels[0].slideDirection]}`);
  }
  if (item.swing && OPENING_TYPE_DEFS[item.openingType].swing) extras.push(d.swing[item.swing]);
  if (item.activeLeaf) extras.push(`${d.ui.activeLeaf}: ${d.side[item.activeLeaf]}`);
  return [`${panelsWord}: ${opsText}`, ...extras].join(" · ");
}

/** `user` marks values typed by the user (kept exactly as written, own text direction). */
export type SpecRow = { label: string; value: string; user?: boolean };

/** Specification rows shown in the editor summary and the PDF. Unspecified optional fields are omitted. */
export function itemSpecRows(lang: RfqLanguage, item: RfqItem): SpecRow[] {
  const d = dict(lang);
  const rows: SpecRow[] = [];
  const user = (label: string, value: string) => {
    if (value.trim()) rows.push({ label, value: value.trim(), user: true });
  };
  rows.push({ label: d.ui.category, value: d.category[item.category] });
  rows.push({ label: d.ui.openingType, value: d.openingType[item.openingType] });
  user(d.ui.location, item.location);
  if (item.openingType === "custom") {
    user(d.ui.customDescription.replace(/\s*\(.*\)$/, ""), item.customDescription);
  } else {
    rows.push({ label: d.ui.panels, value: String(item.panels.length) });
    describePanels(lang, item).forEach((line) => rows.push({ label: "", value: line }));
    if (item.swing && OPENING_TYPE_DEFS[item.openingType].swing) rows.push({ label: d.ui.swing, value: d.swing[item.swing] });
    if (item.activeLeaf) rows.push({ label: d.ui.activeLeaf, value: d.side[item.activeLeaf] });
  }
  user(d.ui.glass, item.glass);
  user(d.ui.frameFinish, item.frameFinish);
  if (item.insectScreen !== "unspecified") rows.push({ label: d.ui.insectScreen, value: d.requirement[item.insectScreen] });
  if (item.shutter !== "unspecified") rows.push({ label: d.ui.shutter, value: d.requirement[item.shutter] });
  user(d.ui.hardware, item.hardware);
  user(d.ui.otherRequirements, item.otherRequirements);
  user(d.ui.itemNotes, item.notes);
  return rows;
}
