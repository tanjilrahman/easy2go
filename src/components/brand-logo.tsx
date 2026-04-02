import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-3">
      <Image
        src="/logo.png"
        alt="Easy2Go"
        width={104}
        height={36}
        priority
        className="h-auto w-[104px]"
      />
    </div>
  );
}
