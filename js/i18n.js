/* Bilingual UI — English and Arabic, switched from the header.
 *
 * The client asked for Arabic on 2026-08-14. Three rules shaped this file:
 *
 * 1. NUMBERS STAY WESTERN. 1,404,000 reads as 1,404,000 in both languages, on
 *    the client's own instruction. Egyptian property paperwork is written that
 *    way, and Arabic-Indic digits would not match the contract the customer
 *    eventually signs. There is no digit conversion anywhere here, and dates
 *    are formatted en-GB in both languages — see DATE_LOCALE in app.js.
 *
 * 2. THE SHEET AND CONFIG STAY ENGLISH. They are the source of truth and the
 *    tests assert against them. Arabic is a presentation layer laid over the
 *    top: DATA_AR maps the English value coming out of the sheet to its Arabic
 *    equivalent, and anything unmapped falls through unchanged rather than
 *    disappearing. A new floor or unit type added by operations therefore still
 *    shows — in English — instead of vanishing from an Arabic screen.
 *
 * 3. BRAND NAMES ARE NOT TRANSLATED. "Qomor", "Sky Plaza", "El Shihry
 *    Developments" are names, not words. They appear as themselves in both
 *    languages, which is also how the client's own catalogue sets them.
 *
 * Not covered here: the PDF. jsPDF's Arabic support silently DROPS LETTERS —
 * proven 2026-08-14, see README — so the offer document stays English until
 * that is solved properly. Translating the app was deliberately done first.
 *
 * scripts/check-i18n.js holds the two tables to each other: every key used,
 * both languages in step, no placeholder in Arabic that English does not have.
 */

/* Arabic is the default: the sales team and their customers are Egyptian, and
 * this exists because the client asked for Arabic. English is one tap away and
 * the choice is remembered per device. Flip this constant to change the
 * default for everyone who has not chosen yet. */
const DEFAULT_LANG = 'ar';
const LANG_STORAGE = 'qomor.lang';

const STRINGS = {
  en: {
    'dir': 'ltr',
    /* Names for the two switch segments, in the language currently on screen. */
    'lang.en': 'English',
    'lang.ar': 'Arabic',

    'brand.strap': 'Business Plaza',
    'brand.by': 'By {developer}',
    'btn.refresh': 'Refresh',

    'sync.loading': 'Loading inventory…',
    'sync.reading': 'Reading the inventory sheet…',
    'sync.live': 'Live inventory',
    'sync.liveAt': '<b>{live}</b> · updated {time} ({ago})',
    'sync.offline': 'Offline copy',
    'sync.offlineAt': '<b>{offline}</b> · saved {date} — check availability before issuing an offer',
    'sync.counts': '{units} units · {available} available',

    'ago.now': 'just now',
    'ago.min': '{n} minute ago',
    'ago.mins': '{n} minutes ago',
    'ago.hour': '{n} hour ago',
    'ago.hours': '{n} hours ago',

    'step.1': 'Building',
    'step.1.hint': 'Tap a building on the view, or use the cards',
    'step.2': 'Floor',
    'step.3': 'Unit',
    'step.3.hint': '— {n} available on this floor',
    'step.4': 'Unit details',
    'step.4.hint': 'Price, payment plan and the offer',

    'building.switch': 'Switch building',
    'building.n': 'Building {id}',
    'building.available': '{n} available',
    'building.none': 'none available',
    'building.meta': '{available} available of {total}',
    'building.tapHint': 'Tap a building on the view',
    'floor.none': 'None available',
    'floor.notReleased': 'Not released',

    'plan.legend': 'Available units only',
    'plan.alt': '{floor} plan',
    'plan.nonePinned': 'No units are pinned on the {floor} drawing yet — pick from the panel, every available unit is listed there.',
    'plan.somePinned': '{pinned} of {total} units are pinned on this drawing; the rest are in the panel.',

    'filter.title': 'Filter & sort',
    'filter.type': 'Type',
    'filter.any': 'Any',
    'filter.sort': 'Sort',
    'filter.someShown': '{shown} of {total} available shown',
    'sort.unit': 'Unit number',
    'sort.price': 'Price, low to high',
    'sort.price-desc': 'Price, high to low',
    'sort.area': 'Area, small to large',
    'sort.area-desc': 'Area, large to small',
    'empty.filter': 'Nothing matches this filter.',
    'empty.floor': 'Nothing available on this floor.',

    'unit.unit': 'Unit',
    'unit.floor': 'Floor',
    'unit.type': 'Type',
    'unit.area': 'Area',
    'unit.outdoor': 'Outdoor',
    'unit.listPrice': 'List price',
    'unit.discount': 'Discount {pct}',
    'unit.priceAfter': 'Price after discount',
    'unit.price': 'Price',
    'unit.meterPrice': 'Price per m²',
    'unit.meterPriceOutdoor': 'Outdoor price per m²',
    /* Two rates on one line, list then discounted, because the agent is asked
       for "the metre price" as a single answer and reads it off mid-call. */
    'unit.rateWas': '{list} → {now} {currency}/m²',
    'unit.rateFlat': '{now} {currency}/m²',
    'unit.status': 'Status: {status}',

    'pay.plan': 'Payment plan',
    'pay.option': '{label} — {down} down · {n} quarterly instalments',
    'pay.down': 'Down payment',
    'pay.quarterly': 'Quarterly',
    'pay.instalments': 'Instalments',
    'pay.maintenance': 'Maintenance {pct}',
    'pay.total': 'Total payable',
    'pay.delivery': 'Delivery',
    'pay.planOf': '{label} plan',

    'save.headline': 'You save {amount} {currency}',
    'save.detail': '{pct} off — list price {list} {currency}, your price {price} {currency}. The instalment plan below is calculated on the discounted price.',

    /* The schedule columns, reworked 2026-08-16 against a layout the client
       sent: Year | Installment | Date | Amount | % | Yearly %. The old "Due"
       column carried "Year 1 + 3 months" on every row, which the client called
       out by name as the thing making the table hard to read. The year now
       appears once, on the row it starts. */
    'table.year': 'Year',
    'table.payment': 'Installment',
    'table.date': 'Date',
    'table.amount': 'Amount (EGP)',
    'table.pct': '%',
    'table.yearly': 'Yearly %',
    'table.total': 'Total',
    'table.dp': 'DP',

    'row.down': 'Down Payment',
    /* "Inst. 4", not "Instalment 4 of 40" — the count is already in the
       Installments summary above the table, and repeating it forty times is
       what the client asked to be rid of. */
    'row.instalment': 'Inst. {i}',
    'row.instalmentMilestone': 'Inst. {i} +{pct}',
    'row.maintenance': 'Maintenance {pct}',
    /* The "when.*" set — "Year 1 + 3 months" and friends — went with the Due
       column on 2026-08-16. It was the phrasing the client named as the thing
       making the schedule hard to read, so it is deleted rather than left
       lying around for someone to reinstate. */
    'band.year': 'Year {y}',

    'offer.send': 'Send offer on WhatsApp',
    'offer.preparing': 'Preparing…',
    'offer.shared': 'Sent to the share sheet.',
    'offer.downloadedTab': 'PDF downloaded — attach it in the WhatsApp tab that just opened.',
    'offer.downloaded': 'PDF downloaded. ',
    'offer.openWhatsapp': 'Open WhatsApp',
    'offer.englishFallback': 'This offer came out in ENGLISH — the Arabic pack did not load. Close the app completely, reopen it and try again before sending.',

    'footer.assumptions': 'Assumptions pending a signed sample offer:',
    'warn.one': 'One note from the sheet',
    'warn.many': '{n} notes from the sheet',
    'warn.stale': 'Could not reach the live sheet, so these prices may be out of date.',

    'err.notAvailable': '{code} is not available.',
    'err.noLonger': '{code} is no longer available — it is now "{status}".',
    'err.removed': 'That unit has been removed from the sheet.',
    'err.badLink': 'This link points at {code}, which is not in the sheet.',
    'err.footing': '⚠ Schedule sums to {paid} but the price is {price} — do not issue this offer.',
  },

  ar: {
    'dir': 'rtl',
    'lang.en': 'الإنجليزية',
    'lang.ar': 'العربية',

    'brand.strap': 'بيزنس بلازا',
    'brand.by': 'من تطوير {developer}',
    'btn.refresh': 'تحديث',

    'sync.loading': 'جارٍ تحميل المخزون…',
    'sync.reading': 'جارٍ قراءة شيت المخزون…',
    'sync.live': 'مخزون مباشر',
    'sync.liveAt': '<b>{live}</b> · آخر تحديث {time} ({ago})',
    'sync.offline': 'نسخة غير متصلة',
    'sync.offlineAt': '<b>{offline}</b> · محفوظة {date} — راجع الإتاحة قبل إصدار أي عرض',
    'sync.counts': '{units} وحدة · {available} متاحة',

    'ago.now': 'الآن',
    'ago.min': 'منذ دقيقة',
    'ago.mins': 'منذ {n} دقيقة',
    'ago.hour': 'منذ ساعة',
    'ago.hours': 'منذ {n} ساعة',

    'step.1': 'المبنى',
    'step.1.hint': 'اضغط على المبنى في الصورة، أو اختر من القائمة',
    'step.2': 'الدور',
    'step.3': 'الوحدة',
    'step.3.hint': '— {n} متاحة في هذا الدور',
    'step.4': 'بيانات الوحدة',
    'step.4.hint': 'السعر وخطة السداد والعرض',

    'building.switch': 'تغيير المبنى',
    'building.n': 'مبنى {id}',
    'building.available': '{n} متاحة',
    'building.none': 'لا يوجد متاح',
    'building.meta': '{available} متاحة من {total}',
    'building.tapHint': 'اضغط على المبنى في الصورة',
    'floor.none': 'لا يوجد متاح',
    'floor.notReleased': 'لم تُطرح بعد',

    'plan.legend': 'الوحدات المتاحة فقط',
    'plan.alt': 'رسمة {floor}',
    'plan.nonePinned': 'لا توجد وحدات محدّدة على رسمة {floor} بعد — اختر من القائمة، فكل الوحدات المتاحة مدرجة بها.',
    'plan.somePinned': '{pinned} من {total} وحدة محدّدة على الرسمة، والباقي في القائمة.',

    'filter.title': 'تصفية وترتيب',
    'filter.type': 'النوع',
    'filter.any': 'الكل',
    'filter.sort': 'الترتيب',
    'filter.someShown': 'معروض {shown} من {total} متاحة',
    'sort.unit': 'رقم الوحدة',
    'sort.price': 'السعر: من الأقل للأعلى',
    'sort.price-desc': 'السعر: من الأعلى للأقل',
    'sort.area': 'المساحة: من الأصغر للأكبر',
    'sort.area-desc': 'المساحة: من الأكبر للأصغر',
    'empty.filter': 'لا توجد نتائج مطابقة لهذه التصفية.',
    'empty.floor': 'لا توجد وحدات متاحة في هذا الدور.',

    'unit.unit': 'الوحدة',
    'unit.floor': 'الدور',
    'unit.type': 'النوع',
    'unit.area': 'المساحة',
    'unit.outdoor': 'المساحة الخارجية',
    'unit.listPrice': 'السعر قبل الخصم',
    'unit.discount': 'خصم {pct}',
    'unit.priceAfter': 'السعر بعد الخصم',
    'unit.price': 'السعر',
    'unit.meterPrice': 'سعر المتر',
    'unit.meterPriceOutdoor': 'سعر المتر الخارجي',
    /* "m²" IN LATIN, NOT "م²", and this is load-bearing rather than a style
       choice. bidiSafe() only isolates a value that has no Arabic letter in it,
       so an Arabic "م" here left the run unisolated and the bidi algorithm
       reordered it: the list rate and the discounted rate swapped sides and the
       arrow pointed from the discount UP to the list price. Latin m² keeps the
       whole value one LTR atom, which is also what the area row above it and
       the PDF both already use. */
    'unit.rateWas': '{list} → {now} {currency}/m²',
    'unit.rateFlat': '{now} {currency}/m²',
    'unit.status': 'الحالة: {status}',

    'pay.plan': 'خطة السداد',
    'pay.option': '{label} — مقدم {down} · {n} قسط ربع سنوي',
    'pay.down': 'المقدم',
    'pay.quarterly': 'القسط الربع سنوي',
    'pay.instalments': 'عدد الأقساط',
    'pay.maintenance': 'الصيانة {pct}',
    'pay.total': 'إجمالي المدفوع',
    'pay.delivery': 'التسليم',
    'pay.planOf': 'خطة {label}',

    'save.headline': 'توفّر {amount} {currency}',
    'save.detail': 'خصم {pct} — السعر قبل الخصم {list} {currency}، وسعرك {price} {currency}. خطة الأقساط أدناه محسوبة على السعر بعد الخصم.',

    'table.year': 'السنة',
    'table.payment': 'الدفعة',
    'table.date': 'التاريخ',
    'table.amount': 'المبلغ (EGP)',
    'table.pct': '%',
    'table.yearly': '% سنوي',
    'table.total': 'الإجمالي',
    'table.dp': 'المقدم',

    'row.down': 'المقدم',
    'row.instalment': 'قسط {i}',
    'row.instalmentMilestone': 'قسط {i} +{pct}',
    'row.maintenance': 'الصيانة {pct}',
    'band.year': 'السنة {y}',

    'offer.send': 'إرسال العرض على واتساب',
    'offer.preparing': 'جارٍ التجهيز…',
    'offer.shared': 'تم الإرسال إلى قائمة المشاركة.',
    'offer.downloadedTab': 'تم تنزيل ملف PDF — أرفقه في نافذة واتساب التي فُتحت.',
    'offer.downloaded': 'تم تنزيل ملف PDF. ',
    'offer.openWhatsapp': 'فتح واتساب',
    'offer.englishFallback': 'خرج هذا العرض بالإنجليزية — لم تُحمّل حزمة اللغة العربية. أغلق التطبيق تمامًا ثم افتحه وأعد المحاولة قبل الإرسال.',

    'footer.assumptions': 'افتراضات في انتظار عرض موقّع من العميل:',
    'warn.one': 'ملاحظة واحدة من الشيت',
    'warn.many': '{n} ملاحظات من الشيت',
    'warn.stale': 'تعذّر الوصول إلى الشيت المباشر، وقد تكون هذه الأسعار قديمة.',

    'err.notAvailable': '{code} غير متاحة.',
    'err.noLonger': '{code} لم تعد متاحة — حالتها الآن "{status}".',
    'err.removed': 'تم حذف هذه الوحدة من الشيت.',
    'err.badLink': 'هذا الرابط يشير إلى {code} وهي غير موجودة في الشيت.',
    'err.footing': '⚠ مجموع الجدول {paid} بينما السعر {price} — لا تُصدر هذا العرض.',
  },
};

/**
 * Arabic for values that arrive from the SHEET or from CONFIG.
 *
 * Keyed on the exact English string, and anything not listed falls through
 * unchanged. That fall-through is deliberate: operations add floors and unit
 * types to the sheet without telling anyone, and an unrecognised value must
 * still appear on screen — in English — rather than silently becoming blank.
 *
 * "Sky Plaza" and "Ground Plaza" are absent on purpose. They are the client's
 * own names for those levels and are set in Latin in their own catalogue.
 */
const DATA_AR = {
  type: {
    Retail: 'تجاري',
    Medical: 'طبي',
    Admin: 'إداري',
  },
  typePlural: {
    retail: 'تجارية',
    clinics: 'عيادات',
    admin: 'إدارية',
  },
  floor: {
    'First Floor': 'الدور الأول',
    'Second Floor': 'الدور الثاني',
    'Third Floor': 'الدور الثالث',
  },
  plan: {
    '4 years': '4 سنوات',
    '6 years': '6 سنوات',
    '7 years': '7 سنوات',
    '8 years': '8 سنوات',
    '9 years': '9 سنوات',
    '10 years': '10 سنوات',
  },
  /* NO currency entry, deliberately — the same call the user made for the PDF
     on 2026-08-15, "for the numbers and EGP keep those in english", applied
     here so the screen and the document a customer is sent cannot disagree.
     td() returns its argument unchanged when a key is missing, so removing the
     mapping is the whole change and CONFIG.currency prints as EGP. */
};

/**
 * Arabic for CONFIG's ASSUMPTIONS, in the same order.
 *
 * These are the only long-form sentences the app shows that do not come from
 * the sheet, and they sat in English at the foot of every Arabic screen — the
 * single most visible untranslated thing in the app. They are kept here rather
 * than in config.js because config.js is the English source of truth: the PDF
 * prints from it and the test suite asserts on it.
 *
 * Held to the English list by LENGTH, not by index. Adding a sixth assumption
 * to config.js without adding its Arabic makes tAssumptions() fall back to the
 * whole English list rather than show five Arabic sentences and quietly lose
 * the sixth — and scripts/check-i18n.js fails the build for it.
 */
const ASSUMPTIONS_AR = [
  'خطة الأقساط محسوبة على السعر النهائي في الشيت (بعد خصم الوحدة)، وليس على إجمالي سعر الوحدة.',
  'الصيانة 9% محسوبة على نفس السعر النهائي، وتُدفع دفعة واحدة في الشهر 36.',
  'أول قسط ربع سنوي يستحق بعد 3 أشهر من التعاقد.',
  'فروق التقريب تُحمّل على القسط الأخير حتى يطابق مجموع الجدول السعر تمامًا.',
  'لا تُضاف رسوم نادي أو انتظار أو جراج أو مخزن أو رسوم إدارية. جداول الخطط تُدرج سعر الجراج وسعر المخزن كبندين منفصلين، وهما حاليًا #N/A.',
];

/** The assumptions in the language on screen. English is the source of truth. */
function tAssumptions() {
  const en = (typeof ASSUMPTIONS !== 'undefined') ? ASSUMPTIONS : [];
  if (LANG === 'en' || en.length !== ASSUMPTIONS_AR.length) return en;
  return ASSUMPTIONS_AR;
}

let LANG = DEFAULT_LANG;
try {
  const saved = localStorage.getItem(LANG_STORAGE);
  if (saved && STRINGS[saved]) LANG = saved;
} catch { /* private browsing: fall back to the default rather than break */ }

/* ?lang=en beats the stored choice FOR THIS VISIT ONLY.
 *
 * Two reasons it exists. An agent sending an offer link to an English-speaking
 * customer can pin the language rather than hoping. And it is the only way to
 * open a given language from a cold browser profile, which is how the layout
 * gets checked in both directions without clicking.
 *
 * It deliberately does NOT write to storage, and that is a fix rather than an
 * oversight. It used to, which meant opening one ?lang=en link — a link sent to
 * one English-speaking customer, or the URL used once to check the English
 * layout — silently pinned that phone to English forever. The app then came up
 * in English every time afterwards with nothing on screen explaining why, which
 * reads exactly like "the Arabic version is not working". Only a deliberate tap
 * on the switch is a preference; a link is just a link. */
try {
  const wanted = new URLSearchParams(location.search).get('lang');
  if (wanted && STRINGS[wanted]) LANG = wanted;
} catch { /* no URLSearchParams on a very old browser */ }

/** The active language code. */
function lang() { return LANG; }
function isRTL() { return STRINGS[LANG].dir === 'rtl'; }

/**
 * Translate a key, filling {placeholders} from `vars`.
 *
 * An unknown key returns the key itself rather than an empty string — a screen
 * reading "pay.delivery" is an obvious bug, whereas a blank space is one nobody
 * notices until a customer is looking at it.
 */
function t(key, vars) {
  const table = STRINGS[LANG] || STRINGS.en;
  let s = table[key];
  if (s === undefined) s = (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) =>
    (vars[name] === undefined ? m : bidiSafe(vars[name])));
}

/* Unicode isolates: LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE. */
const LRI = '⁦', PDI = '⁩';

/**
 * Stop a Latin or numeric value being re-ordered inside an Arabic sentence.
 *
 * Without this the bidirectional algorithm treats a value as part of the
 * surrounding Arabic run and moves its pieces: "خصم 20%" renders as "خصم %20",
 * "15 Aug 2026" as "Aug 2026 15", and "39.78 m²" as "m² 39.78". None of it is
 * wrong by the standard — the standard has no way to know "20%" is one atom —
 * so the value has to say so, and wrapping it in an isolate is exactly that
 * statement. Doing it here means every interpolated figure in the app is
 * covered by one rule rather than by remembering to add a CSS class each time.
 *
 * Values containing Arabic are left alone: they belong to the surrounding run.
 */
function bidiSafe(value) {
  const s = String(value);
  if (!isRTL() || /[؀-ۿ]/.test(s) || !/[0-9A-Za-z]/.test(s)) return s;
  return LRI + s + PDI;
}

/** Translate a value that came from the sheet or CONFIG. Unknown → unchanged. */
function td(kind, value) {
  if (LANG === 'en' || value == null) return value;
  const map = DATA_AR[kind];
  return (map && map[value] !== undefined) ? map[value] : value;
}

/**
 * A schedule row's label, from the structured key engine.js attaches.
 *
 * The engine still produces its English `label` and `when` strings untouched —
 * the tests assert on them and the PDF prints them — so this reads the keys
 * alongside and renders whichever language is showing. A row arriving without
 * keys falls back to its English label, so a schedule is never blank.
 */
function tRowLabel(row) {
  const k = row.labelKey;
  if (!k) return row.label;
  if (k.kind === 'down') return t('row.down');
  if (k.kind === 'maintenance') return t('row.maintenance', { pct: k.pct });
  if (k.kind === 'instalment') {
    return k.milestone
      ? t('row.instalmentMilestone', { i: k.i, n: k.n, pct: k.milestone })
      : t('row.instalment', { i: k.i, n: k.n });
  }
  return row.label;
}

/* tWhen() and tBand() lived here until 2026-08-16. The schedule no longer has
 * a Due column or a year heading row — the year is a column now, filled from
 * t('band.year') on the row the year opens. */

/**
 * Apply the current language to the document shell.
 *
 * Only the static furniture is handled here — `data-i18n` on an element swaps
 * its text, `data-i18n-attr="attr:key"` swaps an attribute. Everything the app
 * draws itself goes through t() at render time instead, because it is rebuilt
 * on every refresh anyway, so there is no live node that can be missed and left
 * in the wrong language.
 */
function applyLang() {
  const html = document.documentElement;
  html.lang = LANG;
  html.dir = STRINGS[LANG].dir;

  document.querySelectorAll('[data-i18n]').forEach((n) => {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((n) => {
    for (const pair of n.getAttribute('data-i18n-attr').split(',')) {
      const [attr, key] = pair.split(':');
      if (attr && key) n.setAttribute(attr.trim(), t(key.trim()));
    }
  });
  /* The switch shows both codes and lights the active one, so there is no
     "does this label mean where I am or where I am going?" to get wrong. Each
     segment is labelled with its own language's name in that language. */
  document.querySelectorAll('#langSw button[data-lang]').forEach((b) => {
    const code = b.getAttribute('data-lang');
    b.setAttribute('aria-pressed', String(code === LANG));
    b.title = t('lang.' + code);
    b.setAttribute('aria-label', t('lang.' + code));
  });
}

/** Switch language and redraw. `onChange` is app.js's full re-render. */
function setLang(next, onChange) {
  if (!STRINGS[next] || next === LANG) return;
  LANG = next;
  try { localStorage.setItem(LANG_STORAGE, next); } catch { /* not fatal */ }
  applyLang();
  if (typeof onChange === 'function') onChange();
}

if (typeof module !== 'undefined') {
  module.exports = { STRINGS, DATA_AR, ASSUMPTIONS_AR, t, td, lang, isRTL,
                     tRowLabel, bidiSafe };
}
