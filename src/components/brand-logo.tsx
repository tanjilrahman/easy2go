import Image from "next/image";

export function BrandLogo() {
  return (
    <Image
      src="/logo.png"
      alt="Easy2Go"
      width={118}
      height={41}
      priority
      className="h-auto w-[96px] drop-shadow-[0_8px_18px_rgba(90,67,215,0.14)] sm:w-[118px]"
    />
  );
}
