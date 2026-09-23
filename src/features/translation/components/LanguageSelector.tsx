import { languages } from "../data/languages";

type LanguageSelectorProps = {
  label: string;
  value: string;
  onChange: (languageCode: string) => void;
};

export default function LanguageSelector({
  label,
  value,
  onChange,
}: LanguageSelectorProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-zinc-500"
      >
        {languages.map((language) => (
          <option
            key={language.code}
            value={language.code}
          >
            {language.name}
          </option>
        ))}
      </select>
    </div>
  );
}