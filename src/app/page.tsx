import Translator from "@/features/translation/components/Translator";
import VLibrasWidget from "@/components/VLibrasWidget";

export default function Home() {
  return (
    <main
      className="
        relative
        min-h-screen
        overflow-x-hidden
        bg-[#06070a]
        px-4
        py-8
        text-white
        sm:px-6
        sm:py-10
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          left-1/2
          top-[-320px]
          h-[700px]
          w-[1000px]
          -translate-x-1/2
          rounded-full
          bg-[radial-gradient(circle,rgba(209,38,217,0.07),rgba(83,109,255,0.025)_42%,transparent_70%)]
          blur-3xl
        "
      />

      <div
        className="
          relative
          z-10
          mx-auto
          w-full
          max-w-6xl
        "
      >
        <Translator />
      </div>

      <VLibrasWidget />
    </main>
  );
}