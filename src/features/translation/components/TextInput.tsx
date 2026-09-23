type TextInputProps = {
  value: string;
  onChange: (text: string) => void;
};

export default function TextInput({
  value,
  onChange,
}: TextInputProps) {
  return (
    <div>
      <label
        htmlFor="input-text"
        className="mb-2 block text-sm font-medium text-zinc-300"
      >
        Texto original
      </label>

      <textarea
        id="input-text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Digite alguma coisa..."
        className="min-h-56 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500"
      />
    </div>
  );
}