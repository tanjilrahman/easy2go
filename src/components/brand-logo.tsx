import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="relative h-[40px] w-[92px] sm:h-[48px] sm:w-[112px]">
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
