import type {
  AccessoryKind,
  AccessoryMode,
  Availability,
  CavityFill,
  DimensionBasis,
  GlassAppearance,
  GlassCoating,
  GlassPerformance,
  GlassSpec,
  GlassTreatment,
  GlazingConstruction,
  PanelOperation,
  QuestionStatus,
  Requirement,
  RfqCategory,
  RfqItem,
  RfqLanguage,
  RfqOpeningType,
  ShadingOperation,
  ShadingType,
  Side,
  Swing,
} from "./types";
import type { ItemIssueCode } from "./presets";
import { OPENING_TYPE_DEFS } from "./presets";
import { formatMakeup, glassGaps, isGlassSpecBlank, PERFORMANCE_KEYS, type GlassGap } from "./glass";
import { isAdvancedLayout, layoutGeometry, numberedGlass, panelLeaves, type CmRect } from "./layout";
import { auto, ltr } from "./bidi";
import { glassForEntry, isAccessoryUsed } from "./accessories";
import { formatDimension, formatSize } from "./units";

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
  layout: Record<string, string>;
  glass: Record<string, string>;
  construction: Record<GlazingConstruction, string>;
  treatment: Record<GlassTreatment, string>;
  appearance: Record<GlassAppearance, string>;
  coating: Record<GlassCoating, string>;
  fill: Record<CavityFill, string>;
  perf: Record<keyof GlassPerformance, string>;
  gap: Record<GlassGap, string>;
  shadingType: Record<ShadingType, string>;
  shadingOp: Record<ShadingOperation, string>;
  shade: Record<string, string>;
  accKind: Record<AccessoryKind, string>;
  accMode: Record<AccessoryMode, string>;
  hw: Record<string, string>;
  availability: Record<Availability, string>;
  sup: Record<string, string>;
  q: Record<string, string>;
  qt: Record<string, string>;
  qStatus: Record<QuestionStatus, string>;
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
    hinged_leaf_count: "This door type needs exactly the stated number of opening leaves (1 for a single door, 2 for a double door); other panels must be fixed",
    custom_description_required: "Custom items need a description",
    integrated_blind_single_glazing: "Integrated blinds sit between glass panes and need double or triple insulated glazing, but a linked glass section is single glazing",
    layout_size_invalid: "Section sizes must be positive numbers",
    layout_sizes_exceed: "Fixed section sizes leave no space for the automatic sections",
    layout_sizes_mismatch: "Section sizes do not add up to the overall dimension",
    layout_decorative_invalid: "Decorative bar counts must be whole numbers of 0 or more",
  },
  ui: {
    tabDesign: "Design & layout",
    tabGlass: "Glass",
    tabShading: "Blinds & shading",
    tabHardware: "Hardware & accessories",
    tabMore: "Finish, notes & alternatives",
    website: "Website",
    alternatives: "Requested alternatives",
    alternativesHint: "Quoted separately from the main configuration above.",
    addAlternative: "Add alternative",
    alternativeN: "Alternative {n}",
    remove: "Remove",
    questionsCount: "{n} open supplier questions",
    exportItems: "Export items (Excel)",
    exportRequestFile: "Export request file (.json)",
    importRequestFile: "Open request file (.json)",
    requestFileImported: "Request file opened as a new draft",
    requestFileInvalid: "This file is not a supplier request file.",
    itemsExported: "Items exported",
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
    schematicNote: "Schematic quotation drawing — not a manufacturing drawing.",
    legendMullion: "Thick line = mullion / transom between main panels",
    legendGlazingBar: "Medium solid line = glazing bar between separate glass units",
    legendDecorative: "Thin dotted line = decorative bar (not a separate glass unit)",
    legendLabels: "G1, G2 … = numbered glass sections; P1, P2 … = panel numbers",
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
    importQuotation: "Import supplier quotation prices",
    importQuotationHint: "Upload the supplier quotation CSV/Excel. Rows are matched to windows by reference (W-01…). USD prices are converted to shekels with the rate you enter.",
    manualPrices: "Manual prices",
    manualQuotation: "Enter supplier quotation prices",
    manualQuotationHint: "Type the supplier price for each window yourself. The amount is that window’s line total, quantity included. Leave a row empty to leave it unpriced.",
    pricePerWindow: "Window price",
    pricesCurrency: "Prices are in",
    currencyIls: "Shekels (₪)",
    currencyUsd: "US dollars ($)",
    packagingAmount: "Packaging",
    transportAmount: "Transport",
    optionalAmount: "Optional",
    manualTotalIls: "Entered total (₪)",
    manualPricesSaved: "Prices saved for {n} windows",
    manualPricesCleared: "Supplier prices cleared",
    invalidPrice: "Enter a valid number, or leave the field empty",
    noWindowsToPrice: "Add windows to this request before entering prices.",
    chooseQuotationFile: "Choose quotation file (.xlsx / .csv)",
    quotationNumber: "Quotation no.",
    quotationDate: "Quotation date",
    currency: "Currency",
    quotationLinesCount: "{n} priced lines in file",
    grandTotalOriginal: "Grand total (original)",
    exchangeRateLabel: "Exchange rate — 1 {currency} = ₪",
    exchangeRateHint: "Used to convert supplier prices to shekels for expense tracking.",
    fetchTodayRate: "Today’s rate",
    fetchingRate: "Fetching…",
    rateFetched: "Live rate loaded. You can still edit it.",
    rateFetchFailed: "Could not fetch today’s rate. Enter it manually.",
    match: "Match",
    matched: "Matched",
    unmatched: "No match",
    priceOriginal: "Price (original)",
    priceIls: "Price (₪)",
    extraInFile: "In file but not in this request",
    applyQuotationPrices: "Apply prices & mark done",
    quotationApplied: "Prices applied to {matched} items",
    quotationPartial: "Prices applied to {matched} items · {unmatched} still without a price",
    quotationStatusDone: "Done — quotation received",
    quotationStatusPending: "Pending — waiting for quotation",
    markDone: "Mark as done",
    markPending: "Mark as pending",
    supplierCostIls: "Supplier cost (₪)",
    unitPriceIls: "Unit ₪",
    screenPriceIls: "Screen ₪",
    lineTotalIls: "Line ₪",
    exchangeRateShort: "Rate 1 {currency} = ₪{rate}",
    packagingIls: "Packaging ₪",
    transportIls: "Transport ₪",
    grandTotalIls: "Grand total ₪",
    openRequestFile: "Open",
    convertToQuote: "Convert to customer quotation",
    convertToQuoteHint: "Create an הצעת מחיר from the supplier prices. Set your profit markup and any extras, then save it under Customers.",
    priceSource: "Supplier prices",
    priceSourceHint: "Choose how to fill each window: import the supplier file, or type a price for every window yourself. Then set the markup and create the customer quote.",
    customerName: "Customer name",
    markupPercent: "Profit markup %",
    markupPercentHint: "Selling price = supplier cost × (1 + markup/100). Example: 30% on ₪100 → ₪130.",
    shippingIls: "Shipping ₪",
    shippingIlsHint: "Optional. Suggest uses supplier packaging + transport with the same markup.",
    deliveryIls: "Delivery ₪",
    laborIls: "Labor costs ₪",
    useSuggestedShipping: "Fill from supplier packaging + transport (with markup)",
    suggest: "Suggest",
    quoteNotes: "Notes on the customer quote",
    pricedItems: "Priced items",
    skippedUnpriced: "{n} without supplier price skipped",
    afterMarkup: "After {pct}% markup",
    extrasIls: "Extras (shipping / delivery / labor)",
    subtotalBeforeVat: "Subtotal before VAT",
    createCustomerQuote: "Create הצעת מחיר",
    convertNeedsPrices: "Choose how to enter the supplier prices first.",
    convertQuoteCreated: "Customer quotation created for \"{name}\"",
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
    panelsInvalid: "Panels \"{v}\" — must be a whole number of at least {min} for this type",
    layoutInvalid: "Layout \"{v}\" could not be read near position {pos}. Example: F:400/(OL|OR) or OL[G/G]",
    layoutOverridesPanels: "Layout is given, so the panels / fixed panels columns are ignored",
    makeupInvalid: "Glass make-up \"{v}\" — use pane and cavity thicknesses in mm, e.g. 6-16-6 or 4+4-12-6",
    makeupConflict: "Glass make-up \"{v}\" has {n} panes, which does not match the glazing construction",
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
    req7: "Answers to the questions listed in this request",
    req8: "Requested alternatives quoted separately from the main configuration",
    supplierSite: "Website",
    questions: "Questions for supplier",
    questionsIntro: "Please answer each question. Unknown or unconfirmed items are marked \"supplier to propose/confirm\".",
    reply: "Reply",
    itemQuestions: "Open questions for this item",
    response: "Supplier response (to be completed by the supplier)",
    respQuoteRef: "Quotation reference / date",
    respValidity: "Quotation validity",
    respLeadTime: "Production lead time",
    respDelivery: "Delivery terms (Incoterms, packing)",
    respPayment: "Payment terms",
    respExclusions: "Exclusions",
    respAlternatives: "Proposed alternatives / deviations",
    respSignature: "Name, signature and date",
    sizesNote: "Section sizes are nominal divisions of the overall frame dimensions. They are not glass, sash or cut sizes; no profile deductions have been applied.",
    manufacturability: "Subdivisions are requested schematically. Please confirm they can be manufactured in the proposed system and state any required changes.",
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
  layout: {
    title: "Layout, panels and glass sections",
    hint: "Click a panel or a glass section in the drawing. A window opens to split it, merge it with the left, right, top or bottom, and choose its glass.",
    quick: "Quick layouts",
    equalPanels: "Equal panels side by side",
    grid: "Grid (columns × rows)",
    topLight: "Fixed top section above opening panels",
    topHeight: "Top section height ({unit}, optional)",
    apply: "Apply",
    confirmReplace: "Replace the current layout? Existing panels keep their settings in order; subdivisions are removed.",
    selected: "Selected",
    nothingSelected: "Select a panel or glass section in the drawing.",
    panel: "Panel",
    glassSection: "Glass section",
    selectPanel: "Select its panel",
    splitPanel: "Split panel into more panels",
    divideGlass: "Divide glass with glazing bars (separate glass units)",
    splitGlass: "Split this glass section",
    sideBySide: "side by side",
    stacked: "stacked",
    parts: "parts",
    mergePrev: "Merge with previous",
    mergeNext: "Merge with next",
    mergeBlocked: "That side is divided into smaller sections. Open those and merge them first.",
    mergeTitle: "Merge with a side",
    mergeUp: "Above",
    mergeDown: "Below",
    mergeLeft: "Left",
    mergeRight: "Right",
    mergeWithSide: "{side} · {who}",
    mergeEmpty: "Nothing on this side",
    mergePartial: "Joins only the part that lines up, and splits the longer section.",
    mergeKeeps: "This section keeps its glass and settings. The other one is removed.",
    splitTitle: "Split this section",
    splitInto: "How many",
    splitPanelHint: "New panels, each with its own opening.",
    divideGlassHint: "Separate glass units inside this panel, with glazing bars.",
    glassForSection: "Glass for this section",
    panelOpening: "How this panel opens",
    glassInside: "Glass sections in this panel",
    openSection: "Edit {g}",
    sizeTitle: "Sizes",
    dialogApplyNote: "The drawing updates as soon as you choose. Left, right, above and below match the drawing, viewed from outside.",
    dialogGlass: "Glass section {g}",
    dialogPanel: "{p}",
    closeSection: "Close",
    decorative: "Decorative bars (do not create separate glass units)",
    decoColumns: "Vertical bars",
    decoRows: "Horizontal bars",
    sizesOf: "Sizes in this division ({dir})",
    divisionSizes: "Division sizes",
    columns: "columns, left → right",
    rows: "rows, top → bottom",
    auto: "auto",
    equalize: "Equal sizes",
    sizesHint: "Leave blank for an equal share of the remaining length. Nominal division of the overall frame size — not glass or sash sizes.",
    panelCount: "Panels side by side",
    advancedNote: "This layout has nested divisions. Click a section in the drawing to split, merge or resize it.",
    panelsList: "Panels (opening settings)",
    summaryPanels: "{n} panels",
    summaryGlass: "{n} glass sections",
    position: "position",
    pos_left: "left",
    pos_right: "right",
    pos_center: "center",
    pos_top: "top",
    pos_bottom: "bottom",
    pos_middle: "middle",
    pos_centerLeft: "center-left",
    pos_centerRight: "center-right",
    layoutHeading: "Layout and divisions",
    layoutNote: "Viewed from outside. Positions are measured from the left edge and from the top of the overall size. The numbers above and to the right of the drawing show the same sizes.",
    mullions: "Vertical divisions (mullions)",
    transoms: "Horizontal divisions (transoms)",
    countLines: "{n}",
    noneDivision: "None",
    mullionFull: "At {pos} from the left — full height",
    mullionPart: "At {pos} from the left — between {a} (left) and {b} (right) only",
    transomFull: "At {pos} from the top — full width",
    transomPart: "At {pos} from the top — between {a} (above) and {b} (below) only",
    widthChain: "Widths, left to right",
    heightChain: "Heights, top to bottom",
    panelsBySize: "Panels",
    panelsBySizeNote: "Position, nominal size (width × height) and opening of each panel",
    divisionColumns: "Columns",
    divisionRows: "Rows",
    inPanel: "in {p}",
    decoText: "decorative bars: {c} vertical, {r} horizontal",
    glassDivided: "glass divided by glazing bars into {list}",
    supplierConfirm: "No system limits are applied. The supplier must confirm the design can be manufactured.",
  },
  glass: {
    defaultTitle: "Window glass (default for all sections)",
    sectionsTitle: "Glass sections",
    usesDefault: "Uses window glass",
    hasOverride: "Own glass specification",
    override: "Override for this section",
    removeOverride: "Use window glass again",
    applyAll: "Apply window glass to all sections",
    applyAllNone: "All sections already use the window glass.",
    applyAllConfirm: "{n} sections have their own glass specification. Replace them with the window glass?",
    overridesKept: "{n} sections keep their own glass specification.",
    construction: "Glazing construction",
    constructionNote: "Construction details",
    treatment: "Glass treatment",
    appearance: "Appearance / privacy",
    tintColor: "Tint / color",
    appearanceNote: "Appearance details",
    coatings: "Coatings and performance requirements",
    coatingProduct: "Coating product (if known)",
    coatingSurface: "Coating surface (if known, e.g. #3)",
    customRequirement: "Custom requirement",
    makeup: "Glass make-up — millimetres (independent of the frame unit)",
    pane: "Pane {n} thickness (mm)",
    paneNote: "Pane {n} note (e.g. 4+4 laminated)",
    cavity: "Cavity {n} width (mm)",
    cavityFill: "Cavity {n} fill",
    fillNote: "Other fill",
    addPane: "Add pane",
    removePane: "Remove pane",
    interlayer: "Lamination / interlayer details (if known)",
    requiredPerf: "Required performance (what we ask for)",
    declaredPerf: "Supplier-declared performance (from their reply)",
    perfHint: "Leave blank when unknown. Values are never filled in automatically.",
    askRecommendation: "Ask supplier to recommend",
    notes: "Glass notes",
    legacyText: "Additional glass description (free text)",
    supplierConfirm: "Supplier to propose/confirm",
    summaryDefault: "All glass sections",
    sameAsDefault: "same as window glass",
    mmNote: "Glazing thickness in mm",
    makeupLabel: "Make-up",
    lamination: "Interlayer",
    coatingInfo: "Coating",
    surface: "surface",
    required: "Required",
    declared: "Supplier-declared",
    missing: "Supplier to propose/confirm: {list}",
    general: "General glass options; not a claim that a supplier offers every combination.",
  },
  construction: {
    unspecified: "Not specified",
    single: "Single glazing",
    double: "Double insulated glazing",
    triple: "Triple insulated glazing",
    custom: "Custom construction",
    supplier: "Ask supplier to recommend",
  },
  treatment: {
    unspecified: "Not specified",
    annealed: "Annealed",
    heat_strengthened: "Heat-strengthened",
    tempered: "Tempered / toughened",
    laminated: "Laminated",
    tempered_laminated: "Tempered laminated",
    supplier: "Supplier recommendation",
  },
  appearance: {
    unspecified: "Not specified",
    clear: "Clear",
    low_iron: "Low-iron / ultra-clear",
    tinted: "Tinted",
    reflective: "Reflective",
    frosted: "Frosted / acid-etched",
    patterned: "Patterned / obscure",
    custom: "Custom",
  },
  coating: {
    low_e: "Low-E thermal insulation",
    solar_control: "Solar control / anti-sun",
    uv: "UV protection",
    acoustic: "Acoustic performance",
    custom: "Custom requirement",
  },
  fill: { unspecified: "Not specified", air: "Air", argon: "Argon", other: "Other" },
  perf: {
    uValue: "Ug / U-value (W/m²K)",
    gValue: "Solar factor g / SHGC",
    lightTransmission: "Visible light transmission (%)",
    uv: "UV performance",
    acoustic: "Acoustic rating (e.g. Rw dB)",
  },
  gap: {
    construction: "glazing construction",
    treatment: "glass treatment",
    appearance: "appearance",
    thickness: "pane thicknesses",
    cavity: "cavity widths",
    fill: "cavity fill",
    tint: "tint color",
  },
  shadingType: {
    integrated: "Blinds integrated between glass panes",
    interior: "Interior blinds",
    exterior: "Exterior blinds",
    roller_shutter: "Roller shutter",
    other: "Other / custom",
    supplier: "Ask supplier to recommend",
  },
  shadingOp: { unspecified: "Not specified", manual: "Manual", motorized: "Motorized" },
  shade: {
    title: "Blinds / shading (optional)",
    none: "None requested.",
    add: "Add blinds / shading",
    type: "Type",
    customType: "Describe the type",
    appliesTo: "Applies to",
    wholeItem: "Whole item",
    appliesGlass: "Linked glass units",
    location: "Location / mounting",
    color: "Color",
    operation: "Operation",
    control: "Control method (e.g. crank, switch, remote, app)",
    dimensions: "Required dimensions (if known)",
    installation: "Installation arrangement (if known)",
    notes: "Notes",
    confirmation: "Availability / compatibility",
    conflict: "Integrated blinds sit inside an insulated glass unit, but glass section(s) {list} are single glazing.",
    fixDouble: "Change those sections to double insulated glazing",
    fixSupplier: "Ask the supplier to propose the glazing",
    integratedQuestion: "A supplier question is added automatically for integrated blinds.",
    shutterLegacy: "Shutter (general requirement)",
    separate: "Blinds, shutters and insect screens are separate options.",
    requestable: "Requestable options — not verified supplier products.",
  },
  accKind: {
    handles: "Handles",
    hinges: "Hinges",
    friction_stays: "Friction stays",
    rollers_tracks: "Sliding rollers and tracks",
    locks: "Locks, multipoint locks and keepers",
    restrictors: "Opening restrictors and child-safety devices",
    gaskets: "Gaskets / weather seals",
    insect_screen: "Insect screens",
    fixings: "Installation fixings and brackets",
    custom: "Custom accessory",
  },
  accMode: {
    unspecified: "Not specified",
    included: "Included in complete-window supply",
    separate: "Request separately",
    excluded: "Excluded",
    ask: "Ask supplier",
  },
  hw: {
    title: "Hardware & accessories",
    adapts: "Shown for the opening types in this item.",
    notTypical: "Not typical for this opening type (kept as entered)",
    quantity: "Quantity (if known)",
    model: "Brand / model / article code (if known)",
    finish: "Finish / color",
    compatibility: "Compatible panel / system",
    appliesTo: "Panels",
    notes: "Notes",
    confirmation: "Confirmation",
    customName: "Accessory name",
    addCustom: "Add custom accessory",
    ask: "Ask supplier about this accessory",
    asked: "Question added",
    completeSet: "Request complete compatible hardware set",
    completeSetOn: "Complete compatible hardware set requested",
    generalNotes: "General hardware notes",
    noAuto: "Brands, models, quantities, load ratings and compatibility are never assigned automatically.",
    qty: "qty",
  },
  availability: {
    listed: "Listed on supplier website",
    listed_other_family: "Listed for another product family — confirm compatibility",
    not_verified: "Not verified — ask supplier",
    confirmed: "Confirmed by supplier",
    unavailable: "Unavailable (confirmed by supplier)",
  },
  sup: {
    select: "Select supplier",
    change: "Change supplier",
    clear: "Clear selection",
    title: "Suppliers",
    selected: "Selected supplier",
    noneSelected: "No supplier selected. The request stays supplier-independent.",
    openWebsite: "Open website",
    use: "Select",
    inUse: "Selected",
    edit: "Edit",
    done: "Done",
    add: "Add supplier",
    delete: "Delete supplier",
    confirmDelete: "Delete supplier \"{name}\" from the directory? Requests keep their supplier details.",
    displayName: "Display name",
    website: "Website",
    notes: "Notes",
    catalog: "Catalog options",
    catalogFor: "Catalog options — {name}",
    catalogHint: "Offline catalog hints. A website listing does not confirm stock, pricing, exact glass construction or compatibility; a missing listing does not mean unavailable.",
    addEntry: "Add catalog option",
    label: "Option",
    category: "Category",
    availability: "Availability",
    family: "Applicable product family",
    sources: "Source URLs (one per line)",
    checked: "Date checked",
    optionKeys: "Linked options",
    catGlass: "Glass",
    catShading: "Blinds / shading",
    catHardware: "Hardware",
    catOther: "Other",
    designUnchanged: "Selecting a supplier updates the supplier details only — the window designs are not changed.",
    selectedToast: "Supplier selected",
    unnamed: "Unnamed supplier",
    noCatalog: "No catalog options recorded.",
  },
  q: {
    title: "Questions for supplier",
    intro: "Questions are included in the PDF. Preparing the request never sends anything — you send the exported PDF yourself.",
    add: "Add question",
    custom: "Custom question",
    suggested: "Suggested questions",
    addSuggestion: "Add",
    dismiss: "Dismiss",
    addAll: "Add all",
    none: "No questions yet.",
    reply: "Supplier reply",
    confirmationNote: "Confirmation notes",
    status: "Status",
    stale: "The linked requirement changed or was removed — review or delete this question.",
    auto: "Added automatically",
    sectionGlass: "Glass",
    sectionAllGlass: "All glass",
    sectionHardware: "Hardware",
    sectionShading: "Blinds / shading",
    askSupplier: "Ask supplier",
    asked: "Question added",
    general: "General",
  },
  qt: {
    glass_config: "Can you supply this glass configuration for the selected window system and dimensions?",
    lowe_solar: "Which Low-E and solar-control products do you offer?",
    uv: "What UV protection is available, and can you provide the performance datasheet?",
    integrated_blinds: "Can you supply integrated blinds? What operation methods, colors, cavity requirements, and size limits apply?",
    hardware_compat: "Which handle, hinge, roller, track, and locking options are compatible?",
    hardware_set: "Is the complete hardware set included? Please identify exclusions and separately quoted accessories.",
    accessory_catalog: "Please provide your accessory catalog, model/article codes, available finishes, and spare-part options.",
    subdivisions: "Can you manufacture the illustrated subdivisions? Please identify required changes.",
    alternatives: "Please quote the selected configuration and requested alternatives separately.",
    option_unverified: "Can you supply {option} for the selected window system and dimensions? Please confirm availability and compatibility.",
    accessory: "{accessory}: please state the compatible model/article code, finish and quantity, and whether it is included in the complete-window supply.",
    glass_recommend: "Please recommend a suitable glass construction and treatment for this item and state the performance values.",
    shading_recommend: "Please recommend a suitable blind or shading solution for this item, including operation and size limits.",
  },
  qStatus: { open: "Open", answered: "Answered", resolved: "Resolved" },
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
    hinged_leaf_count: "בסוג דלת זה נדרש מספר כנפות פתיחה מדויק (1 בדלת כנף אחת, 2 בדלת שתי כנפיים); שאר החלקים חייבים להיות קבועים",
    custom_description_required: "בפריט מותאם אישית חובה להזין תיאור",
    integrated_blind_single_glazing: "וילון מובנה נמצא בין שכבות הזכוכית ודורש זיגוג כפול או משולש, אך קטע זכוכית מקושר מוגדר כזיגוג יחיד",
    layout_size_invalid: "מידות הקטעים חייבות להיות מספרים חיוביים",
    layout_sizes_exceed: "מידות הקטעים הקבועות לא משאירות מקום לקטעים האוטומטיים",
    layout_sizes_mismatch: "סכום מידות הקטעים אינו שווה למידה הכוללת",
    layout_decorative_invalid: "מספר הסרגלים הדקורטיביים חייב להיות מספר שלם, 0 ומעלה",
  },
  ui: {
    tabDesign: "תכנון וחלוקה",
    tabGlass: "זכוכית",
    tabShading: "וילונות והצללה",
    tabHardware: "פרזול ואביזרים",
    tabMore: "גימור, הערות וחלופות",
    website: "אתר אינטרנט",
    alternatives: "חלופות מבוקשות",
    alternativesHint: "יתומחרו בנפרד מהתצורה הראשית שלמעלה.",
    addAlternative: "הוספת חלופה",
    alternativeN: "חלופה {n}",
    remove: "הסרה",
    questionsCount: "{n} שאלות פתוחות לספק",
    exportItems: "ייצוא פריטים (Excel)",
    exportRequestFile: "ייצוא קובץ בקשה (‎.json)",
    importRequestFile: "פתיחת קובץ בקשה (‎.json)",
    requestFileImported: "קובץ הבקשה נפתח כטיוטה חדשה",
    requestFileInvalid: "הקובץ אינו קובץ בקשה לספק.",
    itemsExported: "הפריטים יוצאו",
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
    schematicNote: "שרטוט סכמטי להצעת מחיר — אינו שרטוט ייצור.",
    legendMullion: "קו עבה = עמוד / קורה בין החלקים הראשיים",
    legendGlazingBar: "קו רציף בינוני = סרגל זיגוג בין יחידות זכוכית נפרדות",
    legendDecorative: "קו מנוקד דק = סרגל דקורטיבי (אינו יוצר יחידת זכוכית נפרדת)",
    legendLabels: "G1, G2 … = מספרי קטעי זכוכית; P1, P2 … = מספרי חלקים",
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
    importQuotation: "ייבוא מחירי הצעת ספק",
    importQuotationHint: "העלה/י את קובץ הצעת המחיר מהספק (CSV/Excel). השורות מותאמות לחלונות לפי מזהה (W-01…). מחירים בדולר מומרים לשקלים לפי השער שתזין/י.",
    manualPrices: "מחיר ידני",
    manualQuotation: "הזנת מחירי הצעת ספק",
    manualQuotationHint: "הזן/י את מחיר הספק לכל חלון בנפרד, כפי שתרצה/י. הסכום הוא מחיר השורה של החלון, כולל הכמות. השאר/י שורה ריקה כדי להשאיר אותה בלי מחיר.",
    pricePerWindow: "מחיר החלון",
    pricesCurrency: "המחירים ב",
    currencyIls: "שקלים (₪)",
    currencyUsd: "דולר ($)",
    packagingAmount: "אריזה",
    transportAmount: "הובלה",
    optionalAmount: "אופציונלי",
    manualTotalIls: "סה״כ שהוזן (₪)",
    manualPricesSaved: "נשמרו מחירים ל-{n} חלונות",
    manualPricesCleared: "מחירי הספק נוקו",
    invalidPrice: "יש להזין מספר תקין, או להשאיר את השדה ריק",
    noWindowsToPrice: "יש להוסיף חלונות לבקשה לפני הזנת מחירים.",
    chooseQuotationFile: "בחירת קובץ הצעה (‎.xlsx / ‎.csv)",
    quotationNumber: "מס׳ הצעה",
    quotationDate: "תאריך הצעה",
    currency: "מטבע",
    quotationLinesCount: "{n} שורות מחיר בקובץ",
    grandTotalOriginal: "סה״כ במטבע המקורי",
    exchangeRateLabel: "שער המרה — 1 {currency} = ₪",
    exchangeRateHint: "משמש להמרת מחירי הספק לשקלים לצורך חישוב הוצאות.",
    fetchTodayRate: "שער היום",
    fetchingRate: "טוען…",
    rateFetched: "שער חי נטען. אפשר לערוך אותו.",
    rateFetchFailed: "לא ניתן לטעון את שער היום. הזן/י ידנית.",
    match: "התאמה",
    matched: "הותאם",
    unmatched: "ללא התאמה",
    priceOriginal: "מחיר (מקור)",
    priceIls: "מחיר (₪)",
    extraInFile: "בקובץ אך לא בבקשה זו",
    applyQuotationPrices: "החלת מחירים וסימון כבוצע",
    quotationApplied: "הוחלו מחירים על {matched} פריטים",
    quotationPartial: "הוחלו מחירים על {matched} פריטים · {unmatched} עדיין ללא מחיר",
    quotationStatusDone: "בוצע — התקבלה הצעת מחיר",
    quotationStatusPending: "ממתין — ללא הצעת מחיר",
    markDone: "סמן כבוצע",
    markPending: "סמן כממתין",
    supplierCostIls: "עלות ספק (₪)",
    unitPriceIls: "יח׳ ₪",
    screenPriceIls: "רשת ₪",
    lineTotalIls: "שורה ₪",
    exchangeRateShort: "שער 1 {currency} = ₪{rate}",
    packagingIls: "אריזה ₪",
    transportIls: "הובלה ₪",
    grandTotalIls: "סה״כ ₪",
    openRequestFile: "פתיחה",
    convertToQuote: "המרה להצעת מחיר ללקוח",
    convertToQuoteHint: "יצירת הצעת מחיר ממחירי הספק. הגדר/י אחוז רווח ותוספות, ואז שמירה תחת לקוחות.",
    priceSource: "מחירי הספק",
    priceSourceHint: "בחר/י איך למלא את המחיר לכל חלון: ייבוא קובץ ההצעה מהספק, או הזנה ידנית של מחיר לכל חלון. אחר כך הגדר/י רווח וצור/י הצעה ללקוח.",
    customerName: "שם הלקוח",
    markupPercent: "אחוז רווח (תוספת על העלות)",
    markupPercentHint: "מחיר מכירה = עלות ספק × (1 + אחוז/100). לדוגמה: 30% על ₪100 → ₪130.",
    shippingIls: "משלוח ₪",
    shippingIlsHint: "אופציונלי. ״הצעה״ ממלאת אריזה+הובלה מהספק עם אותו אחוז רווח.",
    deliveryIls: "הובלה / משלוח מקומי ₪",
    laborIls: "עלות עבודה ₪",
    useSuggestedShipping: "מילוי מאריזה+הובלה של הספק (עם אחוז הרווח)",
    suggest: "הצעה",
    quoteNotes: "הערות בהצעת הלקוח",
    pricedItems: "פריטים עם מחיר",
    skippedUnpriced: "{n} ללא מחיר ספק ידולגו",
    afterMarkup: "אחרי תוספת {pct}%",
    extrasIls: "תוספות (משלוח / הובלה / עבודה)",
    subtotalBeforeVat: "סה״כ לפני מע״מ",
    createCustomerQuote: "יצירת הצעת מחיר",
    convertNeedsPrices: "בחר/י קודם איך להזין את מחירי הספק.",
    convertQuoteCreated: "נוצרה הצעת מחיר עבור \"{name}\"",
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
    panelsInvalid: "מספר חלקים \"{v}\" — חייב להיות מספר שלם, לפחות {min} לסוג זה",
    layoutInvalid: "לא ניתן לקרוא את החלוקה \"{v}\" ליד מיקום {pos}. דוגמה: F:400/(OL|OR) או OL[G/G]",
    layoutOverridesPanels: "צוינה חלוקה, ולכן עמודות מספר חלקים / חלקים קבועים לא נלקחו",
    makeupInvalid: "הרכב זכוכית \"{v}\" — יש לרשום עוביי זכוכית ומרווחים במ״מ, למשל 6-16-6 או 4+4-12-6",
    makeupConflict: "בהרכב הזכוכית \"{v}\" יש {n} שכבות, וזה אינו תואם את סוג הזיגוג",
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
    req7: "תשובות לשאלות המפורטות בבקשה זו",
    req8: "חלופות מבוקשות, מתומחרות בנפרד מהתצורה הראשית",
    supplierSite: "אתר",
    questions: "שאלות לספק",
    questionsIntro: "נא להשיב על כל שאלה. פריטים שאינם ידועים או לא אושרו מסומנים \"הספק יציע/יאשר\".",
    reply: "תשובה",
    itemQuestions: "שאלות פתוחות לפריט זה",
    response: "תגובת הספק (למילוי על ידי הספק)",
    respQuoteRef: "מספר / תאריך הצעה",
    respValidity: "תוקף ההצעה",
    respLeadTime: "זמן ייצור",
    respDelivery: "תנאי אספקה (Incoterms, אריזה)",
    respPayment: "תנאי תשלום",
    respExclusions: "פריטים שאינם כלולים",
    respAlternatives: "חלופות / סטיות מוצעות",
    respSignature: "שם, חתימה ותאריך",
    sizesNote: "מידות הקטעים הן חלוקה נומינלית של מידות המסגרת הכוללות. אינן מידות זכוכית, כנף או חיתוך; לא הופחתו מידות פרופיל.",
    manufacturability: "החלוקות מבוקשות באופן סכמטי. נא לאשר שניתן לייצר אותן במערכת המוצעת ולציין שינויים נדרשים.",
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
  layout: {
    title: "חלוקה, חלקים וקטעי זכוכית",
    hint: "לחיצה על חלק או על קטע זכוכית בשרטוט פותחת חלון: אפשר לפצל, לאחד עם שמאל, ימין, למעלה או למטה, ולבחור את הזכוכית.",
    quick: "חלוקות מהירות",
    equalPanels: "חלקים שווים זה לצד זה",
    grid: "רשת (עמודות × שורות)",
    topLight: "חלק קבוע עליון מעל חלקים נפתחים",
    topHeight: "גובה החלק העליון ({unit}, לא חובה)",
    apply: "החלה",
    confirmReplace: "להחליף את החלוקה הנוכחית? החלקים הקיימים שומרים על ההגדרות שלהם לפי הסדר; חלוקות פנימיות יוסרו.",
    selected: "נבחר",
    nothingSelected: "יש לבחור חלק או קטע זכוכית בשרטוט.",
    panel: "חלק",
    glassSection: "קטע זכוכית",
    selectPanel: "בחירת החלק שלו",
    splitPanel: "פיצול החלק לחלקים נוספים",
    divideGlass: "חלוקת הזכוכית בסרגלי זיגוג (יחידות זכוכית נפרדות)",
    splitGlass: "פיצול קטע הזכוכית",
    sideBySide: "זה לצד זה",
    stacked: "זה מעל זה",
    parts: "חלקים",
    mergePrev: "איחוד עם הקודם",
    mergeNext: "איחוד עם הבא",
    mergeBlocked: "הצד הזה מחולק לקטעים קטנים יותר. יש לפתוח אותם ולאחד אותם קודם.",
    mergeTitle: "איחוד עם צד",
    mergeUp: "למעלה",
    mergeDown: "למטה",
    mergeLeft: "שמאל",
    mergeRight: "ימין",
    mergeWithSide: "{side} · {who}",
    mergeEmpty: "אין חלק בצד זה",
    mergePartial: "מתאחד רק החלק שמתיישר, והקטע הארוך יותר יפוצל.",
    mergeKeeps: "הקטע הזה שומר על הזכוכית ועל ההגדרות שלו. הקטע השני מוסר.",
    splitTitle: "פיצול הקטע",
    splitInto: "לכמה",
    splitPanelHint: "חלקים חדשים, לכל אחד פתיחה משלו.",
    divideGlassHint: "יחידות זכוכית נפרדות בתוך החלק, עם סרגלי זיגוג.",
    glassForSection: "הזכוכית של הקטע",
    panelOpening: "פתיחת החלק",
    glassInside: "קטעי הזכוכית בחלק זה",
    openSection: "עריכת {g}",
    sizeTitle: "מידות",
    dialogApplyNote: "השרטוט מתעדכן מיד. שמאל, ימין, למעלה ולמטה תואמים לשרטוט, במבט מבחוץ.",
    dialogGlass: "קטע זכוכית {g}",
    dialogPanel: "{p}",
    closeSection: "סגירה",
    decorative: "סרגלים דקורטיביים (אינם יוצרים יחידות זכוכית נפרדות)",
    decoColumns: "סרגלים אנכיים",
    decoRows: "סרגלים אופקיים",
    sizesOf: "מידות בחלוקה זו ({dir})",
    divisionSizes: "מידות החלוקה",
    columns: "עמודות, משמאל לימין",
    rows: "שורות, מלמעלה למטה",
    auto: "אוטומטי",
    equalize: "מידות שוות",
    sizesHint: "שדה ריק = חלק שווה מהאורך שנותר. חלוקה נומינלית של מידת המסגרת הכוללת — אינן מידות זכוכית או כנף.",
    panelCount: "חלקים זה לצד זה",
    advancedNote: "בחלוקה זו יש חלוקות מקוננות. לחיצה על קטע בשרטוט מאפשרת לפצל, לאחד או לשנות מידה.",
    panelsList: "חלקים (הגדרות פתיחה)",
    summaryPanels: "{n} חלקים",
    summaryGlass: "{n} קטעי זכוכית",
    position: "מיקום",
    pos_left: "שמאל",
    pos_right: "ימין",
    pos_center: "מרכז",
    pos_top: "עליון",
    pos_bottom: "תחתון",
    pos_middle: "אמצעי",
    pos_centerLeft: "מרכז-שמאל",
    pos_centerRight: "מרכז-ימין",
    layoutHeading: "חלוקה ומחיצות",
    layoutNote: "במבט מבחוץ. המיקומים נמדדים מהקצה השמאלי ומהחלק העליון של המידה הכוללת. המספרים מעל השרטוט ומימינו מציגים את אותן מידות.",
    mullions: "חלוקות אנכיות (עמודים)",
    transoms: "חלוקות אופקיות (קורות)",
    countLines: "{n}",
    noneDivision: "אין",
    mullionFull: "ב-{pos} מהשמאל — לכל הגובה",
    mullionPart: "ב-{pos} מהשמאל — רק בין {a} (משמאל) לבין {b} (מימין)",
    transomFull: "ב-{pos} מלמעלה — לכל הרוחב",
    transomPart: "ב-{pos} מלמעלה — רק בין {a} (מעל) לבין {b} (מתחת)",
    widthChain: "רוחבים, משמאל לימין",
    heightChain: "גבהים, מלמעלה למטה",
    panelsBySize: "חלקים",
    panelsBySizeNote: "מיקום, מידה נומינלית (רוחב × גובה) ופתיחה של כל חלק",
    divisionColumns: "עמודות",
    divisionRows: "שורות",
    inPanel: "ב-{p}",
    decoText: "סרגלים דקורטיביים: {c} אנכיים, {r} אופקיים",
    glassDivided: "הזכוכית מחולקת בסרגלי זיגוג ל-{list}",
    supplierConfirm: "לא הוחלו מגבלות מערכת. על הספק לאשר שניתן לייצר את התכנון.",
  },
  glass: {
    defaultTitle: "זכוכית החלון (ברירת מחדל לכל הקטעים)",
    sectionsTitle: "קטעי זכוכית",
    usesDefault: "משתמש בזכוכית החלון",
    hasOverride: "מפרט זכוכית ייחודי",
    override: "הגדרה ייחודית לקטע זה",
    removeOverride: "חזרה לזכוכית החלון",
    applyAll: "החלת זכוכית החלון על כל הקטעים",
    applyAllNone: "כל הקטעים כבר משתמשים בזכוכית החלון.",
    applyAllConfirm: "ל-{n} קטעים יש מפרט זכוכית ייחודי. להחליף אותם בזכוכית החלון?",
    overridesKept: "{n} קטעים שומרים על מפרט הזכוכית הייחודי שלהם.",
    construction: "מבנה הזיגוג",
    constructionNote: "פרטי המבנה",
    treatment: "עיבוד הזכוכית",
    appearance: "מראה / פרטיות",
    tintColor: "גוון / צבע",
    appearanceNote: "פרטי המראה",
    coatings: "ציפויים ודרישות ביצועים",
    coatingProduct: "מוצר הציפוי (אם ידוע)",
    coatingSurface: "משטח הציפוי (אם ידוע, למשל #3)",
    customRequirement: "דרישה מיוחדת",
    makeup: "הרכב הזכוכית — במילימטרים (ללא קשר ליחידת המסגרת)",
    pane: "עובי זכוכית {n} (מ״מ)",
    paneNote: "הערה לזכוכית {n} (למשל 4+4 שכבתית)",
    cavity: "רוחב מרווח {n} (מ״מ)",
    cavityFill: "מילוי מרווח {n}",
    fillNote: "מילוי אחר",
    addPane: "הוספת שכבה",
    removePane: "הסרת שכבה",
    interlayer: "פרטי שכבת הביניים / למינציה (אם ידוע)",
    requiredPerf: "ביצועים נדרשים (מה שאנו מבקשים)",
    declaredPerf: "ביצועים שהצהיר הספק (מתשובתו)",
    perfHint: "יש להשאיר ריק אם לא ידוע. ערכים לעולם אינם ממולאים אוטומטית.",
    askRecommendation: "לבקש המלצה מהספק",
    notes: "הערות לזכוכית",
    legacyText: "תיאור זכוכית נוסף (טקסט חופשי)",
    supplierConfirm: "הספק יציע/יאשר",
    summaryDefault: "כל קטעי הזכוכית",
    sameAsDefault: "כמו זכוכית החלון",
    mmNote: "עובי זיגוג במ״מ",
    makeupLabel: "הרכב",
    lamination: "שכבת ביניים",
    coatingInfo: "ציפוי",
    surface: "משטח",
    required: "נדרש",
    declared: "הצהרת הספק",
    missing: "הספק יציע/יאשר: {list}",
    general: "אפשרויות זכוכית כלליות; אין טענה שכל ספק מציע כל שילוב.",
  },
  construction: {
    unspecified: "לא צוין",
    single: "זיגוג יחיד",
    double: "זיגוג כפול (בידודית)",
    triple: "זיגוג משולש (בידודית)",
    custom: "מבנה מותאם אישית",
    supplier: "לבקש המלצה מהספק",
  },
  treatment: {
    unspecified: "לא צוין",
    annealed: "רגילה (מקוררת)",
    heat_strengthened: "מחוזקת בחום",
    tempered: "מחוסמת",
    laminated: "שכבתית (טריפלקס)",
    tempered_laminated: "שכבתית מחוסמת",
    supplier: "המלצת הספק",
  },
  appearance: {
    unspecified: "לא צוין",
    clear: "שקופה",
    low_iron: "אולטרה-שקופה (Low-iron)",
    tinted: "כהה / בגוון",
    reflective: "רפלקטיבית",
    frosted: "חלבית / חומצה",
    patterned: "מעוטרת / עמומה",
    custom: "מותאם אישית",
  },
  coating: {
    low_e: "Low-E בידוד תרמי",
    solar_control: "בקרת שמש / אנטי-סאן",
    uv: "הגנת UV",
    acoustic: "ביצועים אקוסטיים",
    custom: "דרישה מיוחדת",
  },
  fill: { unspecified: "לא צוין", air: "אוויר", argon: "ארגון", other: "אחר" },
  perf: {
    uValue: "Ug / U-value (W/m²K)",
    gValue: "מקדם סולארי g / SHGC",
    lightTransmission: "העברת אור נראה (%)",
    uv: "ביצועי UV",
    acoustic: "דירוג אקוסטי (למשל Rw dB)",
  },
  gap: {
    construction: "מבנה הזיגוג",
    treatment: "עיבוד הזכוכית",
    appearance: "מראה",
    thickness: "עוביי זכוכית",
    cavity: "רוחב מרווחים",
    fill: "מילוי מרווח",
    tint: "צבע הגוון",
  },
  shadingType: {
    integrated: "וילון מובנה בין שכבות הזכוכית",
    interior: "וילון פנימי",
    exterior: "וילון חיצוני",
    roller_shutter: "תריס גלילה",
    other: "אחר / מותאם אישית",
    supplier: "לבקש המלצה מהספק",
  },
  shadingOp: { unspecified: "לא צוין", manual: "ידני", motorized: "חשמלי" },
  shade: {
    title: "וילונות / הצללה (אופציונלי)",
    none: "לא נדרש.",
    add: "הוספת וילון / הצללה",
    type: "סוג",
    customType: "תיאור הסוג",
    appliesTo: "חל על",
    wholeItem: "כל הפריט",
    appliesGlass: "יחידות זכוכית מקושרות",
    location: "מיקום / התקנה",
    color: "צבע",
    operation: "הפעלה",
    control: "אמצעי שליטה (למשל ידית, מתג, שלט, אפליקציה)",
    dimensions: "מידות נדרשות (אם ידוע)",
    installation: "אופן ההתקנה (אם ידוע)",
    notes: "הערות",
    confirmation: "זמינות / התאמה",
    conflict: "וילון מובנה נמצא בתוך יחידת זכוכית בידודית, אך קטעי הזכוכית {list} מוגדרים כזיגוג יחיד.",
    fixDouble: "שינוי קטעים אלה לזיגוג כפול",
    fixSupplier: "לבקש מהספק להציע זיגוג",
    integratedQuestion: "לווילון מובנה נוספת שאלה לספק באופן אוטומטי.",
    shutterLegacy: "תריס (דרישה כללית)",
    separate: "וילונות, תריסים ורשתות נגד חרקים הם אפשרויות נפרדות.",
    requestable: "אפשרויות לבקשה — אינן מוצרים מאומתים של הספק.",
  },
  accKind: {
    handles: "ידיות",
    hinges: "צירים",
    friction_stays: "זרועות חיכוך",
    rollers_tracks: "גלגלות ומסילות הזזה",
    locks: "מנעולים, נעילה רב-נקודתית ונגדיות",
    restrictors: "מגבילי פתיחה והתקני בטיחות לילדים",
    gaskets: "אטמים / גומיות איטום",
    insect_screen: "רשתות נגד חרקים",
    fixings: "חיזוקים ותושבות להתקנה",
    custom: "אביזר מותאם אישית",
  },
  accMode: {
    unspecified: "לא צוין",
    included: "כלול באספקת החלון המלא",
    separate: "בקשה בנפרד",
    excluded: "לא כלול",
    ask: "לשאול את הספק",
  },
  hw: {
    title: "פרזול ואביזרים",
    adapts: "מוצגים לפי סוגי הפתיחה בפריט זה.",
    notTypical: "אינו אופייני לסוג פתיחה זה (נשמר כפי שהוזן)",
    quantity: "כמות (אם ידוע)",
    model: "מותג / דגם / מק״ט (אם ידוע)",
    finish: "גימור / צבע",
    compatibility: "חלק / מערכת תואמים",
    appliesTo: "חלקים",
    notes: "הערות",
    confirmation: "אישור",
    customName: "שם האביזר",
    addCustom: "הוספת אביזר מותאם",
    ask: "לשאול את הספק על אביזר זה",
    asked: "השאלה נוספה",
    completeSet: "לבקש סט פרזול מלא ותואם",
    completeSetOn: "התבקש סט פרזול מלא ותואם",
    generalNotes: "הערות פרזול כלליות",
    noAuto: "מותגים, דגמים, כמויות, עומסים והתאמה לעולם אינם נקבעים אוטומטית.",
    qty: "כמות",
  },
  availability: {
    listed: "מופיע באתר הספק",
    listed_other_family: "מופיע למשפחת מוצרים אחרת — לאמת התאמה",
    not_verified: "לא אומת — לשאול את הספק",
    confirmed: "אושר על ידי הספק",
    unavailable: "לא זמין (אושר על ידי הספק)",
  },
  sup: {
    select: "בחירת ספק",
    change: "החלפת ספק",
    clear: "ביטול הבחירה",
    title: "ספקים",
    selected: "ספק נבחר",
    noneSelected: "לא נבחר ספק. הבקשה נשארת בלתי תלויה בספק.",
    openWebsite: "פתיחת האתר",
    use: "בחירה",
    inUse: "נבחר",
    edit: "עריכה",
    done: "סיום",
    add: "הוספת ספק",
    delete: "מחיקת ספק",
    confirmDelete: "למחוק את הספק \"{name}\" מהרשימה? הבקשות שומרות את פרטי הספק שלהן.",
    displayName: "שם לתצוגה",
    website: "אתר אינטרנט",
    notes: "הערות",
    catalog: "אפשרויות בקטלוג",
    catalogFor: "אפשרויות בקטלוג — {name}",
    catalogHint: "רמזי קטלוג לא מקוונים. הופעה באתר אינה מאשרת מלאי, מחיר, מבנה זכוכית מדויק או התאמה; היעדר הופעה אינו אומר שהמוצר לא זמין.",
    addEntry: "הוספת אפשרות לקטלוג",
    label: "אפשרות",
    category: "קטגוריה",
    availability: "זמינות",
    family: "משפחת מוצרים רלוונטית",
    sources: "כתובות מקור (אחת בכל שורה)",
    checked: "תאריך בדיקה",
    optionKeys: "אפשרויות מקושרות",
    catGlass: "זכוכית",
    catShading: "וילונות / הצללה",
    catHardware: "פרזול",
    catOther: "אחר",
    designUnchanged: "בחירת ספק מעדכנת רק את פרטי הספק — תכנון החלונות אינו משתנה.",
    selectedToast: "הספק נבחר",
    unnamed: "ספק ללא שם",
    noCatalog: "לא נרשמו אפשרויות בקטלוג.",
  },
  q: {
    title: "שאלות לספק",
    intro: "השאלות נכללות ב-PDF. הכנת הבקשה אינה שולחת דבר — את ה-PDF המיוצא שולחים בעצמכם.",
    add: "הוספת שאלה",
    custom: "שאלה חופשית",
    suggested: "שאלות מוצעות",
    addSuggestion: "הוספה",
    dismiss: "התעלמות",
    addAll: "הוספת הכול",
    none: "אין עדיין שאלות.",
    reply: "תשובת הספק",
    confirmationNote: "הערות אישור",
    status: "מצב",
    stale: "הדרישה המקושרת השתנתה או הוסרה — יש לבדוק או למחוק שאלה זו.",
    auto: "נוספה אוטומטית",
    sectionGlass: "זכוכית",
    sectionAllGlass: "כל הזכוכית",
    sectionHardware: "פרזול",
    sectionShading: "וילונות / הצללה",
    askSupplier: "לשאול את הספק",
    asked: "השאלה נוספה",
    general: "כללי",
  },
  qt: {
    glass_config: "האם תוכלו לספק את תצורת הזכוכית הזו למערכת החלון ולמידות שנבחרו?",
    lowe_solar: "אילו מוצרי Low-E ובקרת שמש אתם מציעים?",
    uv: "איזו הגנת UV זמינה, והאם תוכלו לספק דף נתוני ביצועים?",
    integrated_blinds: "האם תוכלו לספק וילונות מובנים? אילו שיטות הפעלה, צבעים, דרישות מרווח ומגבלות מידה חלים?",
    hardware_compat: "אילו אפשרויות ידיות, צירים, גלגלות, מסילות ונעילה תואמות?",
    hardware_set: "האם סט הפרזול המלא כלול? נא לפרט מה אינו כלול ואילו אביזרים מתומחרים בנפרד.",
    accessory_catalog: "נא לספק את קטלוג האביזרים, מספרי דגם/מק״ט, הגימורים הזמינים ואפשרויות חלפים.",
    subdivisions: "האם תוכלו לייצר את החלוקות המשורטטות? נא לציין שינויים נדרשים.",
    alternatives: "נא לתמחר את התצורה שנבחרה ואת החלופות המבוקשות בנפרד.",
    option_unverified: "האם תוכלו לספק {option} למערכת החלון ולמידות שנבחרו? נא לאשר זמינות והתאמה.",
    accessory: "{accessory}: נא לציין דגם/מק״ט תואם, גימור וכמות, והאם הוא כלול באספקת החלון המלא.",
    glass_recommend: "נא להמליץ על מבנה ועיבוד זכוכית מתאימים לפריט זה ולציין את ערכי הביצועים.",
    shading_recommend: "נא להמליץ על פתרון וילון או הצללה מתאים לפריט זה, כולל אופן הפעלה ומגבלות מידה.",
  },
  qStatus: { open: "פתוחה", answered: "נענתה", resolved: "סגורה" },
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

/** Position from the edges the section touches, so a section that reaches the bottom is always "bottom". */
function positionWords(lang: RfqLanguage, r: CmRect, w: number, h: number): string {
  const L = dict(lang).layout;
  const tol = Math.max(0.2, Math.max(w, h) * 0.002);
  const parts: string[] = [];
  if (r.h < h - tol) {
    if (r.y <= tol) parts.push(L.pos_top);
    else if (r.y + r.h >= h - tol) parts.push(L.pos_bottom);
    else parts.push(L.pos_middle);
  }
  if (r.w < w - tol) {
    const cx = (r.x + r.w / 2) / w;
    if (r.x <= tol) parts.push(L.pos_left);
    else if (r.x + r.w >= w - tol) parts.push(L.pos_right);
    else parts.push(cx < 0.45 ? L.pos_centerLeft : cx > 0.55 ? L.pos_centerRight : L.pos_center);
  }
  return parts.join("-");
}

/** Panel titles by panel id. Simple side-by-side layouts keep the original "Panel 1 (left)" wording. */
export function panelTitles(lang: RfqLanguage, item: RfqItem): Map<string, string> {
  const out = new Map<string, string>();
  const w = item.widthCm && item.widthCm > 0 ? item.widthCm : 100;
  const h = item.heightCm && item.heightCm > 0 ? item.heightCm : 100;
  const geo = layoutGeometry(item.layout, w, h);
  const simple = !isAdvancedLayout(item.layout);
  for (const p of geo.panels) {
    const base = simple ? panelTitle(lang, p.number - 1, geo.panels.length) : fmt(dict(lang).ui.panelN, { n: p.number });
    const pos = simple ? "" : positionWords(lang, p.rect, w, h);
    out.set(p.node.id, `${base}${pos ? ` (${pos})` : ""} ${ltr(`[P${p.number}]`)}`);
  }
  return out;
}

/** "P1", "P2" … by panel id (reading order, as numbered in the drawing). */
export function panelCodes(item: RfqItem): Map<string, string> {
  return new Map(panelLeaves(item.layout).map((p, i) => [p.id, `P${i + 1}`]));
}

/**
 * One line per panel with its position, nominal size and opening, e.g.
 * "Panel 3 (top-center) [P3] — 1970 × 980 mm: Fixed · glass divided … into G3 (…), G4 (…)".
 */
export function describePanels(lang: RfqLanguage, item: RfqItem): string[] {
  const d = dict(lang);
  const titles = panelTitles(lang, item);
  const known = !!(item.widthCm && item.heightCm);
  const geo = layoutGeometry(item.layout, known ? item.widthCm! : 100, known ? item.heightCm! : 100);
  const size = (r: CmRect) => ltr(formatSize(r.w, r.h, item.unit));
  return geo.panels.map((gp, i) => {
    const own = geo.glass.filter((g) => g.panelId === gp.node.id);
    const extra: string[] = [];
    if (own.length > 1) {
      const list = own.map((g) => (known ? `G${g.number} (${positionWords(lang, relRect(g.rect, gp.rect), gp.rect.w, gp.rect.h)}, ${size(g.rect)})` : `G${g.number}`));
      extra.push(fmt(d.layout.glassDivided, { list: list.join(", ") }));
    }
    for (const g of own) {
      const b = g.node.decorativeBars;
      if (b && (b.columns || b.rows)) extra.push(`G${g.number}: ${fmt(d.layout.decoText, { c: b.columns, r: b.rows })}`);
    }
    const title = titles.get(gp.node.id) ?? panelTitle(lang, i, geo.panels.length);
    return `${title}${known ? ` — ${size(gp.rect)}` : ""}: ${panelDescription(lang, item, i)}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
  });
}

const relRect = (r: CmRect, outer: CmRect): CmRect => ({ x: r.x - outer.x, y: r.y - outer.y, w: r.w, h: r.h });

/**
 * Where every mullion and transom is and what it separates, plus the running widths and heights between them.
 * Positions are measured from the left edge and from the top of the overall frame, viewed from outside.
 */
export function describeDivisionRows(lang: RfqLanguage, item: RfqItem): SpecRow[] {
  const L = dict(lang).layout;
  if (!item.widthCm || !item.heightCm) return [];
  const w = item.widthCm;
  const h = item.heightCm;
  const geo = layoutGeometry(item.layout, w, h);
  const codes = new Map(geo.panels.map((p) => [p.node.id, `P${p.number}`]));
  const dim = (cm: number) => formatDimension(cm, item.unit);
  const frame = geo.dividers.filter((d) => d.level === "frame");
  const rows: SpecRow[] = [];

  const describeLine = (orientation: "vertical" | "horizontal") => {
    const lines = frame.filter((d) => d.orientation === orientation);
    const span = orientation === "vertical" ? h : w;
    const positions: number[] = [];
    for (const v of lines.map((d) => d.pos).sort((a, b) => a - b)) if (!positions.length || v - positions[positions.length - 1] > 0.05) positions.push(v);
    return positions.map((pos) => {
      const here = lines.filter((d) => Math.abs(d.pos - pos) <= 0.05);
      const covered = here.reduce((s, d) => s + (d.end - d.start), 0);
      const at = ltr(`${dim(pos)} ${item.unit}`);
      if (covered >= span - 0.1) return fmt(orientation === "vertical" ? L.mullionFull : L.transomFull, { pos: at });
      const before: string[] = [];
      const after: string[] = [];
      for (const p of geo.panels) {
        const r = p.rect;
        const lo = orientation === "vertical" ? r.y : r.x;
        const hi = lo + (orientation === "vertical" ? r.h : r.w);
        const touches = here.some((d) => Math.min(hi, d.end) - Math.max(lo, d.start) > 0.1);
        if (!touches) continue;
        const end = orientation === "vertical" ? r.x + r.w : r.y + r.h;
        const start = orientation === "vertical" ? r.x : r.y;
        if (Math.abs(end - pos) <= 0.05) before.push(codes.get(p.node.id)!);
        if (Math.abs(start - pos) <= 0.05) after.push(codes.get(p.node.id)!);
      }
      return fmt(orientation === "vertical" ? L.mullionPart : L.transomPart, { pos: at, a: ltr(before.join(", ")), b: ltr(after.join(", ")) });
    });
  };

  const chain = (cuts: number[], total: number) => {
    const stops = [0, ...cuts, total];
    return ltr(`${stops.slice(1).map((v, i) => dim(v - stops[i])).join(" | ")} ${item.unit}`);
  };

  const vertical = describeLine("vertical");
  const horizontal = describeLine("horizontal");
  const cutsOf = (o: "vertical" | "horizontal") => {
    const out: number[] = [];
    for (const v of frame.filter((d) => d.orientation === o).map((d) => d.pos).sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 0.05) out.push(v);
    return out;
  };

  rows.push({ label: L.mullions, value: vertical.length ? fmt(L.countLines, { n: vertical.length }) : L.noneDivision });
  vertical.forEach((line) => rows.push({ label: "", value: line }));
  if (vertical.length) rows.push({ label: L.widthChain, value: chain(cutsOf("vertical"), w) });
  rows.push({ label: L.transoms, value: horizontal.length ? fmt(L.countLines, { n: horizontal.length }) : L.noneDivision });
  horizontal.forEach((line) => rows.push({ label: "", value: line }));
  if (horizontal.length) rows.push({ label: L.heightChain, value: chain(cutsOf("horizontal"), h) });
  return rows;
}

export function optionLabel(lang: RfqLanguage, key: string): string {
  const d = dict(lang);
  const [group, sub, value] = key.split(".");
  if (group === "glass") {
    if (sub === "construction") return d.construction[value as GlazingConstruction] ?? key;
    if (sub === "treatment") return d.treatment[value as GlassTreatment] ?? key;
    if (sub === "appearance") return d.appearance[value as GlassAppearance] ?? key;
    if (sub === "coating") return d.coating[value as GlassCoating] ?? key;
  }
  if (group === "shading") return d.shadingType[sub as ShadingType] ?? key;
  if (group === "hardware") return d.accKind[sub as AccessoryKind] ?? key;
  return key;
}

export function accessoryLabel(lang: RfqLanguage, kind: string): string {
  return dict(lang).accKind[kind as AccessoryKind] ?? kind;
}

/** One-line glass summary plus detail lines; unknown parts are reported as "supplier to propose/confirm". */
export function describeGlass(lang: RfqLanguage, s: GlassSpec): string[] {
  const d = dict(lang);
  const G = d.glass;
  if (isGlassSpecBlank(s)) return [G.supplierConfirm];
  // User-typed parts are isolated (keep their own direction); the mm make-up always reads left to right.
  const u = (v: string) => auto(v.trim());
  const main: string[] = [];
  if (s.construction !== "unspecified") main.push(d.construction[s.construction] + (s.constructionNote.trim() ? ` (${u(s.constructionNote)})` : ""));
  if (s.treatment !== "unspecified") main.push(d.treatment[s.treatment]);
  if (s.appearance !== "unspecified") {
    const extra = [s.appearance === "tinted" ? s.tintColor.trim() : "", s.appearanceNote.trim()].filter(Boolean).map(auto).join(", ");
    main.push(d.appearance[s.appearance] + (extra ? ` (${extra})` : ""));
  }
  for (const c of s.coatings) main.push(c === "custom" && s.customRequirement.trim() ? `${d.coating.custom}: ${u(s.customRequirement)}` : d.coating[c]);
  if (s.askRecommendation) main.push(d.construction.supplier);
  const lines: string[] = [];
  if (main.length) lines.push(main.join(", "));
  const makeup = formatMakeup(s, (f) => d.fill[f]);
  if (makeup) lines.push(`${G.makeupLabel}: ${ltr(makeup)}`);
  if (s.interlayer.trim()) lines.push(`${G.lamination}: ${u(s.interlayer)}`);
  if (s.coatingProduct.trim() || s.coatingSurface.trim()) {
    lines.push(`${G.coatingInfo}: ${[s.coatingProduct.trim() ? u(s.coatingProduct) : "", s.coatingSurface.trim() ? `${G.surface} ${u(s.coatingSurface)}` : ""].filter(Boolean).join(", ")}`);
  }
  const perf = (p: GlassSpec["required"]) =>
    PERFORMANCE_KEYS.filter((k) => p[k].trim())
      .map((k) => `${d.perf[k]}: ${u(p[k])}`)
      .join(" · ");
  if (perf(s.required)) lines.push(`${G.required}: ${perf(s.required)}`);
  if (perf(s.declared)) lines.push(`${G.declared}: ${perf(s.declared)}`);
  const gaps = glassGaps(s);
  if (gaps.length) lines.push(fmt(G.missing, { list: gaps.map((g) => d.gap[g]).join(", ") }));
  if (s.notes.trim()) lines.push(u(s.notes));
  return lines;
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
  const glassCount = numberedGlass(item.layout).length;
  if (glassCount > item.panels.length) extras.push(fmt(d.layout.summaryGlass, { n: glassCount }));
  return [`${panelsWord}: ${opsText}`, ...extras].join(" · ");
}

/**
 * `user` marks values typed by the user (kept exactly as written, own text direction).
 * `heading` starts a sub-section; `alt` rows belong to the requested alternatives (kept apart from the main configuration).
 */
export type SpecRow = { label: string; value: string; user?: boolean; heading?: boolean; alt?: boolean };

function glassRows(lang: RfqLanguage, item: RfqItem): SpecRow[] {
  const d = dict(lang);
  const rows: SpecRow[] = [];
  const glass = numberedGlass(item.layout);
  const overrides = item.openingType === "custom" ? [] : glass.filter((g) => g.glass.override);
  const defaultUsers = item.openingType === "custom" ? [] : glass.filter((g) => !g.glass.override);
  const label =
    glass.length <= 1 || item.openingType === "custom"
      ? d.ui.glass
      : overrides.length
        ? defaultUsers.map((g) => `G${g.number}`).join(", ")
        : `${d.glass.summaryDefault} (G1–G${glass.length})`;
  if (item.openingType === "custom" || defaultUsers.length) {
    describeGlass(lang, item.glassSpec).forEach((v, i) => rows.push({ label: i === 0 ? label : "", value: v }));
  }
  for (const g of overrides) {
    describeGlass(lang, g.glass.override!).forEach((v, i) => rows.push({ label: i === 0 ? `G${g.number} (P${g.panelNumber})` : "", value: v }));
  }
  if (item.glass.trim()) rows.push({ label: d.glass.legacyText.replace(/\s*\(.*\)$/, ""), value: item.glass.trim(), user: true });
  return rows;
}

function shadingRows(lang: RfqLanguage, item: RfqItem): SpecRow[] {
  const d = dict(lang);
  const S = d.shade;
  const codes = panelCodes(item);
  const rows: SpecRow[] = [];
  const u = (v: string) => auto(v.trim());
  const bare = (label: string) => label.replace(/\s*\(.*\)$/, "");
  for (const s of item.shading) {
    const target =
      s.type === "integrated"
        ? glassForEntry(item, s.appliesTo).map((g) => `G${g.number}`).join(", ")
        : s.appliesTo.length
          ? s.appliesTo.map((id) => codes.get(id) ?? "").filter(Boolean).join(", ")
          : S.wholeItem;
    const parts = [
      s.type === "other" && s.customType.trim() ? `${d.shadingType.other}: ${u(s.customType)}` : d.shadingType[s.type],
      target ? `${S.appliesTo}: ${target}` : "",
      s.operation !== "unspecified" ? `${S.operation}: ${d.shadingOp[s.operation]}` : "",
      s.color.trim() ? `${S.color}: ${u(s.color)}` : "",
      s.control.trim() ? `${bare(S.control)}: ${u(s.control)}` : "",
      s.location.trim() ? `${S.location}: ${u(s.location)}` : "",
      s.dimensions.trim() ? `${bare(S.dimensions)}: ${u(s.dimensions)}` : "",
      s.installation.trim() ? `${bare(S.installation)}: ${u(s.installation)}` : "",
      `${S.confirmation}: ${d.availability[s.confirmation]}`,
    ].filter(Boolean);
    rows.push({ label: "", value: parts.join(" · ") });
    if (s.notes.trim()) rows.push({ label: "", value: s.notes.trim(), user: true });
  }
  if (item.shutter !== "unspecified") rows.push({ label: S.shutterLegacy, value: d.requirement[item.shutter] });
  return rows;
}

function hardwareRows(lang: RfqLanguage, item: RfqItem): SpecRow[] {
  const d = dict(lang);
  const H = d.hw;
  const codes = panelCodes(item);
  const rows: SpecRow[] = [];
  const u = (v: string) => auto(v.trim());
  if (item.completeHardwareSet) rows.push({ label: "", value: H.completeSetOn });
  for (const a of item.accessories.filter(isAccessoryUsed)) {
    const name = a.kind === "custom" ? a.customName.trim() || d.accKind.custom : d.accKind[a.kind];
    const parts = [
      d.accMode[a.mode],
      a.quantity != null ? `${H.qty} ${a.quantity}` : "",
      a.model.trim() ? `${H.model.replace(/\s*\(.*\)$/, "")}: ${u(a.model)}` : "",
      a.finish.trim() ? `${H.finish}: ${u(a.finish)}` : "",
      a.compatibility.trim() ? `${H.compatibility}: ${u(a.compatibility)}` : "",
      a.appliesTo.length ? `${H.appliesTo}: ${a.appliesTo.map((id) => codes.get(id) ?? "").filter(Boolean).join(", ")}` : "",
      `${H.confirmation}: ${d.availability[a.confirmation]}`,
    ].filter(Boolean);
    rows.push({ label: name, value: parts.join(" · ") });
    if (a.notes.trim()) rows.push({ label: "", value: a.notes.trim(), user: true });
  }
  if (item.hardware.trim()) rows.push({ label: H.generalNotes, value: item.hardware.trim(), user: true });
  return rows;
}

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
    if (item.swing && OPENING_TYPE_DEFS[item.openingType].swing) rows.push({ label: d.ui.swing, value: d.swing[item.swing] });
    if (item.activeLeaf) rows.push({ label: d.ui.activeLeaf, value: d.side[item.activeLeaf] });
    rows.push({ label: d.layout.layoutHeading, value: d.layout.layoutNote, heading: true });
    rows.push(...describeDivisionRows(lang, item));
    rows.push({ label: d.layout.panelsBySize, value: d.layout.panelsBySizeNote });
    describePanels(lang, item).forEach((line) => rows.push({ label: "", value: line }));
  }
  rows.push({ label: d.ui.tabGlass, value: "", heading: true });
  rows.push(...glassRows(lang, item));
  const shading = shadingRows(lang, item);
  if (shading.length) rows.push({ label: d.shade.title.replace(/\s*\(.*\)$/, ""), value: "", heading: true }, ...shading);
  const hardware = hardwareRows(lang, item);
  if (hardware.length) rows.push({ label: d.hw.title, value: "", heading: true }, ...hardware);
  if (item.frameFinish.trim() || item.otherRequirements.trim() || item.notes.trim()) rows.push({ label: d.ui.otherRequirements, value: "", heading: true });
  user(d.ui.frameFinish, item.frameFinish);
  user(d.ui.otherRequirements, item.otherRequirements);
  user(d.ui.itemNotes, item.notes);
  const alts = item.alternatives.filter((a) => a.description.trim());
  if (alts.length) {
    rows.push({ label: d.ui.alternatives, value: d.ui.alternativesHint, heading: true, alt: true });
    alts.forEach((a, i) => rows.push({ label: fmt(d.ui.alternativeN, { n: i + 1 }), value: a.description.trim(), user: true, alt: true }));
  }
  return rows;
}
