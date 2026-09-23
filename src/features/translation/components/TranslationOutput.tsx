type TranslationOutputProps = {
  text: string;
};

export default function TranslationOutput({
  text,
}: TranslationOutputProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-300">
        Resultado
      </label>

      <div className="min-h-56 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-200">
        {text || (
          <span className="text-zinc-600">
            A tradução aparecerá aqui.
          </span>
        )}
      </div>
    </div>
  );
}