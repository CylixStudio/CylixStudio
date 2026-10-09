export type PublicBuiltinCommand = {
  trigger: string;
  description: { ar: string; en: string };
};

/** Short viewer-facing descriptions. Not the server implementation. */
export const PUBLIC_BUILTIN_COMMANDS: PublicBuiltinCommand[] = [
  {
    trigger: "!commands",
    description: {
      ar: "يرسل رابط صفحة الأوامر في الشات. يعمل أيضاً مع !الأوامر.",
      en: "Replies with the public commands page. !الأوامر does the same.",
    },
  },
  {
    trigger: "!followage",
    description: {
      ar: "يعرض منذ متى يتابع المشاهد القناة، إن وفرته المنصة.",
      en: "Shows how long the viewer has followed, when the platform shares it.",
    },
  },
  {
    trigger: "!lurk",
    description: {
      ar: "يرد بتحية لمن يشاهد بهدوء.",
      en: "Replies with a short lurk greeting.",
    },
  },
  {
    trigger: "!so",
    description: {
      ar: "يشجع قناة تكتب اسمها بعد الأمر.",
      en: "Shoutouts the channel name written after the command.",
    },
  },
  {
    trigger: "!welcome",
    description: {
      ar: "يرحب بالمشاهد في البث.",
      en: "Welcomes the viewer to the stream.",
    },
  },
  {
    trigger: "!spin",
    description: {
      ar: "يدور عجلة الجوائز. !wheel و !عجلة نفس الأمر. قد يخصم نقاط الولاء.",
      en: "Spins the prize wheel. !wheel and !عجلة do the same. It may spend loyalty points.",
    },
  },
  {
    trigger: "!buy",
    description: {
      ar: "يشتري عنصراً من متجر الولاء إن كانت النقاط كافية.",
      en: "Buys a loyalty shop item when the viewer has enough points.",
    },
  },
];
