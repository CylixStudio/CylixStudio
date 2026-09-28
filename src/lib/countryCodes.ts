export type CountryDial = {
  iso: string;
  dial: string;
  nameEn: string;
  nameAr: string;
};

export const COUNTRIES: readonly CountryDial[] = [
  { iso: "SA", dial: "+966", nameEn: "Saudi Arabia", nameAr: "السعودية" },
  { iso: "AE", dial: "+971", nameEn: "United Arab Emirates", nameAr: "الإمارات" },
  { iso: "KW", dial: "+965", nameEn: "Kuwait", nameAr: "الكويت" },
  { iso: "BH", dial: "+973", nameEn: "Bahrain", nameAr: "البحرين" },
  { iso: "QA", dial: "+974", nameEn: "Qatar", nameAr: "قطر" },
  { iso: "OM", dial: "+968", nameEn: "Oman", nameAr: "عُمان" },
  { iso: "YE", dial: "+967", nameEn: "Yemen", nameAr: "اليمن" },
  { iso: "IQ", dial: "+964", nameEn: "Iraq", nameAr: "العراق" },
  { iso: "JO", dial: "+962", nameEn: "Jordan", nameAr: "الأردن" },
  { iso: "PS", dial: "+970", nameEn: "Palestine", nameAr: "فلسطين" },
  { iso: "LB", dial: "+961", nameEn: "Lebanon", nameAr: "لبنان" },
  { iso: "SY", dial: "+963", nameEn: "Syria", nameAr: "سوريا" },
  { iso: "EG", dial: "+20", nameEn: "Egypt", nameAr: "مصر" },
  { iso: "SD", dial: "+249", nameEn: "Sudan", nameAr: "السودان" },
  { iso: "LY", dial: "+218", nameEn: "Libya", nameAr: "ليبيا" },
  { iso: "TN", dial: "+216", nameEn: "Tunisia", nameAr: "تونس" },
  { iso: "DZ", dial: "+213", nameEn: "Algeria", nameAr: "الجزائر" },
  { iso: "MA", dial: "+212", nameEn: "Morocco", nameAr: "المغرب" },
  { iso: "MR", dial: "+222", nameEn: "Mauritania", nameAr: "موريتانيا" },
  { iso: "SO", dial: "+252", nameEn: "Somalia", nameAr: "الصومال" },
  { iso: "DJ", dial: "+253", nameEn: "Djibouti", nameAr: "جيبوتي" },
  { iso: "KM", dial: "+269", nameEn: "Comoros", nameAr: "جزر القمر" },
  { iso: "TR", dial: "+90", nameEn: "Turkey", nameAr: "تركيا" },
  { iso: "IR", dial: "+98", nameEn: "Iran", nameAr: "إيران" },
  { iso: "IL", dial: "+972", nameEn: "Israel", nameAr: "إسرائيل" },
  { iso: "AF", dial: "+93", nameEn: "Afghanistan", nameAr: "أفغانستان" },
  { iso: "PK", dial: "+92", nameEn: "Pakistan", nameAr: "باكستان" },
  { iso: "IN", dial: "+91", nameEn: "India", nameAr: "الهند" },
  { iso: "BD", dial: "+880", nameEn: "Bangladesh", nameAr: "بنغلاديش" },
  { iso: "LK", dial: "+94", nameEn: "Sri Lanka", nameAr: "سريلانكا" },
  { iso: "NP", dial: "+977", nameEn: "Nepal", nameAr: "نيبال" },
  { iso: "CN", dial: "+86", nameEn: "China", nameAr: "الصين" },
  { iso: "JP", dial: "+81", nameEn: "Japan", nameAr: "اليابان" },
  { iso: "KR", dial: "+82", nameEn: "South Korea", nameAr: "كوريا الجنوبية" },
  { iso: "TW", dial: "+886", nameEn: "Taiwan", nameAr: "تايوان" },
  { iso: "HK", dial: "+852", nameEn: "Hong Kong", nameAr: "هونغ كونغ" },
  { iso: "SG", dial: "+65", nameEn: "Singapore", nameAr: "سنغافورة" },
  { iso: "MY", dial: "+60", nameEn: "Malaysia", nameAr: "ماليزيا" },
  { iso: "ID", dial: "+62", nameEn: "Indonesia", nameAr: "إندونيسيا" },
  { iso: "TH", dial: "+66", nameEn: "Thailand", nameAr: "تايلاند" },
  { iso: "VN", dial: "+84", nameEn: "Vietnam", nameAr: "فيتنام" },
  { iso: "PH", dial: "+63", nameEn: "Philippines", nameAr: "الفلبين" },
  { iso: "AU", dial: "+61", nameEn: "Australia", nameAr: "أستراليا" },
  { iso: "NZ", dial: "+64", nameEn: "New Zealand", nameAr: "نيوزيلندا" },
  { iso: "US", dial: "+1", nameEn: "United States", nameAr: "الولايات المتحدة" },
  { iso: "CA", dial: "+1", nameEn: "Canada", nameAr: "كندا" },
  { iso: "MX", dial: "+52", nameEn: "Mexico", nameAr: "المكسيك" },
  { iso: "BR", dial: "+55", nameEn: "Brazil", nameAr: "البرازيل" },
  { iso: "AR", dial: "+54", nameEn: "Argentina", nameAr: "الأرجنتين" },
  { iso: "CL", dial: "+56", nameEn: "Chile", nameAr: "تشيلي" },
  { iso: "CO", dial: "+57", nameEn: "Colombia", nameAr: "كولومبيا" },
  { iso: "PE", dial: "+51", nameEn: "Peru", nameAr: "بيرو" },
  { iso: "GB", dial: "+44", nameEn: "United Kingdom", nameAr: "المملكة المتحدة" },
  { iso: "IE", dial: "+353", nameEn: "Ireland", nameAr: "أيرلندا" },
  { iso: "FR", dial: "+33", nameEn: "France", nameAr: "فرنسا" },
  { iso: "DE", dial: "+49", nameEn: "Germany", nameAr: "ألمانيا" },
  { iso: "IT", dial: "+39", nameEn: "Italy", nameAr: "إيطاليا" },
  { iso: "ES", dial: "+34", nameEn: "Spain", nameAr: "إسبانيا" },
  { iso: "PT", dial: "+351", nameEn: "Portugal", nameAr: "البرتغال" },
  { iso: "NL", dial: "+31", nameEn: "Netherlands", nameAr: "هولندا" },
  { iso: "BE", dial: "+32", nameEn: "Belgium", nameAr: "بلجيكا" },
  { iso: "CH", dial: "+41", nameEn: "Switzerland", nameAr: "سويسرا" },
  { iso: "AT", dial: "+43", nameEn: "Austria", nameAr: "النمسا" },
  { iso: "SE", dial: "+46", nameEn: "Sweden", nameAr: "السويد" },
  { iso: "NO", dial: "+47", nameEn: "Norway", nameAr: "النرويج" },
  { iso: "DK", dial: "+45", nameEn: "Denmark", nameAr: "الدنمارك" },
  { iso: "FI", dial: "+358", nameEn: "Finland", nameAr: "فنلندا" },
  { iso: "PL", dial: "+48", nameEn: "Poland", nameAr: "بولندا" },
  { iso: "CZ", dial: "+420", nameEn: "Czechia", nameAr: "التشيك" },
  { iso: "HU", dial: "+36", nameEn: "Hungary", nameAr: "المجر" },
  { iso: "RO", dial: "+40", nameEn: "Romania", nameAr: "رومانيا" },
  { iso: "GR", dial: "+30", nameEn: "Greece", nameAr: "اليونان" },
  { iso: "UA", dial: "+380", nameEn: "Ukraine", nameAr: "أوكرانيا" },
  { iso: "RU", dial: "+7", nameEn: "Russia", nameAr: "روسيا" },
  { iso: "KZ", dial: "+7", nameEn: "Kazakhstan", nameAr: "كازاخستان" },
  { iso: "AZ", dial: "+994", nameEn: "Azerbaijan", nameAr: "أذربيجان" },
  { iso: "AM", dial: "+374", nameEn: "Armenia", nameAr: "أرمينيا" },
  { iso: "GE", dial: "+995", nameEn: "Georgia", nameAr: "جورجيا" },
  { iso: "ZA", dial: "+27", nameEn: "South Africa", nameAr: "جنوب أفريقيا" },
  { iso: "NG", dial: "+234", nameEn: "Nigeria", nameAr: "نيجيريا" },
  { iso: "KE", dial: "+254", nameEn: "Kenya", nameAr: "كينيا" },
  { iso: "GH", dial: "+233", nameEn: "Ghana", nameAr: "غانا" },
  { iso: "ET", dial: "+251", nameEn: "Ethiopia", nameAr: "إثيوبيا" },
] as const;

export function countryFlag(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2)
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function countryByIso(iso: string): CountryDial {
  return COUNTRIES.find((country) => country.iso === iso) ?? COUNTRIES[0]!;
}

export function searchCountries(query: string): CountryDial[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return [...COUNTRIES];
  const dialNeedle = needle.startsWith("+") ? needle : needle.replace(/^\+/, "");
  return COUNTRIES.filter((country) => {
    const dial = country.dial.toLowerCase();
    return (
      country.nameEn.toLowerCase().replace(/\s+/g, "").includes(needle) ||
      country.nameAr.replace(/\s+/g, "").includes(query.trim()) ||
      country.iso.toLowerCase().includes(needle) ||
      dial.includes(needle) ||
      dial.slice(1).includes(dialNeedle)
    );
  });
}

export function splitStoredPhone(phone: string | null | undefined): { iso: string; national: string } {
  const normalized = phone ? phone.replace(/[\s()-]/g, "") : "";
  if (!normalized.startsWith("+")) return { iso: "SA", national: "" };
  const match = [...COUNTRIES]
    .filter((country) => normalized.startsWith(country.dial))
    .sort((a, b) => b.dial.length - a.dial.length)[0];
  if (!match) return { iso: "SA", national: "" };
  return { iso: match.iso, national: normalized.slice(match.dial.length).replace(/^0+/, "") };
}
