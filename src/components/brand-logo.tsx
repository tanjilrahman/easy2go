import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="relative h-[33px] w-[78px] sm:h-[41px] sm:w-[96px]">
      <Image
        src="/logo.png"
        alt="Easy2Go"
        fill
        priority
        sizes="(min-width: 640px) 96px, 78px"
        className="object-contain"
      />
    </div>
  );
}
