import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="relative h-[33px] w-[96px] sm:h-[41px] sm:w-[118px]">
      <Image
        src="/logo.png"
        alt="Easy2Go"
        fill
        priority
        sizes="(min-width: 640px) 118px, 96px"
        className="object-contain drop-shadow-[0_8px_18px_rgba(90,67,215,0.14)]"
      />
    </div>
  );
}
