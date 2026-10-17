// Documentation catalog entries used by the existing LanguageProvider.
// Technical tokens (command syntax, trigger names, variable names, URLs, code
// examples, API names, platform names) are intentionally identical in both
// languages and are NOT translated — only the surrounding explanation is.
export const DOCS_AR = {
  // ---- Page chrome / sidebar / search ----
  "docs.page.title": "توثيق CylixStudio",
  "docs.sections.button": "الأقسام",
  "docs.sidebar.hub": "مركز التوثيق",
  "docs.sidebar.back": "العودة إلى الاستوديو",
  "docs.search.aria": "بحث في التوثيق",
  "docs.search.placeholder": "ابحث في التوثيق...",
  "docs.search.startHere": "ابدأ هنا",
  "docs.close": "إغلاق",
  "docs.group.commands": "الأوامر",
  "docs.group.streaming": "البث",
  "docs.group.account": "الحساب",
  "docs.copy": "نسخ",
  "docs.copied": "تم النسخ",
  "docs.code.example": "مثال",
  "docs.notice.defaultTitle": "ملاحظة مهمة",
  "docs.table.command": "الأمر",
  "docs.table.variable": "المتغير",
  "docs.table.purpose": "الوظيفة",
  "docs.table.usage": "الاستخدام / مثال",
  "docs.table.access": "الصلاحية",
  "docs.table.platforms": "المنصات",
  "docs.table.pro": "Pro",
  "docs.table.no": "لا",

  // ---- Sidebar nav titles ----
  "docs.nav.intro": "مقدمة عن CylixStudio",
  "docs.nav.connect": "البداية وربط المنصات",
  "docs.nav.defaultCommands": "الأوامر الافتراضية",
  "docs.nav.customCommands": "الأوامر المخصصة",
  "docs.nav.points": "نظام النقاط",
  "docs.nav.variables": "المتغيرات",
  "docs.nav.alerts": "التنبيهات Alerts",
  "docs.nav.widgets": "الودجات Widgets",
  "docs.nav.subathon": "السابثون Subathon",
  "docs.nav.markPoints": "ميزة Mark Point",
  "docs.nav.timers": "مؤقتات الرسائل",
  "docs.nav.account": "إعدادات الحساب والاشتراك",
  "docs.nav.faq": "الأسئلة الشائعة",

  // ---- Reusable table access levels ----
  "docs.access.everyone": "الجميع",
  "docs.access.perSettings": "حسب الإعداد",
  "docs.access.broadcasterDefault": "Broadcaster افتراضيًا",
  "docs.access.modBroadcaster": "Moderator / Broadcaster",
  "docs.access.staffAllowlist": "Staff أو allowlist",
  "docs.access.dash": "—",

  // ---- Default command row purposes ----
  "docs.purpose.commandList": "يعرض رابط قائمة الأوامر.",
  "docs.purpose.followage": "يعرض مدة المتابعة عند توفرها.",
  "docs.purpose.lurk": "يرسل رسالة lurk.",
  "docs.purpose.shoutout": "يعرض shoutout للمستخدم.",
  "docs.purpose.welcome": "يرسل ترحيبًا.",
  "docs.purpose.pointsShow": "يعرض رصيد النقاط.",
  "docs.purpose.pointsAdd": "يضيف نقاطًا.",
  "docs.purpose.pointsRemove": "يخصم نقاطًا.",

  // ---- Variable rows ----
  "docs.var.sender.purpose": "اسم مرسل الأمر.",
  "docs.var.sender.usage": "أهلًا {{sender.username}}",
  "docs.var.senderUrl.purpose": "رابط ملف المرسل.",
  "docs.var.param.purpose": "النص بعد الأمر.",
  "docs.var.param.usage": "!hello أحمد",
  "docs.var.tagged.purpose": "المستخدم في الوسيط.",
  "docs.var.streamTitle.purpose": "عنوان البث.",
  "docs.var.streamCategory.purpose": "تصنيف البث.",
  "docs.var.streamViewers.purpose": "عدد المشاهدين.",
  "docs.var.random.purpose": "رقم عشوائي ضمن نطاق.",

  // ---- Mark Point rows ----
  "docs.mark.start.purpose": "يبدأ Mark مع ملاحظة اختيارية.",
  "docs.mark.start.usage": "!mark لقطة رائعة",
  "docs.mark.end.purpose": "يغلق أحدث Mark مفتوح.",
  "docs.mark.end.usage": "!emark نهاية اللقطة",

  // ---- intro ----
  "docs.intro.title": "توثيق CylixStudio",
  "docs.intro.description": "مرجع عملي لإعداد أدوات البث والأوامر والـ overlays في CylixStudio.",
  "docs.intro.badge": "ابدأ من هنا",
  "docs.intro.heading": "ابنِ تدفق بث مرتبًا، خطوة بخطوة.",
  "docs.intro.body": "هذه الصفحة توثق ما هو متاح في الاستوديو الآن. استخدم القائمة أو البحث للوصول السريع.",
  "docs.intro.cta": "ربط منصات البث",
  "docs.intro.notice": "الوثائق لا تفترض توفر ميزة غير موجودة؛ القيود الحالية موضحة داخل القسم.",

  // ---- connect ----
  "docs.connect.title": "البداية وربط منصات البث",
  "docs.connect.description": "اربط حساب البث أولًا حتى يتمكن الاستوديو من إدارة أدوات القناة.",
  "docs.connect.step1": "سجّل الدخول إلى CylixStudio.",
  "docs.connect.step2": "افتح الإعدادات واستخدم خيارات الربط المتاحة.",
  "docs.connect.step3": "تحقق من حالة المنصة قبل تفعيل أو اختبار أي أداة.",
  "docs.connect.step4": "اختر المنصة عند إعداد أمر أو مؤقت.",
  "docs.connect.noticeTitle": "المنصات",
  "docs.connect.notice": "الأوامر المخصصة والإعدادات الافتراضية تدعم Kick وTwitch. النقاط وMark Point لها تنفيذ دردشة على Kick.",

  // ---- default commands ----
  "docs.defaultCommands.title": "الأوامر الافتراضية",
  "docs.defaultCommands.description": "مجموعة الأوامر المحجوزة في النظام. لا تستخدم أسماءها لإنشاء أمر مخصص.",
  "docs.defaultCommands.noticeTitle": "حالة التنفيذ",
  "docs.defaultCommands.notice": "addcom وdelcom وeditcom وlevel وpromo وshop موجودة كإعدادات، لكنها ليست معالجات دردشة مباشرة حاليًا.",
  "docs.defaultCommands.shoutoutLabel": "Shoutout",

  // ---- custom commands ----
  "docs.customCommands.title": "الأوامر المخصصة",
  "docs.customCommands.description": "أنشئ ردًا تلقائيًا باسمك ونطاق منصاتك دون التعارض مع الأوامر المحجوزة.",
  "docs.customCommands.step1": "أنشئ أمرًا جديدًا.",
  "docs.customCommands.step2": "اكتب الاسم بلا بادئة؛ استخدم الافتراضية أو ! أو # أو ?.",
  "docs.customCommands.step3": "أدخل الرد وأضف المتغيرات عند الحاجة.",
  "docs.customCommands.step4": "عيّن المنصات والأدوار والـ cooldown ثم فعّله.",
  "docs.customCommands.step5": "اختبر الـ trigger الناتج في الدردشة.",
  "docs.customCommands.codeLabel": "إعداد مقترح",
  "docs.customCommands.code": "الاسم: discord\nالبادئة: !\nالرد: أهلًا {{sender.username}}\nالمنصات: Kick, Twitch\nالأدوار: Everyone",
  "docs.customCommands.notice": "الاسم يقبل العربية ويُقصّ إلى 32 حرفًا. الرد حتى 480 حرفًا والـ cooldown من 0 إلى 3600 ثانية.",

  // ---- points ----
  "docs.points.title": "نظام النقاط",
  "docs.points.description": "اعرض رصيد النقاط أو أدره من دردشة Kick ضمن صلاحيات واضحة.",
  "docs.points.codeLabel": "إضافة نقاط",
  "docs.points.noticeTitle": "قاعدة الأمان",
  "docs.points.notice": "الخصم محصور على Moderator أو Broadcaster. العدد المقبول من 1 إلى 1,000,000.",

  // ---- variables ----
  "docs.variables.title": "المتغيرات",
  "docs.variables.description": "ضع المتغيرات داخل ردود الأوامر ليُستبدل بها سياق الرسالة والبث وقت التنفيذ.",
  "docs.variables.codeLabel": "رد قابل للنسخ",
  "docs.variables.code": "أهلًا {{sender.username}}! عنوان البث: {{stream.title}}",
  "docs.variables.noticeBefore": "تُقبل الصيغة القصيرة ",
  "docs.variables.noticeAfter": " للحقول المدعومة. المتغير غير المعروف أو غير المتاح يُستبدل بقيمة فارغة.",

  // ---- alerts ----
  "docs.alerts.title": "التنبيهات Alerts",
  "docs.alerts.description": "أنشئ التنبيه من لوحة Alerts ثم استخدم معاينة واختبارًا قبل وضع الـ overlay في OBS.",
  "docs.alerts.step1": "أنشئ أو افتح تنبيهًا.",
  "docs.alerts.step2": "اضبط المظهر والوسائط في المحرر.",
  "docs.alerts.step3": "استخدم اختبار التنبيه.",
  "docs.alerts.step4": "انسخ رابط overlay وأضفه كـ Browser Source في OBS.",
  "docs.alerts.notice": "التنبيهات حاليًا ضمن الوصول المبكر للمسؤولين فقط. تعتمد على أحداث وربط المنصات المتاحين لحسابك. اختبر دائمًا قبل البث.",

  // ---- widgets ----
  "docs.widgets.title": "الودجات Widgets",
  "docs.widgets.description": "أنشئ widget، عدّل إعداداته، ثم أضف رابط overlay الناتج كمصدر متصفح.",
  "docs.widgets.step1": "اختر widget متاحًا.",
  "docs.widgets.step2": "عدّل المحتوى والتخطيط.",
  "docs.widgets.step3": "انسخ رابط overlay.",
  "docs.widgets.step4": "الصقه في OBS Browser Source.",
  "docs.widgets.noticeTitle": "أمثلة موجودة",
  "docs.widgets.notice": "تتضمن الودجات أهدافًا مخصصة للتبرعات والمتابعين والاشتراكات أو هدفًا يدويًا.",

  // ---- subathon ----
  "docs.subathon.title": "السابثون Subathon",
  "docs.subathon.description": "استخدم واجهة التحكم والقواعد والـ overlay لإدارة مؤقت Subathon من الاستوديو.",
  "docs.subathon.body": "لكل Subathon صفحات تحكم وقواعد وoverlay. أنشئه من لوحة الأدوات، ثم اضبط القواعد المتاحة وأضف رابط overlay إلى OBS.",
  "docs.subathon.notice": "توثيق التفاصيل يتبع الحقول الظاهرة في واجهة Subathon الحالية.",

  // ---- mark points ----
  "docs.markPoints.title": "ميزة Mark Point",
  "docs.markPoints.description": "سجل مقطعًا زمنيًا أثناء البث لتراجعه أو تشاركه لاحقًا.",
  "docs.markPoints.noticeBefore": "يقبل النظام أيضًا البادئة ",
  "docs.markPoints.noticeAfter": ". الأسماء في allowlist والمنسقون ومالك القناة فقط يمكنهم تشغيل الأمر.",

  // ---- timers ----
  "docs.timers.title": "مؤقتات الرسائل",
  "docs.timers.description": "أرسل رسالة دورية في المنصات التي تختارها دون إدخالها كل مرة.",
  "docs.timers.step1": "أضف مؤقتًا واكتب الرسالة.",
  "docs.timers.step2": "اختر الفاصل بالدقائق والمنصات.",
  "docs.timers.step3": "فعّل المؤقت.",
  "docs.timers.codeLabel": "مثال رسالة",
  "docs.timers.code": "تابع جدول البث وروابطنا من لوحة CylixStudio ✦",
  "docs.timers.notice": "الفاصل من دقيقة إلى 1440 دقيقة والرسالة حتى 480 حرفًا.",

  // ---- account ----
  "docs.account.title": "إعدادات الحساب والاشتراك",
  "docs.account.description": "استخدم الإعدادات لإدارة حسابك وروابط المنصات، وافتح الاشتراك لمراجعة الخطة الحالية.",
  "docs.account.body": "تختلف مزايا الخطة حسب صفحة Subscription لحسابك؛ عند ظهور قيد خطة في الواجهة، اتبعه من هناك بدل افتراض أن ميزة ما تحتاج Pro.",

  // ---- faq ----
  "docs.faq.title": "الأسئلة الشائعة",
  "docs.faq.description": "إجابات قصيرة لأكثر خطوات البداية شيوعًا.",
  "docs.faq.q1": "لماذا لا يعمل الأمر؟",
  "docs.faq.a1": "تحقق من أنه مفعّل، وأن المنصة مطابقة، وأن الاسم ليس محجوزًا، وأن المستخدم يملك الدور المطلوب.",
  "docs.faq.q2": "كيف أضيف overlay إلى OBS؟",
  "docs.faq.a2": "انسخ الرابط من الأداة نفسها، ثم أضفه في OBS كمصدر Browser Source.",
  "docs.faq.q3": "هل يمكنني نسخ الأمثلة؟",
  "docs.faq.a3": "نعم. يظهر زر نسخ في كل مثال ويؤكد نجاح النسخ داخل الزر.",
} as const;

export const DOCS_EN = {
  // ---- Page chrome / sidebar / search ----
  "docs.page.title": "CylixStudio Documentation",
  "docs.sections.button": "Sections",
  "docs.sidebar.hub": "Documentation hub",
  "docs.sidebar.back": "Back to the studio",
  "docs.search.aria": "Search the documentation",
  "docs.search.placeholder": "Search the documentation...",
  "docs.search.startHere": "Start here",
  "docs.close": "Close",
  "docs.group.commands": "Commands",
  "docs.group.streaming": "Streaming",
  "docs.group.account": "Account",
  "docs.copy": "Copy",
  "docs.copied": "Copied",
  "docs.code.example": "Example",
  "docs.notice.defaultTitle": "Important note",
  "docs.table.command": "Command",
  "docs.table.variable": "Variable",
  "docs.table.purpose": "Purpose",
  "docs.table.usage": "Usage / example",
  "docs.table.access": "Permission",
  "docs.table.platforms": "Platforms",
  "docs.table.pro": "Pro",
  "docs.table.no": "No",

  // ---- Sidebar nav titles ----
  "docs.nav.intro": "Introduction to CylixStudio",
  "docs.nav.connect": "Getting started & connecting platforms",
  "docs.nav.defaultCommands": "Default commands",
  "docs.nav.customCommands": "Custom commands",
  "docs.nav.points": "Points system",
  "docs.nav.variables": "Variables",
  "docs.nav.alerts": "Alerts",
  "docs.nav.widgets": "Widgets",
  "docs.nav.subathon": "Subathon",
  "docs.nav.markPoints": "Mark Point",
  "docs.nav.timers": "Message timers",
  "docs.nav.account": "Account & subscription settings",
  "docs.nav.faq": "FAQ",

  // ---- Reusable table access levels ----
  "docs.access.everyone": "Everyone",
  "docs.access.perSettings": "Per settings",
  "docs.access.broadcasterDefault": "Broadcaster by default",
  "docs.access.modBroadcaster": "Moderator / Broadcaster",
  "docs.access.staffAllowlist": "Staff or allowlist",
  "docs.access.dash": "—",

  // ---- Default command row purposes ----
  "docs.purpose.commandList": "Shows the command list link.",
  "docs.purpose.followage": "Shows the follow duration when available.",
  "docs.purpose.lurk": "Sends a lurk message.",
  "docs.purpose.shoutout": "Shouts out a user.",
  "docs.purpose.welcome": "Sends a welcome.",
  "docs.purpose.pointsShow": "Shows the points balance.",
  "docs.purpose.pointsAdd": "Adds points.",
  "docs.purpose.pointsRemove": "Removes points.",

  // ---- Variable rows ----
  "docs.var.sender.purpose": "The command sender's name.",
  "docs.var.sender.usage": "Hi {{sender.username}}",
  "docs.var.senderUrl.purpose": "The sender's profile link.",
  "docs.var.param.purpose": "The text after the command.",
  "docs.var.param.usage": "!hello Ahmad",
  "docs.var.tagged.purpose": "The mentioned user.",
  "docs.var.streamTitle.purpose": "The stream title.",
  "docs.var.streamCategory.purpose": "The stream category.",
  "docs.var.streamViewers.purpose": "The viewer count.",
  "docs.var.random.purpose": "A random number within a range.",

  // ---- Mark Point rows ----
  "docs.mark.start.purpose": "Starts a Mark with an optional note.",
  "docs.mark.start.usage": "!mark great clip",
  "docs.mark.end.purpose": "Closes the newest open Mark.",
  "docs.mark.end.usage": "!emark end of clip",

  // ---- intro ----
  "docs.intro.title": "CylixStudio Documentation",
  "docs.intro.description": "A practical reference for setting up streaming tools, commands, and overlays in CylixStudio.",
  "docs.intro.badge": "Start here",
  "docs.intro.heading": "Build a tidy stream setup, step by step.",
  "docs.intro.body": "This page documents what the studio offers right now. Use the menu or search to jump quickly.",
  "docs.intro.cta": "Connect streaming platforms",
  "docs.intro.notice": "These docs never assume a feature that isn't available; current limits are noted inside each section.",

  // ---- connect ----
  "docs.connect.title": "Getting started & connecting platforms",
  "docs.connect.description": "Connect your streaming account first so the studio can manage your channel tools.",
  "docs.connect.step1": "Sign in to CylixStudio.",
  "docs.connect.step2": "Open Settings and use the available connection options.",
  "docs.connect.step3": "Check the platform status before enabling or testing any tool.",
  "docs.connect.step4": "Choose the platform when setting up a command or timer.",
  "docs.connect.noticeTitle": "Platforms",
  "docs.connect.notice": "Custom commands and default settings support Kick and Twitch. Points and Mark Point have a chat implementation on Kick.",

  // ---- default commands ----
  "docs.defaultCommands.title": "Default commands",
  "docs.defaultCommands.description": "A set of commands reserved by the system. Don't reuse their names for custom commands.",
  "docs.defaultCommands.noticeTitle": "Implementation status",
  "docs.defaultCommands.notice": "addcom, delcom, editcom, level, promo, and shop exist as settings, but they are not direct chat handlers right now.",
  "docs.defaultCommands.shoutoutLabel": "Shoutout",

  // ---- custom commands ----
  "docs.customCommands.title": "Custom commands",
  "docs.customCommands.description": "Create an automatic reply with your own name and platform scope without clashing with reserved commands.",
  "docs.customCommands.step1": "Create a new command.",
  "docs.customCommands.step2": "Type the name without a prefix; use the default, !, #, or ?.",
  "docs.customCommands.step3": "Enter the reply and add variables where needed.",
  "docs.customCommands.step4": "Set the platforms, roles, and cooldown, then enable it.",
  "docs.customCommands.step5": "Test the resulting trigger in chat.",
  "docs.customCommands.codeLabel": "Suggested setup",
  "docs.customCommands.code": "Name: discord\nPrefix: !\nReply: Hi {{sender.username}}\nPlatforms: Kick, Twitch\nRoles: Everyone",
  "docs.customCommands.notice": "The name accepts Arabic and is trimmed to 32 characters. The reply is up to 480 characters and the cooldown is 0 to 3600 seconds.",

  // ---- points ----
  "docs.points.title": "Points system",
  "docs.points.description": "View or manage the points balance from Kick chat within clear permissions.",
  "docs.points.codeLabel": "Adding points",
  "docs.points.noticeTitle": "Safety rule",
  "docs.points.notice": "Removal is limited to Moderator or Broadcaster. The accepted amount is 1 to 1,000,000.",

  // ---- variables ----
  "docs.variables.title": "Variables",
  "docs.variables.description": "Place variables inside command replies so message and stream context replaces them at run time.",
  "docs.variables.codeLabel": "A reply you can copy",
  "docs.variables.code": "Hi {{sender.username}}! Stream title: {{stream.title}}",
  "docs.variables.noticeBefore": "The short form ",
  "docs.variables.noticeAfter": " is accepted for supported fields. Unknown or unavailable variables are replaced with an empty value.",

  // ---- alerts ----
  "docs.alerts.title": "Alerts",
  "docs.alerts.description": "Create the alert from the Alerts panel, then use preview and test before putting the overlay into OBS.",
  "docs.alerts.step1": "Create or open an alert.",
  "docs.alerts.step2": "Adjust the appearance and media in the editor.",
  "docs.alerts.step3": "Use the alert test.",
  "docs.alerts.step4": "Copy the overlay link and add it as a Browser Source in OBS.",
  "docs.alerts.notice": "Alerts are currently in Early Access for administrators only. They rely on events and platform connections available to your account. Always test before going live.",

  // ---- widgets ----
  "docs.widgets.title": "Widgets",
  "docs.widgets.description": "Create a widget, edit its settings, then add the resulting overlay link as a browser source.",
  "docs.widgets.step1": "Pick an available widget.",
  "docs.widgets.step2": "Edit the content and layout.",
  "docs.widgets.step3": "Copy the overlay link.",
  "docs.widgets.step4": "Paste it into an OBS Browser Source.",
  "docs.widgets.noticeTitle": "Available examples",
  "docs.widgets.notice": "Widgets include custom goals for donations, followers, and subscriptions, or a manual goal.",

  // ---- subathon ----
  "docs.subathon.title": "Subathon",
  "docs.subathon.description": "Use the control panel, rules, and overlay to manage a Subathon timer from the studio.",
  "docs.subathon.body": "Each Subathon has control, rules, and overlay pages. Create it from the tools panel, then set the available rules and add the overlay link to OBS.",
  "docs.subathon.notice": "Detailed documentation follows the fields shown in the current Subathon interface.",

  // ---- mark points ----
  "docs.markPoints.title": "Mark Point",
  "docs.markPoints.description": "Record a timestamp during the stream to review or share later.",
  "docs.markPoints.noticeBefore": "The system also accepts the ",
  "docs.markPoints.noticeAfter": ". Only allowlisted names, editors, and the channel owner can run the command.",

  // ---- timers ----
  "docs.timers.title": "Message timers",
  "docs.timers.description": "Send a periodic message on the platforms you choose without typing it each time.",
  "docs.timers.step1": "Add a timer and type the message.",
  "docs.timers.step2": "Choose the interval in minutes and the platforms.",
  "docs.timers.step3": "Enable the timer.",
  "docs.timers.codeLabel": "Message example",
  "docs.timers.code": "Follow our stream schedule and links from the CylixStudio panel ✦",
  "docs.timers.notice": "The interval is 1 to 1440 minutes and the message is up to 480 characters.",

  // ---- account ----
  "docs.account.title": "Account & subscription settings",
  "docs.account.description": "Use Settings to manage your account and platform links, and open Subscription to review your current plan.",
  "docs.account.body": "Plan features vary by your account's Subscription page; when a plan limit appears in the interface, follow it from there instead of assuming a feature needs Pro.",

  // ---- faq ----
  "docs.faq.title": "FAQ",
  "docs.faq.description": "Short answers to the most common starting steps.",
  "docs.faq.q1": "Why doesn't the command work?",
  "docs.faq.a1": "Check that it's enabled, the platform matches, the name isn't reserved, and the user has the required role.",
  "docs.faq.q2": "How do I add an overlay to OBS?",
  "docs.faq.a2": "Copy the link from the tool itself, then add it in OBS as a Browser Source.",
  "docs.faq.q3": "Can I copy the examples?",
  "docs.faq.a3": "Yes. A copy button appears on each example and confirms a successful copy inside the button.",
} as const;
