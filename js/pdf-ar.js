/* Arabic for the PDF offer.
 *
 * SEPARATE FROM js/i18n.js ON PURPOSE. i18n.js translates the app, and its
 * strings are written for a screen an agent is scrolling. This file translates
 * a document that goes to a customer, and a good many of its strings have no
 * counterpart on screen at all — page titles, the table's column heads, the
 * cover. Merging them would mean one dictionary where half the entries are only
 * ever used by one of the two consumers, which is how a key ends up translated
 * for the screen and forgotten for the document.
 *
 * WHERE THE MARKETING COPY CAME FROM, which matters more than the labels
 *
 * Playbook rule 4: the client's description and advantages are used VERBATIM
 * and we do not write their prose. The English in js/config.js is itself a
 * literal rendering of the client's Arabic catalogue ("cataloue qomor arabic
 * partneres final.pdf", supplied 2026-08-13). So the Arabic here is NOT a
 * translation of that English — that would be a round trip through a second
 * language and would come back subtly not theirs. It is read straight off the
 * client's own slides:
 *
 *   PROJECT.features   p21  مميزات المشروع
 *   PROJECT.services   p20  خدمات المشروع
 *   PROJECT.nearby     p7   within Badr City
 *   PROJECT.reach      p5   the wider east Cairo
 *   PROJECT.mix        p10  عن قمر بيزنس بلازا
 *   PROJECT.levels     p10  the same table
 *
 * Two places where their slides and CONFIG do not line up, both deliberate:
 *
 *   · The catalogue lists TEN services; CONFIG lists eight. It also splits
 *     security into "أمن على مدار ٢٤ ساعة" and "كاميرات مراقبة ٢٤ ساعه", which
 *     CONFIG carries as one line. The Arabic follows CONFIG's list so the two
 *     languages describe the same project — a customer handed both must not
 *     find a service in one and not the other. Their "مخارج طوارئ" (emergency
 *     exits) is therefore absent from BOTH, because it is absent from CONFIG.
 *     Adding it is a CONFIG change, in both languages at once.
 *   · Their slides set every figure in Arabic-Indic digits (٢٤, ١٧,٠٠٠). This
 *     document keeps Western digits in both languages, on the client's own
 *     standing instruction — the numbers have to match the contract the
 *     customer signs. See the header of js/i18n.js.
 */

const PDF_STRINGS = {
  /* Page furniture --------------------------------------------------------- */
  'page.location': 'الموقع',
  'page.place': 'المكان',
  /* The tanween is encoded AFTER its alef ("وليلاً", not "وليلًا"). Both spellings
     are seen and both render the same, but a mark sitting BETWEEN a lam and an
     alef has to be re-emitted after the lam-alef ligature — the pair becomes one
     glyph, so there is nowhere else for it to go — and the text then no longer
     round-trips character for character. Keeping marks off that seam means the
     shaping test can stay an exact equality. */
  'page.placeSub': 'نهاراً وليلاً',
  'page.medical': 'الدور الطبي',
  'page.building': 'المبنى',
  'bld.name': 'مبنى {id}',
  'page.floor': 'الدور',
  'page.unit': 'الوحدة',
  'page.payment': 'خطة السداد',

  /* The terms page, restored 2026-08-18 at the client's request. These four
     mirror the keys in CONFIG.TERMS_ORDER — `rounding` is absent from both, so
     there is no term here that the customer never sees, and none missing that
     they do. */
  'page.terms': 'الشروط',
  'terms.title': 'ما يفترضه هذا العرض',
  'terms.finalPrice': 'تُحتسب خطة الأقساط على السعر النهائي بعد خصم الوحدة، وليس على إجمالي سعر الوحدة.',
  /* WESTERN DIGITS, "10%" and "42" — not ١٠٪ and ٤٢.
     Two reasons, and either alone is decisive. The embedded Arabic font has no
     Arabic-Indic digits, so they are dropped by the sanitiser: the first draft
     of this line printed "تُحتسب الصيانة بنسبة  على السعر النهائي" with the
     figure simply missing, which is worse than wrong because it still reads as
     a sentence. And the client's standing rule is that numbers stay Western so
     they match the contract the customer signs. */
  'terms.maintenance': 'تُحتسب الصيانة بنسبة 10% على السعر النهائي نفسه، وتُسدَّد دفعة واحدة في الشهر 42.',
  'terms.firstInstalment': 'يُستحق القسط الربع سنوي الأول بعد ثلاثة أشهر من التعاقد.',
  'terms.noFees': 'لا تُضاف رسوم نادي أو انتظار أو جراج أو مخزن أو رسوم إدارية. يُدرج سعر الجراج وسعر المخزن في جداول الخطة كبنود منفصلة غير متاحة حالياً.',
  'terms.avail': 'الأسعار والإتاحة',
  'terms.availBody': 'صدر هذا العرض في {date} من المخزون المباشر. قد تتغير الأسعار وخصم الوحدة والإتاحة دون إشعار، ولا تُحجز الوحدة إلا بعد توقيع استمارة الحجز وسداد الدفعة المقدمة.',

  /* The credits need Arabic CONNECTORS, not just Arabic names. Built from
     English words ("Developed by", "Architecture by") around Arabic names, the
     line came out reordered and unreadable — the bidi algorithm moves the Latin
     runs, and the reader gets "الشحري للتطوير العقاري Developed by". The
     company names themselves stay Latin where they have no Arabic form, which
     is the same rule the building letters follow. */
  'terms.credits': '{name} · تطوير {dev} · تصميم معماري {consultant}',
  'terms.partners': 'بالشراكة مع {partners}',
  /* Spaced, not the usual prefixed و. The conjunction normally attaches to
     the word after it, but both partner names are Latin and "وKunuz" glues an
     Arabic letter onto a Latin word, which shapes badly and reads worse. */
  'terms.and': ' و ',

  'foot.indicative': 'عرض استرشادي — مرهون بالإتاحة وقت التعاقد.',
  'foot.unit': '{name} · {location} · وحدة {code}',

  /* Cover ------------------------------------------------------------------ */
  'cover.offer': 'عرض سعر',
  'cover.unit': 'وحدة {code}',
  'cover.by': '{location}  ·  من تطوير {developer}',

  /* Location --------------------------------------------------------------- */
  'loc.within': 'داخل مدينة بدر',
  'loc.wider': 'شرق القاهرة',
  'loc.maps': 'افتح الموقع على خرائط جوجل',

  /* The project ------------------------------------------------------------ */
  'proj.eyebrow': 'المشروع',
  'proj.builtUp': 'المساحة البنائية الإجمالية',
  'proj.mixedUse': 'إجمالي مساحة المشروع',
  'proj.mix': 'توزيع المساحات',
  'proj.building': 'مكونات المشروع',
  'proj.features': 'مميزات المشروع',
  'proj.services': 'خدمات المشروع',

  /* Renders ---------------------------------------------------------------- */
  'render.note': 'صور تخيلية للمشروع. التشطيبات وأعمال اللاندسكيب استرشادية.',
  'render.clinicNote': 'صور تخيلية للدور الطبي. التشطيب استرشادي.',

  /* Unit offer title page --------------------------------------------------- */
  'offer.title': 'عرض الوحدة',
  'offer.area': 'المساحة',
  'offer.yourPrice': 'سعرك',
  'offer.plan': 'خطة السداد',
  'offer.prepared': 'تحرر في',

  /* Your building / your floor ---------------------------------------------- */
  'bld.highlighted': '{building} مميّز في الصورة. وحدتك {code} في {floor}.',
  'bld.plain': '{building}. وحدتك {code} في {floor}.',
  'floor.pinned': '{prefix}{plan}. الوحدة {code} محددة على الرسمة.',
  'floor.unpinned': 'رسمة {plan}. الموضع الدقيق للوحدة {code} يُعتمد على الرسم المختوم.',

  /* Your unit --------------------------------------------------------------- */
  'unit.title': 'وحدة {code}',
  'unit.building': 'المبنى',
  'unit.floor': 'الدور',
  'unit.type': 'النوع',
  'unit.area': 'المساحة',
  'unit.outdoor': 'المساحة الخارجية',
  'unit.price': 'السعر',
  'unit.yourPrice': 'سعرك',
  'unit.listPrice': 'السعر قبل الخصم',
  'unit.discount': 'خصم {pct}',
  'unit.save': 'توفّر {amount}',
  'unit.saveNote': 'خصم {pct} من السعر قبل الخصم. خطة السداد التالية محسوبة على سعرك.',

  /* Payment plan ------------------------------------------------------------ */
  'pay.title': 'خطة {label}',
  'pay.sub': 'وحدة {code} · {label}',
  'pay.down': 'المقدم',
  'pay.quarterly': 'القسط الربع سنوي',
  'pay.instalments': 'عدد الأقساط',
  'pay.maintenance': 'الصيانة {pct}',
  'pay.total': 'إجمالي المدفوع',
  'pay.delivery': 'التسليم',

  /* Reworked 2026-08-16 to the layout the client sent: the year is a column
     carrying the year's share of the price, and the old "الاستحقاق" column —
     which repeated "السنة 1 + 3 أشهر" on every row — is gone. */
  'tbl.year': 'السنة',
  'tbl.payment': 'الدفعة',
  'tbl.date': 'التاريخ',
  'tbl.amount': 'المبلغ (EGP)',
  'tbl.pct': '%',
  'tbl.yearly': '% سنوي',
  'tbl.dp': 'المقدم',
  /* The instalment number alone. The count is in the summary above the table,
     and repeating "من 40" forty times is what the client asked to be rid of. */
  'tbl.inst': 'قسط {i}',
  'tbl.instMilestone': 'قسط {i} +{pct}',

  /* The year label for the schedule's Year column. Duplicated from i18n.js
     rather than imported because the PDF must not depend on the app's screen
     dictionary being loaded — scripts/test-pdf.js builds a document with no UI
     at all. The "when.*" set that sat beside it went with the Due column on
     2026-08-16. */
  'band.year': 'السنة {y}',
};

/**
 * Arabic for values that arrive from CONFIG.
 *
 * Keyed on the exact English string, exactly as DATA_AR in i18n.js is, and with
 * the same fall-through: anything not listed appears unchanged rather than
 * vanishing. A feature the client adds to config.js therefore still prints — in
 * English, visibly needing translation — instead of silently leaving a gap in
 * the middle of the page.
 */
const PDF_DATA_AR = {
  /* p10, the client's own table. Their full labels are sentences
     ("مخصصة للمساحات التجارية"); these are the noun phrases from them, because
     this is a two-column list beside a figure and not prose. */
  mix: {
    'Retail': 'مساحات تجارية',
    'Offices': 'مكاتب إدارية',
    'Medical centre': 'مركز طبي متكامل',
  },
  levels: {
    'Ground Plaza': 'بلازا أرضية',
    'Sky Plaza': 'بلازا علوية',
    'Sky Strip': 'ممشى علوي',
    'Parking': 'ساحة انتظار أسفل المول',
    'Hypermarket': 'هايبر ماركت',
  },
  /* p21 مميزات المشروع, verbatim. Show Room / Kids Area / sky plaza are set in
     Latin on the client's own slide beside their Arabic, and brand-style names
     are not translated — same rule as i18n.js. */
  features: {
    'The first sky strip mall in Egypt': 'أول سكاي ستريب مول في مصر',
    'Restaurant cluster': 'مجمع مطاعم',
    'Sky Plaza': 'سكاي بلازا',
    'Bank cluster': 'مجمع بنوك',
    'Show rooms': 'شوو رووم',
    'Kids area': 'كيدز اريا',
    'Welcome fountain': 'نافورة ترحيبية',
    'Gym': 'صالة ألعاب رياضية',
  },
  /* p20 خدمات المشروع, verbatim — except the security line, which is the
     client's two slides merged because CONFIG carries them as one. */
  services: {
    'High-speed fibre-optic internet': 'انترنت فائق السرعة (فايبر أوبتكس)',
    '24-hour security and CCTV': 'أمن وكاميرات مراقبة على مدار 24 ساعة',
    'Dedicated clinic entrances': 'مداخل خاصة للعيادات',
    'Integrated fire safety system': 'منظومة متكاملة للسلامة ومكافحة الحرائق',
    'Service corridors for restaurants and retail': 'ممرات خدمة للمطاعم والوحدات التجارية',
    'Advanced air-conditioning': 'أنظمة تكييف متطورة',
    'Baby care room': 'غرفة رعاية رضع',
    'Step-free access throughout': 'مشروع صديق لذوي الاحتياجات الخاصة',
  },
  /* p7 and p5. The destinations only — the durations are built by minutes(). */
  places: {
    'Badr University': 'جامعة بدر',
    'Tourist Walkway': 'الممشى السياحي',
    'Egyptian-Russian University': 'الجامعة الروسية',
    'Industrial Zone': 'المنطقة الصناعية',
    'Suez Road': 'طريق السويس',
    'Cairo–Ismailia Road': 'طريق مصر إسماعيلية',
    'Shorouk City': 'مدينة الشروق',
    'Madinaty': 'مدينتي',
    'Obour City': 'مدينة العبور',
    'New Administrative Capital': 'العاصمة الإدارية الجديدة',
    '10th of Ramadan City': 'مدينة العاشر من رمضان',
    'New Cairo (Fifth Settlement)': 'القاهرة الجديدة (التجمع الخامس)',
  },
  /* The project's own name and address, as the CLIENT writes them.
   *
   * This is the one place the "brand names are not translated" rule bends, and
   * it bends because the client bent it first: their catalogue's own title
   * slide reads "عن قمر بيزنس بلازا" and their developer credit reads "الشحري
   * للتطوير العقاري". Printing the Latin forms on an otherwise Arabic document
   * would be us overriding their house style, not respecting it. The WORDMARK
   * stays Latin throughout — it is an image of a logo, not a run of text. */
  name: { 'Qomor Business Plaza': 'قمر بيزنس بلازا' },
  location: { 'Badr City, Cairo': 'مدينة بدر، القاهرة' },
  developer: { 'El Shihry Developments': 'الشحري للتطوير العقاري' },

  /* CONFIG's own vocabulary, shared with the app's DATA_AR. */
  type: { Retail: 'تجاري', Medical: 'طبي', Admin: 'إداري' },
  floor: {
    'First Floor': 'الدور الأول',
    'Second Floor': 'الدور الثاني',
    'Third Floor': 'الدور الثالث',
  },
  plan: {
    '4 years': '4 سنوات', '6 years': '6 سنوات', '7 years': '7 سنوات',
    '8 years': '8 سنوات', '9 years': '9 سنوات', '10 years': '10 سنوات',
  },
  /* NO currency entry, deliberately. The user's instruction on 2026-08-15 was
     "for the numbers and EGP keep those in english": every figure on the offer
     has to match the contract the customer signs, and the contract says EGP.
     D() falls back to its English argument when a key is missing, so removing
     the mapping is the whole change — CONFIG.currency prints as EGP. */
};

/**
 * "2 min" -> "دقيقتان", "10 min" -> "10 دقائق", "15 min" -> "15 دقيقة".
 *
 * Arabic counts in three, not two: 2 has its own DUAL form and takes no digit
 * at all, 3–10 take the plural دقائق, and 11 and up go back to the singular
 * دقيقة. Printing "2 دقيقة" for every value would be wrong in two of the three
 * cases and reads as machine output. Anything that is not "<n> min" falls
 * through unchanged.
 */
function minutes(s) {
  const m = /^(\d+)\s*min$/.exec(String(s).trim());
  if (!m) return s;
  const n = Number(m[1]);
  if (n === 2) return 'دقيقتان';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

/* pWhen() lived here until 2026-08-16, alongside the Due column it filled. */

/** The year label for the schedule's Year column. Never called with year 0 —
 *  that row shows tbl.dp instead, as the client's layout does. */
function pBand(year) {
  return pt('band.year', { y: year });
}

/** Look a PDF string up and fill its {placeholders}. */
function pt(key, vars) {
  let s = PDF_STRINGS[key];
  if (s === undefined) return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : vars[name]));
}

/** Translate a CONFIG value. Unknown -> unchanged, deliberately. */
function pd(kind, value) {
  if (value == null) return value;
  const map = PDF_DATA_AR[kind];
  return (map && map[value] !== undefined) ? map[value] : value;
}

/** Every Arabic string in this file, for the round-trip test. */
function allStrings() {
  const out = Object.values(PDF_STRINGS);
  for (const map of Object.values(PDF_DATA_AR)) out.push(...Object.values(map));
  out.push(minutes('2 min'), minutes('5 min'), minutes('15 min'));
  /* The built strings too, not just the templates they come from. */
  for (const yr of [1, 2, 5, 10]) out.push(pBand(yr));
  return out;
}

if (typeof window !== 'undefined') {
  window.PDF_STRINGS = PDF_STRINGS;
  window.pt = pt; window.pd = pd; window.minutes = minutes;
  window.pBand = pBand;
}
if (typeof module !== 'undefined') {
  module.exports = { PDF_STRINGS, PDF_DATA_AR, pt, pd, minutes, pBand, allStrings };
}
