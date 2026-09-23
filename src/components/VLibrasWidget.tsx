import Script from "next/script";

export default function VLibrasWidget() {
  return (
    <Script
      id="vlibras-widget"
      src="https://vlibras.gov.br/app/vlibras-plugin.js"
      strategy="afterInteractive"
    />
  );
}