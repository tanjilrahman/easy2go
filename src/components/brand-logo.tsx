import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="relative h-[32px] w-[76px] sm:h-[38px] sm:w-[92px]">
      <Image
        src="/logo.png"
        alt="Easy2Go"
        fill
        priority
        sizes="(min-width: 640px) 92px, 76px"
        className="object-contain"
      />
    </div>
  );
}
